const pool = require("../config/db");

const obtenerMetricas = async (req, res) => {
  try {

    const productos = await pool.query(
      "SELECT COUNT(*) total FROM productos"
    );

    const clientes = await pool.query(
      "SELECT COUNT(*) total FROM clientes"
    );

    const ventasHoy = await pool.query(
      `
      SELECT COUNT(*) total
      FROM ventas
      WHERE fecha::date = CURRENT_DATE
      `
    );

    const cantidadVentas = await pool.query(`
      SELECT COUNT(*) total
      FROM ventas
    `);

    const cuotasVencidas = await pool.query(`
      SELECT COUNT(*) total
      FROM cuotas
      WHERE pagada = false
        AND fecha_vencimiento < CURRENT_DATE
    `);

    const stockBajo = await pool.query(`
      SELECT COUNT(*) total
      FROM productos
      WHERE stock <= 3
    `);

    res.json({
      productos: Number(productos.rows[0].total),
      clientes: Number(clientes.rows[0].total),
      ventasHoy: Number(ventasHoy.rows[0].total),
      cantidadVentas: Number(cantidadVentas.rows[0].total),
      cuotasVencidas: Number(cuotasVencidas.rows[0].total),
      stockBajo: Number(stockBajo.rows[0].total),
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: "Error obteniendo métricas",
    });
  }
};

