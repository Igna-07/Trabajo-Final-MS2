"""Lecturas de ventas compatibles con la interfaz React."""
from fastapi import HTTPException
from ..database import rows, one

SUMMARY = """COALESCE((SELECT GROUP_CONCAT(CONCAT(p.marca,' · ',p.nombre,' x',d.cantidad) ORDER BY d.id SEPARATOR ', ')
  FROM detalle_ventas d INNER JOIN productos p ON p.id=d.producto_id WHERE d.venta_id=v.id),'')"""


async def list_sales(c):
    return await rows(c, f'''SELECT v.*,c.nombre cliente_nombre,c.apellido cliente_apellido,{SUMMARY} productos_resumen
      FROM ventas v INNER JOIN clientes c ON c.id=v.cliente_id ORDER BY v.id DESC''')


async def detail(c, id):
    sale = await one(c, '''SELECT v.*,c.nombre cliente_nombre,c.apellido cliente_apellido,c.telefono,c.email,c.direccion,
      u.nombre creado_por FROM ventas v INNER JOIN clientes c ON c.id=v.cliente_id
      INNER JOIN usuarios u ON u.id=v.usuario_id WHERE v.id=%s''', (id,))
    if not sale:
        raise HTTPException(404, 'Venta no encontrada')
    sale['productos'] = await rows(c, '''SELECT d.*,p.marca producto_marca,p.nombre producto_nombre
      FROM detalle_ventas d INNER JOIN productos p ON p.id=d.producto_id WHERE d.venta_id=%s ORDER BY d.id''', (id,))
    return sale


async def installments(c):
    return await rows(c, f'''SELECT q.*,vc.id venta_cuota_id,vc.cantidad_cuotas,v.id venta_id,v.total total_venta,
      c.id cliente_id,c.nombre,c.apellido,b.id comprobante_id,b.metodo_pago metodo_pago_cobro,
      b.marca_tarjeta marca_tarjeta_cobro,b.porcentaje_recargo porcentaje_recargo_cobro,
      b.monto_recargo monto_recargo_cobro,b.monto_total monto_total_cobro,{SUMMARY} productos_resumen
      FROM cuotas q INNER JOIN ventas_cuotas vc ON vc.id=q.venta_cuota_id
      INNER JOIN ventas v ON v.id=vc.venta_id INNER JOIN clientes c ON c.id=v.cliente_id
      LEFT JOIN cobros_cuotas_app b ON b.cuota_id=q.id
      WHERE vc.archivada=FALSE AND v.estado='ACTIVA' ORDER BY v.id DESC,q.numero_cuota''')


async def checks(c):
    return await rows(c, f'''SELECT q.*,vc.id venta_cheques_id,vc.cantidad_cheques,v.id venta_id,v.total total_venta,
      c.id cliente_id,c.nombre,c.apellido,b.id comprobante_id,{SUMMARY} productos_resumen
      FROM cheques_app q INNER JOIN ventas_cheques_app vc ON vc.id=q.venta_cheques_id
      INNER JOIN ventas v ON v.id=vc.venta_id INNER JOIN clientes c ON c.id=v.cliente_id
      LEFT JOIN cobros_cheques_app b ON b.cheque_id=q.id
      WHERE vc.archivada=FALSE AND v.estado='ACTIVA' ORDER BY v.id DESC,q.numero_cheque''')


async def accounts(c):
    result = await rows(c, f'''SELECT ac.*,v.id venta_id,c.id cliente_id,c.nombre,c.apellido,{SUMMARY} productos_resumen
      FROM ventas_a_cuenta_app ac INNER JOIN ventas v ON v.id=ac.venta_id
      INNER JOIN clientes c ON c.id=v.cliente_id WHERE ac.archivada=FALSE AND v.estado='ACTIVA' ORDER BY ac.id DESC''')
    for account in result:
        account['pagos'] = await rows(c, 'SELECT * FROM pagos_a_cuenta_app WHERE venta_a_cuenta_id=%s ORDER BY id DESC', (account['id'],))
    return result
