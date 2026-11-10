"""Transacciones de venta, cobro, edición y anulación.

La creación pertenece al stored procedure. Las demás operaciones toman un
bloqueo de la venta antes de cambiar stock o saldos para impedir cobros dobles.
"""
import json
from decimal import Decimal, ROUND_HALF_UP
from uuid import uuid4
import aiomysql
from fastapi import HTTPException
from .. import database
from ..database import rows, one, insert, update
from ..repositories.catalog import require


def money(value):
    return Decimal(value).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


async def register(body, user):
    if body.descuento and user['rol'] != 'ADMIN':
        raise HTTPException(403, 'Solo un administrador puede aplicar descuentos')
    # No abrir otra transacción: registrar_venta hace START/COMMIT/ROLLBACK.
    async with database.pool.acquire() as connection:
        try:
            async with connection.cursor(aiomysql.DictCursor) as c:
                items = sorted([i.model_dump() for i in body.productos], key=lambda i: i['producto_id'])
                await c.execute('CALL registrar_venta(%s,%s,%s,%s,%s,%s,%s,%s,@venta)',
                    (body.cliente_id, user['id'], body.metodo_pago, json.dumps(items), body.descuento,
                     body.marca_tarjeta, body.cantidad_cuotas, body.cantidad_cheques))
                while await c.nextset():
                    pass
                result = await one(c, 'SELECT @venta id')
                sale = await require(c, 'ventas', result['id'])
                await connection.commit()
                return {'mensaje': 'Venta registrada', 'venta': sale}
        except BaseException:
            await connection.rollback()
            raise


async def active_sale(c, id):
    sale = await require(c, 'ventas', id, lock=True)
    if sale['estado'] != 'ACTIVA':
        raise HTTPException(409, 'La venta está anulada')
    return sale


async def cash_movement(c, reference, amount, method, description, tipo='INGRESO'):
    return await insert(c, 'movimientos_caja', dict(tipo=tipo, descripcion=description, monto=amount,
                        metodo_pago=method, referencia=reference))


async def collect_installment(c, id, body, user):
    link = await one(c, '''SELECT vc.venta_id FROM cuotas q INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id WHERE q.id=%s''', (id,))
    if not link:
        raise HTTPException(404, 'Cuota no encontrada')
    await active_sale(c, link['venta_id'])
    installment = await require(c, 'cuotas', id, lock=True)
    if installment['pagada']:
        raise HTTPException(409, 'La cuota ya fue pagada')
    await c.execute('UPDATE cuotas SET pagada=TRUE,fecha_pago=CURRENT_DATE WHERE id=%s', (id,))
    await insert(c, 'cobros_cuotas_app', dict(cuota_id=id, usuario_id=user['id'],
                 metodo_pago=body.metodo_pago, marca_tarjeta=body.marca_tarjeta,
                 monto_base=installment['monto'], monto_total=installment['monto']))
    await cash_movement(c, f'cuota:{id}', installment['monto'], body.metodo_pago, f'Cobro cuota #{id}')
    return {'mensaje': 'Cuota pagada', 'cuota_id': id}


async def collect_check(c, id, user):
    link = await one(c, '''SELECT vc.venta_id FROM cheques_app q INNER JOIN ventas_cheques_app vc ON vc.id=q.venta_cheques_id WHERE q.id=%s''', (id,))
    if not link:
        raise HTTPException(404, 'Cheque no encontrado')
    sale = await active_sale(c, link['venta_id'])
    check = await require(c, 'cheques_app', id, lock=True)
    if check['cobrado']:
        raise HTTPException(409, 'El cheque ya fue cobrado')
    plan = await require(c, 'ventas_cheques_app', check['venta_cheques_id'])
    base = money(sale['total']/plan['cantidad_cheques'])
    amount = sale['total']-base*(plan['cantidad_cheques']-1) if check['numero_cheque'] == plan['cantidad_cheques'] else base
    await c.execute('UPDATE cheques_app SET cobrado=TRUE,fecha_cobro=CURRENT_TIMESTAMP WHERE id=%s', (id,))
    await insert(c, 'cobros_cheques_app', dict(cheque_id=id, usuario_id=user['id']))
    await cash_movement(c, f'cheque:{id}', amount, 'Cheques', f'Cobro cheque #{id}')
    return {'mensaje': 'Cheque cobrado', 'cheque_id': id}


