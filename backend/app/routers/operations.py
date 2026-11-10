from fastapi import APIRouter, Depends, HTTPException
from ..database import transaction, rows, one, insert
from ..repositories.catalog import require
from ..schemas import Purchase, Budget, CashOpen, CashClose
from ..security import current_user, admin
from ..services.operations import create_document, close_cash

router = APIRouter(prefix='/api', tags=['Operaciones'], dependencies=[Depends(current_user)])


@router.get('/operaciones/compras', dependencies=[Depends(admin)])
async def purchases():
    async with transaction() as c:
        return await rows(c, '''SELECT c.*,p.nombre proveedor FROM compras_app c
                               INNER JOIN proveedores_app p ON p.id=c.proveedor_id ORDER BY c.id DESC''')


@router.post('/operaciones/compras', status_code=201)
async def purchase(body: Purchase, user=Depends(admin)):
    async with transaction() as c:
        return await create_document(c, body, user, purchase=True)


@router.get('/operaciones/stock', dependencies=[Depends(admin)])
async def movements():
    async with transaction() as c:
        return await rows(c, '''SELECT m.*,p.marca producto_marca,p.nombre producto FROM movimientos_stock_app m
                               INNER JOIN productos p ON p.id=m.producto_id ORDER BY m.id DESC LIMIT 500''')


@router.get('/presupuestos')
async def budgets():
    async with transaction() as c:
        return await rows(c, '''SELECT p.*,c.nombre,c.apellido FROM presupuestos_app p
                               INNER JOIN clientes c ON c.id=p.cliente_id ORDER BY p.id DESC''')


@router.post('/presupuestos', status_code=201)
async def budget(body: Budget, user=Depends(current_user)):
    async with transaction() as c:
        return await create_document(c, body, user)


@router.get('/presupuestos/{id}')
async def budget_detail(id: int):
    async with transaction() as c:
        record = await one(c, '''SELECT p.*,c.nombre,c.apellido,c.telefono,c.email,c.direccion,u.nombre creado_por
           FROM presupuestos_app p INNER JOIN clientes c ON c.id=p.cliente_id
           INNER JOIN usuarios u ON u.id=p.usuario_id WHERE p.id=%s''', (id,))
        if not record:
            raise HTTPException(404, 'Presupuesto no encontrado')
        record['productos'] = await rows(c, '''SELECT d.*,p.marca,p.nombre FROM detalle_presupuestos_app d
           INNER JOIN productos p ON p.id=d.producto_id WHERE d.presupuesto_id=%s ORDER BY d.id''', (id,))
        return record


@router.get('/caja/diaria')
async def cash():
    async with transaction() as c:
        summary = await rows(c, '''SELECT metodo_pago,SUM(CASE WHEN tipo='INGRESO' THEN monto ELSE -monto END) total
                                   FROM movimientos_caja WHERE DATE(fecha)=CURRENT_DATE GROUP BY metodo_pago''')
        movements = await rows(c, 'SELECT * FROM movimientos_caja WHERE DATE(fecha)=CURRENT_DATE ORDER BY id DESC')
        session = await one(c, "SELECT * FROM caja_sesiones_app WHERE estado='ABIERTA' LIMIT 1")
        return {'resumen': summary, 'movimientos': movements, 'sesion': session}


@router.post('/caja/abrir', status_code=201)
async def cash_open(body: CashOpen, user=Depends(current_user)):
    async with transaction() as c:
        if await one(c, "SELECT id FROM caja_sesiones_app WHERE estado='ABIERTA'"):
            raise HTTPException(409, 'Ya existe una caja abierta')
        id = await insert(c, 'caja_sesiones_app', dict(usuario_apertura_id=user['id'], saldo_inicial=body.saldo_inicial))
        return await require(c, 'caja_sesiones_app', id)


@router.post('/caja/cerrar')
async def cash_close(body: CashClose, user=Depends(current_user)):
    async with transaction() as c:
        return await close_cash(c, body, user)