const obtenerEstadisticas = async (req, res) => {
  try {
    const diasSolicitados = Number(req.query.dias);
    const dias = [7, 30, 90, 365].includes(diasSolicitados) ? diasSolicitados : 30;

    const [resumen, periodoAnterior, inventario, cuentas, productos, ventasDiarias, mediosPago] = await Promise.all([
      pool.query(
        `WITH ventas_periodo AS (
           SELECT id, total
           FROM ventas
           WHERE estado = 'ACTIVA'
             AND fecha >= CURRENT_DATE - $1::integer + 1
         )
         SELECT
           (SELECT COUNT(*)::int FROM ventas_periodo) AS cantidad_ventas,
           COALESCE(SUM(d.cantidad), 0)::int AS unidades_vendidas,
           COALESCE((SELECT SUM(total) FROM ventas_periodo), 0) AS ingresos,
           COALESCE(SUM(d.cantidad * d.costo_unitario), 0) AS costo_mercaderia
         FROM detalle_ventas d
         JOIN ventas_periodo v ON v.id = d.venta_id`,
        [dias]
      ),
      pool.query(
        `SELECT COALESCE(SUM(v.total), 0) AS ingresos
         FROM ventas v
         WHERE v.estado = 'ACTIVA'
           AND v.fecha >= CURRENT_DATE - ($1::integer * 2) + 1
           AND v.fecha < CURRENT_DATE - $1::integer + 1`,
        [dias]
      ),
      pool.query(
        `SELECT
           COALESCE(SUM(stock * costo), 0) AS valor_costo,
           COALESCE(SUM(stock * precio), 0) AS valor_venta,
           COALESCE(SUM(stock), 0)::int AS unidades,
           COUNT(*) FILTER (WHERE stock = 0)::int AS sin_stock,
           COUNT(*) FILTER (WHERE stock > 0 AND stock <= 3)::int AS stock_bajo,
           COUNT(*) FILTER (WHERE stock > 3)::int AS stock_saludable
         FROM productos`
      ),
      pool.query(
        `SELECT
           COALESCE((SELECT SUM(c.monto) FROM cuotas c WHERE c.pagada = false), 0)
             + COALESCE((SELECT SUM(ac.saldo_pendiente) FROM ventas_a_cuenta_app ac WHERE ac.archivada = false), 0)
             AS total_pendiente,
           COALESCE((
             SELECT SUM(c.monto)
             FROM cuotas c
             JOIN ventas_cuotas vc ON vc.id = c.venta_cuota_id
             JOIN ventas v ON v.id = vc.venta_id
             WHERE c.pagada = false AND c.fecha_vencimiento < CURRENT_DATE
               AND vc.archivada = false AND v.estado = 'ACTIVA'
           ), 0) AS total_vencido`
      ),
      pool.query(
        `WITH ventas_producto AS (
           SELECT
             p.id, p.marca, p.nombre, p.stock, p.costo, p.precio,
             COALESCE(SUM(d.cantidad) FILTER (WHERE v.id IS NOT NULL), 0)::int AS unidades_vendidas,
             COALESCE(SUM(d.subtotal) FILTER (WHERE v.id IS NOT NULL), 0) AS ingresos,
             COALESCE(SUM(d.cantidad * d.costo_unitario) FILTER (WHERE v.id IS NOT NULL), 0) AS costo_vendido
           FROM productos p
           LEFT JOIN detalle_ventas d ON d.producto_id = p.id
           LEFT JOIN ventas v ON v.id = d.venta_id
             AND v.estado = 'ACTIVA'
             AND v.fecha >= CURRENT_DATE - $1::integer + 1
           GROUP BY p.id
         )
         SELECT *,
           CASE WHEN unidades_vendidas + stock > 0
             THEN ROUND(unidades_vendidas::numeric * 100 / (unidades_vendidas + stock), 2)
             ELSE 0 END AS tasa_salida,
           CASE WHEN unidades_vendidas > 0
             THEN ROUND(stock::numeric / (unidades_vendidas::numeric / $1), 1)
             ELSE NULL END AS dias_stock
         FROM ventas_producto
         ORDER BY ingresos DESC, unidades_vendidas DESC, nombre
         LIMIT 12`,
        [dias]
      ),
      pool.query(
        `SELECT serie.dia::date AS fecha, COALESCE(SUM(v.total), 0) AS total
         FROM generate_series(
           CURRENT_DATE - $1::integer + 1,
           CURRENT_DATE,
           INTERVAL '1 day'
         ) serie(dia)
         LEFT JOIN ventas v ON v.fecha::date = serie.dia::date AND v.estado = 'ACTIVA'
         GROUP BY serie.dia
         ORDER BY serie.dia`,
        [dias]
      ),
      pool.query(
        `SELECT metodo_pago, COUNT(*)::int AS cantidad, COALESCE(SUM(total), 0) AS total
         FROM ventas
         WHERE estado = 'ACTIVA' AND fecha >= CURRENT_DATE - $1::integer + 1
         GROUP BY metodo_pago
         ORDER BY total DESC`,
        [dias]
      ),
    ]);

    const datosResumen = resumen.rows[0];
    const ingresos = Number(datosResumen.ingresos);
    const costoMercaderia = Number(datosResumen.costo_mercaderia);
    const gananciaBruta = ingresos - costoMercaderia;
    const ventas = Number(datosResumen.cantidad_ventas);
    const ingresosAnteriores = Number(periodoAnterior.rows[0].ingresos);
    const valorInventario = Number(inventario.rows[0].valor_costo);

    res.json({
      actualizado_en: new Date().toISOString(),
      dias,
      resumen: {
        ingresos,
        costo_mercaderia: costoMercaderia,
        ganancia_bruta: gananciaBruta,
        margen_bruto: ingresos > 0 ? gananciaBruta * 100 / ingresos : 0,
        cantidad_ventas: ventas,
        unidades_vendidas: Number(datosResumen.unidades_vendidas),
        ticket_promedio: ventas > 0 ? ingresos / ventas : 0,
        crecimiento: ingresosAnteriores > 0 ? (ingresos - ingresosAnteriores) * 100 / ingresosAnteriores : null,
        retorno_inventario: valorInventario > 0 ? gananciaBruta / valorInventario : 0,
      },
      inventario: {
        valor_costo: valorInventario,
        valor_venta: Number(inventario.rows[0].valor_venta),
        unidades: Number(inventario.rows[0].unidades),
        sin_stock: Number(inventario.rows[0].sin_stock),
        stock_bajo: Number(inventario.rows[0].stock_bajo),
        stock_saludable: Number(inventario.rows[0].stock_saludable),
        rotacion_sobre_stock_actual: valorInventario > 0 ? costoMercaderia / valorInventario : 0,
      },
      cuentas: {
        total_pendiente: Number(cuentas.rows[0].total_pendiente),
        total_vencido: Number(cuentas.rows[0].total_vencido),
      },
      productos: productos.rows,
      ventas_diarias: ventasDiarias.rows,
      medios_pago: mediosPago.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo estadísticas" });
  }
};

module.exports = {
  obtenerMetricas,
  obtenerEstadisticas,
};