async def pay_account(c, body, user, id=None, customer_id=None):
    if id:
        account = await require(c, 'ventas_a_cuenta_app', id)
        await active_sale(c, account['venta_id'])
        accounts = [await require(c, 'ventas_a_cuenta_app', id, lock=True)]
    else:
        # Todas las ventas del cliente se bloquean en el mismo orden que el reparto.
        links = await rows(c, '''SELECT v.id FROM ventas v INNER JOIN ventas_a_cuenta_app ac ON ac.venta_id=v.id
          WHERE v.cliente_id=%s AND v.estado='ACTIVA' AND ac.archivada=FALSE ORDER BY v.id FOR UPDATE''', (customer_id,))
        accounts = []
        for link in links:
            row = await one(c, 'SELECT * FROM ventas_a_cuenta_app WHERE venta_id=%s FOR UPDATE', (link['id'],))
            accounts.append(row)
    total = sum((a['saldo_pendiente'] for a in accounts if not a['archivada']), Decimal('0'))
    if body.monto > total:
        raise HTTPException(400, 'La entrega supera el saldo pendiente')
    remaining = body.monto
    group = str(uuid4())
    payment_ids = []
    for account in accounts:
        if not remaining:
            break
        if account['archivada'] or not account['saldo_pendiente']:
            continue
        amount = min(remaining, account['saldo_pendiente'])
        payment_id = await insert(c, 'pagos_a_cuenta_app', dict(venta_a_cuenta_id=account['id'], usuario_id=user['id'],
                         metodo_pago=body.metodo_pago, marca_tarjeta=body.marca_tarjeta, monto=amount, grupo_pago=group))
        await update(c, 'ventas_a_cuenta_app', account['id'], {'saldo_pendiente': account['saldo_pendiente']-amount})
        await cash_movement(c, f'pago:{payment_id}', amount, body.metodo_pago, f'Entrega venta #{account["venta_id"]}')
        payment_ids.append(payment_id)
        remaining -= amount
    return {'mensaje': 'Entrega registrada', 'pago_id': payment_ids[0], 'pagos_ids': payment_ids, 'saldo_pendiente': total-body.monto}


async def archive(c, table, id, child=None, fk=None, paid=None):
    plan = await require(c, table, id)
    await active_sale(c, plan['venta_id'])
    plan = await require(c, table, id, lock=True)
    if child:
        pending = await one(c, f'SELECT COUNT(*) n FROM `{child}` WHERE `{fk}`=%s AND `{paid}`=FALSE', (id,))
        if pending['n']:
            raise HTTPException(409, 'Quedan cobros pendientes')
    elif plan['saldo_pendiente']:
        raise HTTPException(409, 'La cuenta tiene saldo pendiente')
    await update(c, table, id, {'archivada': True})
    return {'mensaje': 'Cuenta archivada'}


async def ensure_editable(c, sale):
    id = sale['id']
    extra = await one(c, '''SELECT
      (SELECT COUNT(*) FROM cuotas q INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id
       WHERE vc.venta_id=%s AND q.pagada=TRUE AND q.pagada_al_registrar=FALSE)
      +(SELECT COUNT(*) FROM cheques_app q INNER JOIN ventas_cheques_app vc ON vc.id=q.venta_cheques_id
       WHERE vc.venta_id=%s AND q.cobrado=TRUE)
      +(SELECT COUNT(*) FROM pagos_a_cuenta_app p INNER JOIN ventas_a_cuenta_app ac ON ac.id=p.venta_a_cuenta_id
       WHERE ac.venta_id=%s) n''', (id, id, id))
    if extra['n']:
        raise HTTPException(409, 'La venta tiene cobros posteriores; no se puede editar')


async def stock_change(c, product, amount, user, reference, kind):
    stock = product['stock'] + amount
    if stock < 0:
        raise HTTPException(409, 'Stock insuficiente')
    await update(c, 'productos', product['id'], {'stock': stock})
    await insert(c, 'movimientos_stock_app', dict(producto_id=product['id'], usuario_id=user['id'], tipo=kind,
                 cantidad=amount, stock_anterior=product['stock'], stock_nuevo=stock, referencia=reference))


