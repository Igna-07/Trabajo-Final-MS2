from fastapi import APIRouter, Depends, HTTPException
from ..database import transaction, one, rows
from ..repositories import sales as repo
from ..schemas import Sale, SaleEdit, Collection, PaymentIn, Cancellation
from ..security import current_user, admin
from ..services import sales as service

router = APIRouter(prefix='/api/ventas', tags=['Ventas y cobros'], dependencies=[Depends(current_user)])


@router.get('')
async def sales():
    async with transaction() as c:
        return await repo.list_sales(c)


@router.post('', status_code=201)
async def create_sale(body: Sale, user=Depends(current_user)):
    return await service.register(body, user)


@router.get('/cuotas')
async def installments():
    async with transaction() as c:
        return await repo.installments(c)


@router.get('/cheques')
async def checks():
    async with transaction() as c:
        return await repo.checks(c)


@router.get('/a-cuenta')
async def accounts():
    async with transaction() as c:
        return await repo.accounts(c)


@router.put('/cuotas/{id}/pagar')
async def pay_installment(id: int, body: Collection, user=Depends(current_user)):
    async with transaction() as c:
        return await service.collect_installment(c, id, body, user)


@router.put('/cheques/{id}/cobrar')
async def collect_check(id: int, user=Depends(current_user)):
    async with transaction() as c:
        return await service.collect_check(c, id, user)


@router.put('/a-cuenta/clientes/{cliente_id}/pagar')
async def pay_customer(cliente_id: int, body: PaymentIn, user=Depends(current_user)):
    async with transaction() as c:
        return await service.pay_account(c, body, user, customer_id=cliente_id)


@router.put('/a-cuenta/{id}/pagar')
async def pay_account(id: int, body: PaymentIn, user=Depends(current_user)):
    async with transaction() as c:
        return await service.pay_account(c, body, user, id=id)


@router.delete('/cuotas/planes/{id}')
async def archive_installments(id: int):
    async with transaction() as c:
        return await service.archive(c, 'ventas_cuotas', id, 'cuotas', 'venta_cuota_id', 'pagada')


@router.delete('/cheques/planes/{id}')
async def archive_checks(id: int):
    async with transaction() as c:
        return await service.archive(c, 'ventas_cheques_app', id, 'cheques_app', 'venta_cheques_id', 'cobrado')


@router.delete('/a-cuenta/clientes/{cliente_id}')
async def archive_customer(cliente_id: int):
    async with transaction() as c:
        plans = await rows(c, '''SELECT ac.id FROM ventas_a_cuenta_app ac INNER JOIN ventas v ON v.id=ac.venta_id
          WHERE v.cliente_id=%s AND v.estado='ACTIVA' AND ac.archivada=FALSE ORDER BY v.id''', (cliente_id,))
        if not plans:
            raise HTTPException(404, 'Cuenta no encontrada')
        for plan in plans:
            await service.archive(c, 'ventas_a_cuenta_app', plan['id'])
        return {'mensaje': 'Cuenta del cliente archivada'}


@router.delete('/a-cuenta/{id}')
async def archive_account(id: int):
    async with transaction() as c:
        return await service.archive(c, 'ventas_a_cuenta_app', id)


@router.get('/cuotas/{id}/comprobante')
async def installment_receipt(id: int):
    async with transaction() as c:
        result = await one(c, '''SELECT b.*,b.id comprobante_id,q.numero_cuota,vc.cantidad_cuotas,
          v.id venta_id,c.nombre,c.apellido,u.nombre cobrado_por,
          (SELECT COALESCE(SUM(p.monto),0) FROM cuotas p WHERE p.venta_cuota_id=vc.id AND p.pagada=FALSE) saldo_pendiente
          FROM cobros_cuotas_app b INNER JOIN cuotas q ON q.id=b.cuota_id
          INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id INNER JOIN ventas v ON v.id=vc.venta_id
          INNER JOIN clientes c ON c.id=v.cliente_id INNER JOIN usuarios u ON u.id=b.usuario_id WHERE q.id=%s''', (id,))
        if not result:
            raise HTTPException(404, 'Comprobante no encontrado')
        return result


@router.get('/cheques/{id}/comprobante')
async def check_receipt(id: int):
    async with transaction() as c:
        result = await one(c, '''SELECT b.id comprobante_id,b.fecha,q.numero_cheque,q.fecha_vencimiento,
          vc.cantidad_cheques,v.id venta_id,c.nombre,c.apellido,u.nombre cobrado_por
          FROM cobros_cheques_app b INNER JOIN cheques_app q ON q.id=b.cheque_id
          INNER JOIN ventas_cheques_app vc ON vc.id=q.venta_cheques_id INNER JOIN ventas v ON v.id=vc.venta_id
          INNER JOIN clientes c ON c.id=v.cliente_id INNER JOIN usuarios u ON u.id=b.usuario_id WHERE q.id=%s''', (id,))
        if not result:
            raise HTTPException(404, 'Comprobante no encontrado')
        return result


@router.get('/a-cuenta/pagos/{id}/comprobante')
async def account_receipt(id: int):
    async with transaction() as c:
        result = await one(c, '''SELECT p.*,p.id comprobante_id,c.id cliente_id,c.nombre,c.apellido,u.nombre cobrado_por
          FROM pagos_a_cuenta_app p INNER JOIN ventas_a_cuenta_app ac ON ac.id=p.venta_a_cuenta_id
          INNER JOIN ventas v ON v.id=ac.venta_id INNER JOIN clientes c ON c.id=v.cliente_id
          INNER JOIN usuarios u ON u.id=p.usuario_id WHERE p.id=%s''', (id,))
        if not result:
            raise HTTPException(404, 'Comprobante no encontrado')
        group = await one(c, '''SELECT SUM(p.monto) monto,GROUP_CONCAT(ac.venta_id ORDER BY ac.venta_id SEPARATOR ', #') ventas_ids
          FROM pagos_a_cuenta_app p INNER JOIN ventas_a_cuenta_app ac ON ac.id=p.venta_a_cuenta_id
          WHERE p.grupo_pago=%s''', (result['grupo_pago'],))
        pending = await one(c, '''SELECT COALESCE(SUM(ac.saldo_pendiente),0) saldo_pendiente FROM ventas_a_cuenta_app ac
          INNER JOIN ventas v ON v.id=ac.venta_id WHERE v.cliente_id=%s AND v.estado='ACTIVA' ''', (result['cliente_id'],))
        return result | group | pending


@router.get('/{id}')
async def sale_detail(id: int):
    async with transaction() as c:
        return await repo.detail(c, id)


@router.put('/{id}')
async def edit_sale(id: int, body: SaleEdit, user=Depends(admin)):
    async with transaction() as c:
        return await service.edit_sale(c, id, body, user)


@router.delete('/{id}')
async def cancel_sale(id: int, body: Cancellation, user=Depends(admin)):
    async with transaction() as c:
        return await service.cancel_sale(c, id, body, user)
