"""Pruebas contra MySQL real. Requieren una BD cuyo nombre termine en _test.

Inicializarla con `python -m app.setup` antes de ejecutar pytest.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from io import BytesIO
from uuid import uuid4
import jwt
import pymysql
import pytest
from fastapi.testclient import TestClient
from openpyxl import load_workbook
from app.config import database_options, jwt_secret
from app.main import app


@pytest.fixture(scope='module')
def client():
    if not os.getenv('DB_NAME', '').endswith('_test'):
        pytest.skip('Se requiere DB_NAME con sufijo _test para aislar las pruebas')
    with TestClient(app) as client:
        yield client


@pytest.fixture(scope='module')
def auth(client):
    response = client.post('/api/auth/login', json={'email': os.environ['ADMIN_EMAIL'], 'password': os.environ['ADMIN_PASSWORD']})
    assert response.status_code == 200, response.text
    return {'Authorization': 'Bearer ' + response.json()['token']}


@pytest.fixture
def data(client, auth):
    product = client.post('/api/productos', headers=auth, json={
        'nombre': 'Producto ' + uuid4().hex[:8], 'marca': 'Prueba', 'costo': '5.00', 'precio': '10.00', 'stock': 20})
    customer = client.post('/api/clientes', headers=auth, json={'nombre': 'Cliente ' + uuid4().hex[:8], 'email': 'cliente@example.com'})
    assert product.status_code == customer.status_code == 201
    return product.json(), customer.json()


def query(sql, args=()):
    connection = pymysql.connect(**database_options())
    try:
        with connection.cursor(pymysql.cursors.DictCursor) as c:
            c.execute(sql, args)
            return c.fetchall()
    finally:
        connection.close()


def payload(data, method='Efectivo', **extra):
    p, c = data
    return dict(cliente_id=c['id'], metodo_pago=method, productos=[{'producto_id': p['id'], 'cantidad': 2}], **extra)


def test_authentication_and_roles(client, auth):
    assert client.get('/api/productos').status_code == 401
    assert client.post('/api/auth/login', json={'email': os.environ['ADMIN_EMAIL'], 'password': 'incorrecta'}).status_code == 401
    expired = jwt.encode({'sub': '1', 'iat': datetime.now(timezone.utc)-timedelta(days=2),
                         'exp': datetime.now(timezone.utc)-timedelta(days=1)}, jwt_secret(), algorithm='HS256')
    assert client.get('/api/productos', headers={'Authorization': f'Bearer {expired}'}).status_code == 401
    employee = client.post('/api/auth/login', json={'email': os.environ['EMPLOYEE_EMAIL'], 'password': os.environ['EMPLOYEE_PASSWORD']})
    assert employee.status_code == 200
    headers = {'Authorization': 'Bearer ' + employee.json()['token']}
    assert client.get('/api/productos', headers=headers).status_code == 200
    assert client.get('/api/reportes/ventas', headers=headers).status_code == 403
    assert client.post('/api/productos', headers=headers, json={'nombre': 'X', 'marca': 'Y', 'costo': 1, 'precio': 2, 'stock': 1}).status_code == 403
    user = client.post('/api/administracion/usuarios', headers=auth, json={'nombre': 'Temporal', 'email': uuid4().hex+'@example.com', 'password': 'una-clave-segura'}).json()
    token = client.post('/api/auth/login', json={'email': user['email'], 'password': 'una-clave-segura'}).json()['token']
    assert client.put(f'/api/administracion/usuarios/{user["id"]}', headers=auth, json={'nombre': 'Temporal', 'rol': 'EMPLEADO', 'activo': False}).status_code == 200
    assert client.get('/api/productos', headers={'Authorization': f'Bearer {token}'}).status_code == 401


def test_crud_and_validation(client, auth, data):
    p, c = data
    url = f'/api/productos/{p["id"]}'
    for stock in (-1, 1.5):
        assert client.put(url, headers=auth, json={**p, 'stock': stock}).status_code == 422
    assert client.post('/api/clientes', headers=auth, json={'nombre': ' ', 'email': 'mal'}).status_code == 422
    assert client.put(url, headers=auth, json={**p, 'precio': '12.50', 'stock': 22}).status_code == 200
    assert client.put(f'/api/clientes/{c["id"]}', headers=auth, json={'nombre': 'Modificado', 'email': 'modificado@example.com'}).status_code == 200
    assert client.delete(url, headers=auth).status_code == 200
    assert client.delete(f'/api/clientes/{c["id"]}', headers=auth).status_code == 200
    assert client.delete(url, headers=auth).status_code == 404


def test_sale_commit_rollback_edit_cancel(client, auth, data):
    p, c = data
    body = payload(data)
    count = query('SELECT COUNT(*) n FROM ventas')[0]['n']
    invalid = {**body, 'productos': [*body['productos'], {'producto_id': 2147483647, 'cantidad': 1}]}
    assert client.post('/api/ventas', headers=auth, json=invalid).status_code == 409
    assert query('SELECT stock FROM productos WHERE id=%s', (p['id'],))[0]['stock'] == 20
    assert query('SELECT COUNT(*) n FROM ventas')[0]['n'] == count
    # El descuento inválido falla después de escribir detalle y stock en el SP.
    assert client.post('/api/ventas', headers=auth, json={**body, 'descuento': 999}).status_code == 409
    assert query('SELECT stock FROM productos WHERE id=%s', (p['id'],))[0]['stock'] == 20
    assert query('SELECT COUNT(*) n FROM ventas')[0]['n'] == count
    response = client.post('/api/ventas', headers=auth, json=body)
    assert response.status_code == 201, response.text
    sale = response.json()['venta']
    assert float(sale['total']) == 20
    assert query('SELECT stock FROM productos WHERE id=%s', (p['id'],))[0]['stock'] == 18
    assert client.delete(f'/api/clientes/{c["id"]}', headers=auth).status_code == 409
    edit = client.put(f'/api/ventas/{sale["id"]}', headers=auth, json={'cliente_id': c['id'], 'descuento': 1,
                      'productos': [{'producto_id': p['id'], 'cantidad': 3}]})
    assert edit.status_code == 200, edit.text
    assert float(edit.json()['total']) == 29
    detail = client.get(f'/api/ventas/{sale["id"]}', headers=auth).json()
    assert detail['productos'][0]['cantidad'] == 3
    assert client.request('DELETE', f'/api/ventas/{sale["id"]}', headers=auth, json={'motivo': 'Prueba'}).status_code == 200
    assert query('SELECT stock FROM productos WHERE id=%s', (p['id'],))[0]['stock'] == 20
    assert client.request('DELETE', f'/api/ventas/{sale["id"]}', headers=auth, json={}).status_code == 409
    assert query("SELECT SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END) total FROM movimientos_caja WHERE referencia IN (%s,%s)",
                 (f'venta:{sale["id"]}', 'anulacion:'+str(query('SELECT id FROM movimientos_caja WHERE referencia=%s', (f'venta:{sale["id"]}',))[0]['id'])))[0]['total'] == 0


def test_concurrent_sales_cannot_oversell(client, auth, data):
    p, _ = data
    body = payload(data)
    body['productos'][0]['cantidad'] = 15
    with ThreadPoolExecutor(2) as executor:
        responses = list(executor.map(lambda _: client.post('/api/ventas', headers=auth, json=body), range(2)))
    assert sorted(r.status_code for r in responses) == [201, 409]
    assert query('SELECT stock FROM productos WHERE id=%s', (p['id'],))[0]['stock'] == 5


@pytest.mark.parametrize('method', ['Cuotas', 'Cuotas efectivo', 'Cheques', 'A cuenta'])
def test_financing_and_collection(client, auth, data, method):
    extra = {'cantidad_cuotas': 3, 'marca_tarjeta': 'VISA'} if method == 'Cuotas' else {'cantidad_cuotas': 3} if method == 'Cuotas efectivo' else {'cantidad_cheques': 2} if method == 'Cheques' else {}
    response = client.post('/api/ventas', headers=auth, json=payload(data, method, **extra))
    assert response.status_code == 201, response.text
    sale_id = response.json()['venta']['id']
    if method.startswith('Cuotas'):
        installments = [q for q in client.get('/api/ventas/cuotas', headers=auth).json() if q['venta_id'] == sale_id]
        assert sum(float(q['monto']) for q in installments) == pytest.approx(20)
        assert installments[0]['pagada']
        plan_id = installments[0]['venta_cuota_id']
        assert client.delete(f'/api/ventas/cuotas/planes/{plan_id}', headers=auth).status_code == 409
        for q in installments[1:]:
            url = f'/api/ventas/cuotas/{q["id"]}/pagar'
            assert client.put(url, headers=auth, json={'metodo_pago': 'Efectivo'}).status_code == 200
            assert client.put(url, headers=auth, json={'metodo_pago': 'Efectivo'}).status_code == 409
            receipt = client.get(f'/api/ventas/cuotas/{q["id"]}/comprobante', headers=auth)
            assert receipt.status_code == 200
        assert client.delete(f'/api/ventas/cuotas/planes/{plan_id}', headers=auth).status_code == 200
    elif method == 'Cheques':
        checks = [q for q in client.get('/api/ventas/cheques', headers=auth).json() if q['venta_id'] == sale_id]
        for q in checks:
            url = f'/api/ventas/cheques/{q["id"]}/cobrar'
            assert client.put(url, headers=auth).status_code == 200
            assert client.put(url, headers=auth).status_code == 409
            assert client.get(f'/api/ventas/cheques/{q["id"]}/comprobante', headers=auth).status_code == 200
        assert client.delete(f'/api/ventas/cheques/planes/{checks[0]["venta_cheques_id"]}', headers=auth).status_code == 200
    else:
        account = next(q for q in client.get('/api/ventas/a-cuenta', headers=auth).json() if q['venta_id'] == sale_id)
        response = client.put(f'/api/ventas/a-cuenta/clientes/{data[1]["id"]}/pagar', headers=auth, json={'monto': '20.00', 'metodo_pago': 'Efectivo'})
        assert response.status_code == 200, response.text
        receipt = client.get(f'/api/ventas/a-cuenta/pagos/{response.json()["pago_id"]}/comprobante', headers=auth)
        assert receipt.status_code == 200
        assert float(receipt.json()['monto']) == 20
        assert client.delete(f'/api/ventas/a-cuenta/{account["id"]}', headers=auth).status_code == 200
    assert client.request('DELETE', f'/api/ventas/{sale_id}', headers=auth, json={}).status_code == 200


def test_purchases_budgets_sheets_reports(client, auth, data):
    p, customer = data
    provider = client.post('/api/operaciones/proveedores', headers=auth, json={'nombre': 'Proveedor prueba'}).json()
    purchase = client.post('/api/operaciones/compras', headers=auth, json={'proveedor_id': provider['id'],
                          'productos': [{'producto_id': p['id'], 'cantidad': 5, 'costo_unitario': '6.00'}]})
    assert purchase.status_code == 201, purchase.text
    assert query('SELECT stock FROM productos WHERE id=%s', (p['id'],))[0]['stock'] == 25
    budget = client.post('/api/presupuestos', headers=auth, json={'cliente_id': customer['id'], 'productos': [{'producto_id': p['id'], 'cantidad': 2}]}).json()
    assert client.get(f'/api/presupuestos/{budget["id"]}', headers=auth).status_code == 200
    assert query('SELECT stock FROM productos WHERE id=%s', (p['id'],))[0]['stock'] == 25
    sheet = client.post('/api/planillas', headers=auth, json={'nombre': 'Planilla', 'cliente_id': customer['id'], 'contenido': [['Hola', '10']]}).json()
    assert client.get(f'/api/planillas/{sheet["id"]}', headers=auth).json()['contenido'] == [['Hola', '10']]
    assert client.put(f'/api/planillas/{sheet["id"]}', headers=auth, json={'nombre': 'Editada', 'contenido': [['Nuevo']]}).status_code == 200
    assert client.delete(f'/api/planillas/{sheet["id"]}', headers=auth).status_code == 200
    assert client.post('/api/ventas', headers=auth, json=payload(data)).status_code == 201
    for path in ('/api/dashboard/metricas', '/api/dashboard/estadisticas', '/api/operaciones/compras', '/api/operaciones/stock', '/api/caja/diaria'):
        response = client.get(path, headers=auth)
        assert response.status_code == 200, response.text
    for name in ('ventas', 'productos', 'clientes', 'inventario'):
        assert client.get(f'/api/reportes/{name}', headers=auth).status_code == 200
        export = client.get(f'/api/reportes/{name}/excel', headers=auth)
        assert export.status_code == 200
        workbook = load_workbook(BytesIO(export.content))
        assert workbook.active.max_row >= 2
    assert client.get('/api/reportes/ventas?desde=2026-12-01&hasta=2026-01-01', headers=auth).status_code == 422


def test_cash_open_close(client, auth):
    response = client.post('/api/caja/abrir', headers=auth, json={'saldo_inicial': '100.00'})
    assert response.status_code == 201, response.text
    assert client.post('/api/caja/abrir', headers=auth, json={'saldo_inicial': 0}).status_code == 409
    assert client.post('/api/caja/cerrar', headers=auth, json={'saldo_contado': 100}).status_code == 200
    assert client.post('/api/caja/cerrar', headers=auth, json={'saldo_contado': 100}).status_code == 409


def test_export_does_not_execute_formulas():
    from app.routers.reports import workbook_bytes
    book = load_workbook(BytesIO(workbook_bytes([{'nombre': '=1+1'}], 'ventas')))
    assert book.active['A2'].data_type == 's'


@pytest.mark.parametrize('method', ['Cuotas', 'Cuotas efectivo', 'Cheques', 'A cuenta'])
def test_edit_financing_before_collections(client, auth, data, method):
    extra = {'cantidad_cuotas': 3, 'marca_tarjeta': 'VISA'} if method == 'Cuotas' else {'cantidad_cuotas': 3} if method == 'Cuotas efectivo' else {'cantidad_cheques': 2} if method == 'Cheques' else {}
    sale = client.post('/api/ventas', headers=auth, json=payload(data, method, **extra)).json()['venta']
    edit = client.put(f'/api/ventas/{sale["id"]}', headers=auth, json={'cliente_id': data[1]['id'], 'descuento': 1,
                      'productos': [{'producto_id': data[0]['id'], 'cantidad': 3}]})
    assert edit.status_code == 200, edit.text
    assert float(edit.json()['total']) == 29
    if method.startswith('Cuotas'):
        installments = [q for q in client.get('/api/ventas/cuotas', headers=auth).json() if q['venta_id'] == sale['id']]
        assert sum(float(q['monto']) for q in installments) == pytest.approx(29)
        receipt = client.get(f'/api/ventas/cuotas/{installments[0]["id"]}/comprobante', headers=auth).json()
        assert float(receipt['monto_total']) == pytest.approx(9.67)
    elif method == 'A cuenta':
        account = next(q for q in client.get('/api/ventas/a-cuenta', headers=auth).json() if q['venta_id'] == sale['id'])
        assert float(account['saldo_pendiente']) == 29
    assert client.request('DELETE', f'/api/ventas/{sale["id"]}', headers=auth, json={}).status_code == 200


def test_customer_payment_spreads_across_sales(client, auth, data):
    for _ in range(2):
        assert client.post('/api/ventas', headers=auth, json=payload(data, 'A cuenta')).status_code == 201
    response = client.put(f'/api/ventas/a-cuenta/clientes/{data[1]["id"]}/pagar', headers=auth, json={'monto': 30, 'metodo_pago': 'Transferencia'})
    assert response.status_code == 200, response.text
    assert len(response.json()['pagos_ids']) == 2
    receipt = client.get(f'/api/ventas/a-cuenta/pagos/{response.json()["pago_id"]}/comprobante', headers=auth).json()
    assert float(receipt['monto']) == 30
    assert float(receipt['saldo_pendiente']) == 10
    accounts = [a for a in client.get('/api/ventas/a-cuenta', headers=auth).json() if a['cliente_id'] == data[1]['id']]
    assert sorted(float(a['saldo_pendiente']) for a in accounts) == [0, 10]


def test_concurrent_collection_is_recorded_once(client, auth, data):
    sale = client.post('/api/ventas', headers=auth, json=payload(data, 'Cuotas efectivo', cantidad_cuotas=2)).json()['venta']
    installment = next(q for q in client.get('/api/ventas/cuotas', headers=auth).json() if q['venta_id'] == sale['id'] and not q['pagada'])
    with ThreadPoolExecutor(2) as executor:
        results = list(executor.map(lambda _: client.put(f'/api/ventas/cuotas/{installment["id"]}/pagar', headers=auth, json={'metodo_pago': 'Efectivo'}), range(2)))
    assert sorted(r.status_code for r in results) == [200, 409]
    assert query('SELECT COUNT(*) n FROM cobros_cuotas_app WHERE cuota_id=%s', (installment['id'],))[0]['n'] == 1