async def edit_sale(c, id, body, user):
    sale = await active_sale(c, id)
    await ensure_editable(c, sale)
    await require(c, 'clientes', body.cliente_id)
    old = {r['producto_id']: r for r in await rows(c, 'SELECT * FROM detalle_ventas WHERE venta_id=%s', (id,))}
    new = {i.producto_id: i for i in body.productos}
    details = []
    subtotal = Decimal('0')
    for pid in sorted(set(old) | set(new)):
        product = await require(c, 'productos', pid, lock=True)
        quantity = new[pid].cantidad if pid in new else 0
        delta = old.get(pid, {}).get('cantidad', 0) - quantity
        if delta:
            await stock_change(c, product, delta, user, f'venta:{id}', 'EDICION')
        if quantity:
            price = old[pid]['precio_unitario'] if pid in old else product['precio']
            cost = old[pid]['costo_unitario'] if pid in old else product['costo']
            subtotal += price*quantity
            details.append(dict(venta_id=id, producto_id=pid, cantidad=quantity, precio_unitario=price,
                                costo_unitario=cost, subtotal=price*quantity))
    if body.descuento > subtotal:
        raise HTTPException(400, 'El descuento supera el subtotal')
    surcharge = money(subtotal*sale['porcentaje_recargo']/100)
    total = subtotal+surcharge-body.descuento
    await update(c, 'ventas', id, dict(cliente_id=body.cliente_id, subtotal=subtotal, descuento=body.descuento,
                                     monto_recargo=surcharge, total=total))
    await c.execute('DELETE FROM detalle_ventas WHERE venta_id=%s', (id,))
    for item in details:
        await insert(c, 'detalle_ventas', item)
    if sale['metodo_pago'] in ('Cuotas', 'Cuotas efectivo'):
        plan = await one(c, 'SELECT * FROM ventas_cuotas WHERE venta_id=%s FOR UPDATE', (id,))
        base = money(total/plan['cantidad_cuotas'])
        await update(c, 'ventas_cuotas', plan['id'], dict(monto_cuota=base, total_financiado=total))
        installments = await rows(c, 'SELECT * FROM cuotas WHERE venta_cuota_id=%s FOR UPDATE', (plan['id'],))
        for q in installments:
            amount = total-base*(plan['cantidad_cuotas']-1) if q['numero_cuota'] == plan['cantidad_cuotas'] else base
            await update(c, 'cuotas', q['id'], {'monto': amount})
            if q['pagada_al_registrar']:
                await c.execute('UPDATE cobros_cuotas_app SET monto_base=%s,monto_total=%s WHERE cuota_id=%s', (amount, amount, q['id']))
                await c.execute('UPDATE movimientos_caja SET monto=%s WHERE referencia=%s', (amount, f'cuota:{q["id"]}'))
    elif sale['metodo_pago'] == 'A cuenta':
        await c.execute('UPDATE ventas_a_cuenta_app SET total=%s,saldo_pendiente=%s WHERE venta_id=%s', (total, total, id))
    elif sale['metodo_pago'] != 'Cheques':
        await c.execute('UPDATE movimientos_caja SET monto=%s WHERE referencia=%s', (total, f'venta:{id}'))
    await insert(c, 'auditoria_app', dict(usuario_id=user['id'], accion='EDITAR', entidad='ventas', entidad_id=id))
    return {'mensaje': 'Venta actualizada', 'venta_id': id, 'total': total}


async def cancel_sale(c, id, body, user):
    await active_sale(c, id)
    for item in await rows(c, 'SELECT * FROM detalle_ventas WHERE venta_id=%s ORDER BY producto_id', (id,)):
        product = await require(c, 'productos', item['producto_id'], lock=True)
        await stock_change(c, product, item['cantidad'], user, f'venta:{id}', 'ANULACION')
    # Revertir solo ingresos efectivamente cobrados y conservar los comprobantes.
    movements = await rows(c, '''SELECT m.* FROM movimientos_caja m WHERE m.tipo='INGRESO' AND (
      m.referencia=%s OR m.referencia IN (
        SELECT CONCAT('cuota:',q.id) FROM cuotas q INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id WHERE vc.venta_id=%s)
      OR m.referencia IN (SELECT CONCAT('cheque:',q.id) FROM cheques_app q INNER JOIN ventas_cheques_app vc ON vc.id=q.venta_cheques_id WHERE vc.venta_id=%s)
      OR m.referencia IN (SELECT CONCAT('pago:',p.id) FROM pagos_a_cuenta_app p INNER JOIN ventas_a_cuenta_app ac ON ac.id=p.venta_a_cuenta_id WHERE ac.venta_id=%s))''',
      (f'venta:{id}', id, id, id))
    for movement in movements:
        await cash_movement(c, f'anulacion:{movement["id"]}', movement['monto'], movement['metodo_pago'], f'Anulación venta #{id}', 'EGRESO')
    await c.execute("UPDATE ventas SET estado='ANULADA',fecha_anulacion=CURRENT_TIMESTAMP WHERE id=%s", (id,))
    await insert(c, 'auditoria_app', dict(usuario_id=user['id'], accion='ANULAR', entidad='ventas', entidad_id=id,
                                        detalle=json.dumps({'motivo': body.motivo})))
    return {'mensaje': 'Venta anulada y stock restaurado'}
