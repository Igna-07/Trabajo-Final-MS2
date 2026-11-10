"""Consultas evaluables: JOIN, subconsulta correlacionada y GROUP BY.

Las mismas consultas alimentan pantalla y exportación XLSX.
"""
from ..database import rows

REPORTS = {
    'ventas': ('''SELECT v.id,v.fecha,c.nombre cliente,c.apellido,v.metodo_pago,v.subtotal,v.descuento,v.total,v.estado,
       COALESCE((SELECT GROUP_CONCAT(CONCAT(p.marca,' · ',p.nombre,' x',d.cantidad) ORDER BY d.id SEPARATOR ', ')
         FROM detalle_ventas d INNER JOIN productos p ON p.id=d.producto_id WHERE d.venta_id=v.id),'') productos_resumen
       FROM ventas v INNER JOIN clientes c ON c.id=v.cliente_id
       WHERE DATE(v.fecha) BETWEEN %s AND %s ORDER BY v.id DESC''', True),
    'productos': ('''SELECT p.id,p.marca,p.nombre,p.stock,
       SUM(d.cantidad) unidades_vendidas,SUM(d.subtotal) ingresos,
       SUM(d.cantidad*d.costo_unitario) costo_vendido
       FROM productos p INNER JOIN detalle_ventas d ON d.producto_id=p.id
       INNER JOIN ventas v ON v.id=d.venta_id
       WHERE v.estado='ACTIVA' AND DATE(v.fecha) BETWEEN %s AND %s
       GROUP BY p.id,p.marca,p.nombre,p.stock ORDER BY ingresos DESC''', True),
    'clientes': ('''SELECT c.id,c.nombre,c.apellido,COUNT(v.id) cantidad_ventas,SUM(v.total) total_comprado
       FROM clientes c INNER JOIN ventas v ON v.cliente_id=c.id
       WHERE v.estado='ACTIVA' AND DATE(v.fecha) BETWEEN %s AND %s
       GROUP BY c.id,c.nombre,c.apellido ORDER BY total_comprado DESC''', True),
    'inventario': ('''SELECT id,marca,nombre,stock,costo,precio,stock*costo valor_costo,stock*precio valor_venta
       FROM productos ORDER BY stock,nombre''', False),
}


async def report(c, name, start, end):
    sql, dated = REPORTS[name]
    return await rows(c, sql, (start, end) if dated else ())
