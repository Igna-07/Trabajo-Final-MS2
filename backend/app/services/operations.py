"""Reglas de compras, presupuestos y caja."""
from datetime import date, timedelta
from decimal import Decimal
from fastapi import HTTPException
from ..database import insert, update, rows, one
from ..repositories.catalog import require


async def create_document(c, body, user, purchase=False):
    table = 'compras_app' if purchase else 'presupuestos_app'
    party_field = 'proveedor_id' if purchase else 'cliente_id'
    party_id = getattr(body, party_field)
    await require(c, 'proveedores_app' if purchase else 'clientes', party_id)
    details = []
    total = Decimal('0')
    # Orden fijo de bloqueos para reducir deadlocks en compras concurrentes.
    for item in sorted(body.productos, key=lambda p: p.producto_id):
        product = await require(c, 'productos', item.producto_id, lock=True)
        price = item.costo_unitario if purchase else product['precio']
        subtotal = price * item.cantidad
        total += subtotal
        details.append((item, product, price, subtotal))
    data = {party_field: party_id, 'usuario_id': user['id'], 'total': total}
    if not purchase:
        data['valido_hasta'] = date.today() + timedelta(days=15)
    id = await insert(c, table, data)
    for item, product, price, subtotal in details:
        await insert(c, 'detalle_compras_app' if purchase else 'detalle_presupuestos_app', {
            'compra_id' if purchase else 'presupuesto_id': id, 'producto_id': item.producto_id,
            'cantidad': item.cantidad, 'costo_unitario' if purchase else 'precio_unitario': price, 'subtotal': subtotal})
        if purchase:
            stock = product['stock'] + item.cantidad
            await update(c, 'productos', product['id'], {'stock': stock, 'costo': price})
            await insert(c, 'movimientos_stock_app', dict(producto_id=product['id'], usuario_id=user['id'],
                         tipo='COMPRA', cantidad=item.cantidad, stock_anterior=product['stock'],
                         stock_nuevo=stock, referencia=f'compra:{id}'))
    if purchase:
        await insert(c, 'movimientos_caja', dict(tipo='EGRESO', descripcion=f'Compra #{id}', monto=total,
                     metodo_pago='Efectivo', referencia=f'compra:{id}'))
    return await require(c, table, id)


async def close_cash(c, body, user):
    session = await one(c, "SELECT * FROM caja_sesiones_app WHERE estado='ABIERTA' FOR UPDATE")
    if not session:
        raise HTTPException(409, 'No hay una caja abierta')
    summary = await one(c, '''SELECT COALESCE(SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END),0) total
                              FROM movimientos_caja WHERE fecha >= %s''', (session['fecha_apertura'],))
    expected = session['saldo_inicial'] + summary['total']
    await c.execute('''UPDATE caja_sesiones_app SET usuario_cierre_id=%s,saldo_esperado=%s,saldo_contado=%s,
                       diferencia=%s,fecha_cierre=CURRENT_TIMESTAMP,estado='CERRADA' WHERE id=%s''',
                    (user['id'], expected, body.saldo_contado, body.saldo_contado-expected, session['id']))
    return await require(c, 'caja_sesiones_app', session['id'])
