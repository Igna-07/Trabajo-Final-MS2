const pool = require("../config/db");
const { randomUUID } = require("crypto");

const METODOS_PAGO = [
  "Efectivo",
  "Transferencia",
  "Tarjeta",
  "Cuotas",
  "Cuotas efectivo",
  "A cuenta",
  "Cheques",
  "Credito",
];
const MARCAS_TARJETA = ["VISA", "MASTERCARD", "NARANJA_X"];

const obtenerRecargo = async (client, marca, cantidadCuotas) => {
  const resultado = await client.query(
    `SELECT porcentaje
     FROM recargos_tarjeta_app
     WHERE marca = $1 AND cantidad_cuotas = $2 AND activo = true`,
    [marca, cantidadCuotas]
  );
  if (!resultado.rowCount) {
    throw Object.assign(
      new Error("No hay un recargo configurado para esa tarjeta y cantidad de cuotas"),
      { status: 400 }
    );
  }
  return Number(resultado.rows[0].porcentaje);
};

const crearVenta = async (req, res) => {
  const client = await pool.connect();

  try {
    const {
      cliente_id,
      metodo_pago,
      productos,
      cantidad_cuotas,
      marca_tarjeta,
      descuento,
      cantidad_cheques,
    } = req.body;

    if (
      !Number.isInteger(Number(cliente_id)) ||
      !METODOS_PAGO.includes(metodo_pago) ||
      !Array.isArray(productos) ||
      productos.length === 0
    ) {
      return res.status(400).json({ mensaje: "Datos de venta inválidos" });
    }

    const cantidadCuotas = Number(cantidad_cuotas);
    const esVentaEnCuotas = metodo_pago === "Cuotas" || metodo_pago === "Cuotas efectivo";
    const usaTarjeta = metodo_pago === "Tarjeta" || metodo_pago === "Cuotas";
    const cantidadCheques = Number(cantidad_cheques);

    if (
      esVentaEnCuotas &&
      (!Number.isInteger(cantidadCuotas) ||
        cantidadCuotas < (metodo_pago === "Cuotas efectivo" ? 1 : 2) ||
        (metodo_pago === "Cuotas efectivo" && cantidadCuotas > 12))
    ) {
      return res.status(400).json({
        mensaje: "La cantidad de cuotas seleccionada no es válida",
      });
    }
    if (usaTarjeta && !MARCAS_TARJETA.includes(marca_tarjeta)) {
      return res.status(400).json({ mensaje: "Seleccioná una tarjeta válida" });
    }
    if (
      metodo_pago === "Cheques" &&
      (!Number.isInteger(cantidadCheques) || cantidadCheques < 1 || cantidadCheques > 10)
    ) {
      return res.status(400).json({ mensaje: "Seleccioná una cantidad de cheques entre 1 y 10" });
    }

    await client.query("BEGIN");

    const items = [];
    let subtotalVenta = 0;

    for (const item of productos) {
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad);

      if (!Number.isInteger(productoId) || !Number.isInteger(cantidad) || cantidad < 1) {
        throw Object.assign(new Error("Producto o cantidad inválidos"), {
          status: 400,
        });
      }

      const producto = await client.query(
        `SELECT id, marca, nombre, costo, precio, stock
         FROM productos
         WHERE id = $1
         FOR UPDATE`,
        [productoId]
      );

      if (producto.rowCount === 0) {
        throw Object.assign(new Error("El producto no existe"), { status: 404 });
      }

      const datosProducto = producto.rows[0];

      if (Number(datosProducto.stock) < cantidad) {
        throw Object.assign(
          new Error(
            `Stock insuficiente para ${datosProducto.nombre}. Disponible: ${datosProducto.stock}`
          ),
          { status: 409 }
        );
      }

      const precioUnitario = Number(datosProducto.precio);
      const subtotal = precioUnitario * cantidad;
      subtotalVenta += subtotal;
      items.push({
        productoId,
        cantidad,
        precioUnitario,
        costoUnitario: Number(datosProducto.costo),
        subtotal,
        stockAnterior: Number(datosProducto.stock),
      });
    }

    const cuotasParaRecargo = esVentaEnCuotas ? cantidadCuotas : 1;
    const marcaRecargo = metodo_pago === "Cuotas efectivo" ? "EFECTIVO" : marca_tarjeta;
    const porcentajeRecargo = esVentaEnCuotas
      ? await obtenerRecargo(client, marcaRecargo, cuotasParaRecargo)
      : 0;
    const montoRecargo = Number(
      (subtotalVenta * porcentajeRecargo / 100).toFixed(2)
    );
    const montoDescuento = Number(Number(descuento || 0).toFixed(2));
    if (!Number.isFinite(montoDescuento) || montoDescuento < 0 || montoDescuento > subtotalVenta) {
      throw Object.assign(
        new Error("El descuento debe ser un importe válido y no puede superar el subtotal"),
        { status: 400 }
      );
    }
    const total = Number((subtotalVenta + montoRecargo - montoDescuento).toFixed(2));

    const venta = await client.query(
      `INSERT INTO ventas
       (cliente_id, usuario_id, subtotal, total, metodo_pago, marca_tarjeta,
        porcentaje_recargo, monto_recargo, descuento, cantidad_cheques)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        Number(cliente_id),
        req.usuario.id,
        subtotalVenta,
        total,
        metodo_pago,
        usaTarjeta ? marca_tarjeta : null,
        porcentajeRecargo,
        montoRecargo,
        montoDescuento,
        metodo_pago === "Cheques" ? cantidadCheques : null,
      ]
    );

    const ventaId = venta.rows[0].id;

    for (const item of items) {
      await client.query(
        `INSERT INTO detalle_ventas
         (venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          ventaId,
          item.productoId,
          item.cantidad,
          item.precioUnitario,
          item.costoUnitario,
          item.subtotal,
        ]
      );

      await client.query(
        `UPDATE productos
         SET stock = stock - $1
         WHERE id = $2`,
        [item.cantidad, item.productoId]
      );
      await client.query(
        `INSERT INTO movimientos_stock_app
         (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia)
         VALUES ($1, $2, 'VENTA', $3, $4, $5, $6)`,
        [
          item.productoId,
          req.usuario.id,
          -item.cantidad,
          item.stockAnterior,
          item.stockAnterior - item.cantidad,
          `venta:${ventaId}`,
        ]
      );
    }

    if (esVentaEnCuotas) {
      const montoCuota = Number((total / cantidadCuotas).toFixed(2));
      const ventaCuota = await client.query(
        `INSERT INTO ventas_cuotas
         (venta_id, cantidad_cuotas, monto_cuota, total_financiado)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [ventaId, cantidadCuotas, montoCuota, total]
      );

      for (let numero = 1; numero <= cantidadCuotas; numero += 1) {
        const monto =
          numero === cantidadCuotas
            ? Number((total - montoCuota * (cantidadCuotas - 1)).toFixed(2))
            : montoCuota;

        // La primera cuota se abona en el momento de la venta, así que vence
        // el mismo día y las siguientes corren mes a mes desde ahí.
        const cobradaAlRegistrar = numero === 1;

        const cuotaCreada = await client.query(
          `INSERT INTO cuotas
           (venta_cuota_id, numero_cuota, monto, fecha_vencimiento,
            pagada, fecha_pago, pagada_al_registrar)
           VALUES (
             $1,
             $2,
             $3,
             (CURRENT_DATE + (($4::integer - 1) * INTERVAL '1 month'))::date,
             $5,
             CASE WHEN $5 THEN CURRENT_DATE ELSE NULL END,
             $5
           )
           RETURNING id`,
          [ventaCuota.rows[0].id, numero, monto, numero, cobradaAlRegistrar]
        );

        if (!cobradaAlRegistrar) continue;

        // Queda con comprobante e ingreso en caja igual que un cobro hecho
        // desde Cuentas por Cobrar, para que el cierre de caja cuadre.
        const cuotaId = cuotaCreada.rows[0].id;

        await client.query(
          `INSERT INTO cobros_cuotas_app
           (cuota_id, usuario_id, metodo_pago, marca_tarjeta, porcentaje_recargo,
            monto_base, monto_recargo, monto_total)
           VALUES ($1, $2, $3, $4, 0, $5, 0, $5)`,
          [
            cuotaId,
            req.usuario.id,
            usaTarjeta ? "Tarjeta" : "Efectivo",
            usaTarjeta ? marca_tarjeta : null,
            monto,
          ]
        );

        await client.query(
          `INSERT INTO movimientos_caja
           (tipo, descripcion, monto, metodo_pago, referencia)
           VALUES ('INGRESO', $1, $2, $3, $4)`,
          [
            `Cobro cuota #${cuotaId}`,
            monto,
            usaTarjeta ? `Tarjeta ${marca_tarjeta}` : "Efectivo",
            `cuota:${cuotaId}`,
          ]
        );
      }
    } else if (metodo_pago === "A cuenta") {
      await client.query(
        `INSERT INTO ventas_a_cuenta_app (venta_id, total, saldo_pendiente)
         VALUES ($1, $2, $2)`,
        [ventaId, total]
      );
    } else if (metodo_pago === "Cheques") {
      const planCheques = await client.query(
        `INSERT INTO ventas_cheques_app (venta_id, cantidad_cheques)
         VALUES ($1, $2)
         RETURNING id`,
        [ventaId, cantidadCheques]
      );
      for (let numero = 1; numero <= cantidadCheques; numero += 1) {
        await client.query(
          `INSERT INTO cheques_app
           (venta_cheques_id, numero_cheque, fecha_vencimiento)
           VALUES (
             $1,
             $2,
             (CURRENT_DATE + ($2::integer * INTERVAL '1 month'))::date
           )`,
          [planCheques.rows[0].id, numero]
        );
      }
    } else {
      await client.query(
        `INSERT INTO movimientos_caja
         (tipo, descripcion, monto, metodo_pago, referencia)
         VALUES ($1, $2, $3, $4, $5)`,
        ["INGRESO", `Venta #${ventaId}`, total, metodo_pago, `venta:${ventaId}`]
      );
    }

    await client.query("COMMIT");

    res.status(201).json({
      mensaje: "Venta registrada",
      venta: venta.rows[0],
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(error.status || 500).json({
      mensaje: error.status ? error.message : "Error registrando venta",
    });
  } finally {
    client.release();
  }
};

const obtenerVentas = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         ventas.id,
         ventas.total,
         ventas.subtotal,
         ventas.metodo_pago,
         ventas.marca_tarjeta,
         ventas.porcentaje_recargo,
         ventas.monto_recargo,
         ventas.descuento,
         ventas.cantidad_cheques,
         ventas.estado,
         ventas.fecha,
         clientes.nombre AS cliente_nombre,
         clientes.apellido AS cliente_apellido,
         COALESCE((
           SELECT string_agg(
             producto.marca || ' · ' || producto.nombre || ' x' || detalle.cantidad,
             ', ' ORDER BY detalle.id
           )
           FROM detalle_ventas detalle
           JOIN productos producto ON producto.id = detalle.producto_id
           WHERE detalle.venta_id = ventas.id
         ), '') AS productos_resumen
       FROM ventas
       LEFT JOIN clientes ON ventas.cliente_id = clientes.id
       ORDER BY ventas.id DESC`
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo ventas" });
  }
};

const obtenerCuotasPendientes = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        cuotas.id,
        cuotas.numero_cuota,
        cuotas.monto,
        cuotas.fecha_vencimiento,
        cuotas.pagada,
        cuotas.fecha_pago,
        ventas_cuotas.id AS venta_cuota_id,
        cobros.id AS comprobante_id,
        cobros.metodo_pago AS metodo_pago_cobro,
        cobros.marca_tarjeta AS marca_tarjeta_cobro,
        cobros.porcentaje_recargo AS porcentaje_recargo_cobro,
        cobros.monto_recargo AS monto_recargo_cobro,
        cobros.monto_total AS monto_total_cobro,
        ventas.id AS venta_id,
        ventas.total AS total_venta,
        ventas_cuotas.cantidad_cuotas,
        clientes.id AS cliente_id,
        clientes.nombre,
        clientes.apellido,
        COALESCE((
          SELECT string_agg(
            producto.marca || ' · ' || producto.nombre || ' x' || detalle.cantidad,
            ', ' ORDER BY detalle.id
          )
          FROM detalle_ventas detalle
          JOIN productos producto ON producto.id = detalle.producto_id
          WHERE detalle.venta_id = ventas.id
        ), '') AS productos_resumen
      FROM cuotas
      INNER JOIN ventas_cuotas
        ON cuotas.venta_cuota_id = ventas_cuotas.id
      INNER JOIN ventas
        ON ventas_cuotas.venta_id = ventas.id
      INNER JOIN clientes
        ON ventas.cliente_id = clientes.id
      LEFT JOIN cobros_cuotas_app cobros
        ON cobros.cuota_id = cuotas.id
      WHERE ventas_cuotas.archivada = false
      ORDER BY ventas.id DESC, cuotas.numero_cuota ASC
    `);

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo cuotas" });
  }
};

const pagarCuota = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const cuota = await client.query(
      `SELECT id, monto, pagada
       FROM cuotas
       WHERE id = $1
       FOR UPDATE`,
      [req.params.id]
    );

    if (cuota.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ mensaje: "La cuota no existe" });
    }

    if (cuota.rows[0].pagada) {
      await client.query("ROLLBACK");
      return res.status(409).json({ mensaje: "La cuota ya fue pagada" });
    }

    const metodoPago = String(req.body.metodo_pago || "");
    const marcaTarjeta = req.body.marca_tarjeta || null;
    const usaTarjeta = metodoPago === "Tarjeta";
    if (!["Efectivo", "Transferencia", "Tarjeta", "Credito"].includes(metodoPago)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "Método de pago inválido" });
    }
    if (usaTarjeta && !MARCAS_TARJETA.includes(marcaTarjeta)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "Seleccioná una tarjeta válida" });
    }

    // En Argentina no se traslada un recargo por pagar una cuota en un pago
    // con tarjeta. La marca se conserva para el comprobante y la caja.
    const porcentajeRecargo = 0;
    const montoBase = Number(cuota.rows[0].monto);
    const montoRecargo = Number((montoBase * porcentajeRecargo / 100).toFixed(2));
    const montoTotal = Number((montoBase + montoRecargo).toFixed(2));

    await client.query(
      `UPDATE cuotas
       SET pagada = true, fecha_pago = CURRENT_DATE
       WHERE id = $1`,
      [req.params.id]
    );

    await client.query(
      `INSERT INTO cobros_cuotas_app
       (cuota_id, usuario_id, metodo_pago, marca_tarjeta, porcentaje_recargo,
        monto_base, monto_recargo, monto_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        req.params.id,
        req.usuario.id,
        metodoPago,
        usaTarjeta ? marcaTarjeta : null,
        porcentajeRecargo,
        montoBase,
        montoRecargo,
        montoTotal,
      ]
    );

    await client.query(
      `INSERT INTO movimientos_caja
       (tipo, descripcion, monto, metodo_pago, referencia)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        "INGRESO",
        `Cobro cuota #${req.params.id}`,
        montoTotal,
        usaTarjeta ? `Tarjeta ${marcaTarjeta}` : metodoPago,
        `cuota:${req.params.id}`,
      ]
    );

    await client.query("COMMIT");
    res.json({ mensaje: "Cuota pagada", cuota_id: Number(req.params.id) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ mensaje: "Error pagando cuota" });
  } finally {
    client.release();
  }
};

const obtenerComprobanteCuota = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         cobros.id AS comprobante_id,
         cobros.fecha,
         cobros.metodo_pago,
         cobros.marca_tarjeta,
         cobros.porcentaje_recargo,
         cobros.monto_base,
         cobros.monto_recargo,
         cobros.monto_total,
         cuotas.id AS cuota_id,
         cuotas.numero_cuota,
         ventas_cuotas.cantidad_cuotas,
         ventas.id AS venta_id,
         clientes.nombre,
         clientes.apellido,
         usuarios.nombre AS cobrado_por,
         COALESCE((
           SELECT SUM(c2.monto)
           FROM cuotas c2
           WHERE c2.venta_cuota_id = cuotas.venta_cuota_id
             AND c2.pagada = false
         ), 0) AS saldo_pendiente
       FROM cobros_cuotas_app cobros
       JOIN cuotas ON cuotas.id = cobros.cuota_id
       JOIN ventas_cuotas ON ventas_cuotas.id = cuotas.venta_cuota_id
       JOIN ventas ON ventas.id = ventas_cuotas.venta_id
       JOIN clientes ON clientes.id = ventas.cliente_id
       JOIN usuarios ON usuarios.id = cobros.usuario_id
       WHERE cuotas.id = $1`,
      [req.params.id]
    );
    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "La cuota todavía no tiene un cobro" });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo el comprobante" });
  }
};

const archivarPlanCuotas = async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE ventas_cuotas vc
       SET archivada = true
       WHERE vc.id = $1
         AND NOT EXISTS (
           SELECT 1
           FROM cuotas c
           WHERE c.venta_cuota_id = vc.id
             AND c.pagada = false
         )
       RETURNING vc.id`,
      [req.params.id]
    );

    if (!resultado.rowCount) {
      return res.status(409).json({
        mensaje: "Solo se puede quitar una cuenta cuando todas sus cuotas están pagadas",
      });
    }

    res.json({ mensaje: "Cuenta archivada" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error archivando la cuenta" });
  }
};

const obtenerChequesPendientes = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        cheque.id,
        cheque.numero_cheque,
        cheque.fecha_vencimiento,
        cheque.cobrado,
        cheque.fecha_cobro,
        plan.id AS venta_cheques_id,
        plan.cantidad_cheques,
        cobro.id AS comprobante_id,
        ventas.id AS venta_id,
        clientes.id AS cliente_id,
        clientes.nombre,
        clientes.apellido
      FROM cheques_app cheque
      JOIN ventas_cheques_app plan ON plan.id = cheque.venta_cheques_id
      JOIN ventas ON ventas.id = plan.venta_id
      JOIN clientes ON clientes.id = ventas.cliente_id
      LEFT JOIN cobros_cheques_app cobro ON cobro.cheque_id = cheque.id
      WHERE plan.archivada = false
        AND ventas.estado = 'ACTIVA'
      ORDER BY ventas.id DESC, cheque.numero_cheque ASC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo cheques" });
  }
};

const cobrarCheque = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cheque = await client.query(
      `SELECT
         cheque.id,
         cheque.numero_cheque,
         cheque.cobrado,
         plan.cantidad_cheques,
         ventas.id AS venta_id,
         ventas.total
       FROM cheques_app cheque
       JOIN ventas_cheques_app plan ON plan.id = cheque.venta_cheques_id
       JOIN ventas ON ventas.id = plan.venta_id
       WHERE cheque.id = $1
       FOR UPDATE OF cheque`,
      [req.params.id]
    );
    if (!cheque.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ mensaje: "El cheque no existe" });
    }
    if (cheque.rows[0].cobrado) {
      await client.query("ROLLBACK");
      return res.status(409).json({ mensaje: "El cheque ya fue cobrado" });
    }

    await client.query(
      `UPDATE cheques_app
       SET cobrado = true, fecha_cobro = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.params.id]
    );
    await client.query(
      `INSERT INTO cobros_cheques_app (cheque_id, usuario_id)
       VALUES ($1, $2)`,
      [req.params.id, req.usuario.id]
    );

    const datos = cheque.rows[0];
    const movimientoExistente = await client.query(
      `SELECT id FROM movimientos_caja
       WHERE referencia = $1 AND tipo = 'INGRESO'
       LIMIT 1`,
      [`venta:${datos.venta_id}`]
    );
    if (!movimientoExistente.rowCount) {
      const cantidad = Number(datos.cantidad_cheques);
      const numero = Number(datos.numero_cheque);
      const importeBase = Number((Number(datos.total) / cantidad).toFixed(2));
      const importe = numero === cantidad
        ? Number((Number(datos.total) - importeBase * (cantidad - 1)).toFixed(2))
        : importeBase;
      await client.query(
        `INSERT INTO movimientos_caja
         (tipo, descripcion, monto, metodo_pago, referencia)
         VALUES ('INGRESO', $1, $2, 'Cheques', $3)`,
        [`Cobro cheque ${numero} de venta #${datos.venta_id}`, importe, `cheque:${req.params.id}`]
      );
    }

    await client.query("COMMIT");
    res.json({ mensaje: "Cheque cobrado", cheque_id: Number(req.params.id) });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ mensaje: "Error cobrando el cheque" });
  } finally {
    client.release();
  }
};

const obtenerComprobanteCheque = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT
         cobro.id AS comprobante_id,
         cobro.fecha,
         cheque.numero_cheque,
         cheque.fecha_vencimiento,
         plan.cantidad_cheques,
         ventas.id AS venta_id,
         clientes.nombre,
         clientes.apellido,
         usuarios.nombre AS cobrado_por
       FROM cobros_cheques_app cobro
       JOIN cheques_app cheque ON cheque.id = cobro.cheque_id
       JOIN ventas_cheques_app plan ON plan.id = cheque.venta_cheques_id
       JOIN ventas ON ventas.id = plan.venta_id
       JOIN clientes ON clientes.id = ventas.cliente_id
       JOIN usuarios ON usuarios.id = cobro.usuario_id
       WHERE cheque.id = $1`,
      [req.params.id]
    );
    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "El cheque todavía no fue cobrado" });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo el comprobante del cheque" });
  }
};

const archivarPlanCheques = async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE ventas_cheques_app plan
       SET archivada = true
       WHERE plan.id = $1
         AND NOT EXISTS (
           SELECT 1 FROM cheques_app cheque
           WHERE cheque.venta_cheques_id = plan.id
             AND cheque.cobrado = false
         )
       RETURNING plan.id`,
      [req.params.id]
    );
    if (!resultado.rowCount) {
      return res.status(409).json({
        mensaje: "Solo se puede quitar el plan cuando todos sus cheques están cobrados",
      });
    }
    res.json({ mensaje: "Plan de cheques archivado" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error archivando los cheques" });
  }
};

const obtenerVentasACuenta = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        cuenta.id,
        cuenta.venta_id,
        cuenta.total,
        cuenta.saldo_pendiente,
        cuenta.fecha_creacion,
        clientes.id AS cliente_id,
        clientes.nombre,
        clientes.apellido,
        COALESCE((
          SELECT json_agg(json_build_object(
            'id', pago.id,
            'monto', pago.monto,
            'metodo_pago', pago.metodo_pago,
            'marca_tarjeta', pago.marca_tarjeta,
            'grupo_pago', pago.grupo_pago,
            'fecha', pago.fecha
          ) ORDER BY pago.id DESC)
          FROM pagos_a_cuenta_app pago
          WHERE pago.venta_a_cuenta_id = cuenta.id
        ), '[]'::json) AS pagos
      FROM ventas_a_cuenta_app cuenta
      JOIN ventas ON ventas.id = cuenta.venta_id
      JOIN clientes ON clientes.id = ventas.cliente_id
      WHERE cuenta.archivada = false
        AND ventas.estado = 'ACTIVA'
      ORDER BY cuenta.id DESC
    `);
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo ventas a cuenta" });
  }
};

const registrarPagoACuenta = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cuenta = await client.query(
      `SELECT id, venta_id, saldo_pendiente
       FROM ventas_a_cuenta_app
       WHERE id = $1 AND archivada = false
       FOR UPDATE`,
      [req.params.id]
    );
    if (!cuenta.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ mensaje: "La cuenta no existe" });
    }

    const monto = Number(req.body.monto);
    const saldoPendiente = Number(cuenta.rows[0].saldo_pendiente);
    const metodoPago = String(req.body.metodo_pago || "");
    const marcaTarjeta = req.body.marca_tarjeta || null;
    const usaTarjeta = metodoPago === "Tarjeta";

    if (!Number.isFinite(monto) || monto <= 0 || monto > saldoPendiente) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "El importe debe ser mayor a cero y no superar el saldo pendiente" });
    }
    if (!["Efectivo", "Transferencia", "Tarjeta", "Credito"].includes(metodoPago)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "Método de pago inválido" });
    }
    if (usaTarjeta && !MARCAS_TARJETA.includes(marcaTarjeta)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "Seleccioná una tarjeta válida" });
    }

    const pago = await client.query(
      `INSERT INTO pagos_a_cuenta_app
       (venta_a_cuenta_id, usuario_id, metodo_pago, marca_tarjeta, monto)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [req.params.id, req.usuario.id, metodoPago, usaTarjeta ? marcaTarjeta : null, monto]
    );
    const nuevoSaldo = Number((saldoPendiente - monto).toFixed(2));
    await client.query(
      `UPDATE ventas_a_cuenta_app SET saldo_pendiente = $1 WHERE id = $2`,
      [nuevoSaldo, req.params.id]
    );
    await client.query(
      `INSERT INTO movimientos_caja
       (tipo, descripcion, monto, metodo_pago, referencia)
       VALUES ('INGRESO', $1, $2, $3, $4)`,
      [
        `Entrega a cuenta venta #${cuenta.rows[0].venta_id}`,
        monto,
        usaTarjeta ? `Tarjeta ${marcaTarjeta}` : metodoPago,
        `a-cuenta-pago:${pago.rows[0].id}`,
      ]
    );
    await client.query("COMMIT");
    res.json({ mensaje: "Entrega registrada", pago_id: pago.rows[0].id, saldo_pendiente: nuevoSaldo });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ mensaje: "Error registrando la entrega" });
  } finally {
    client.release();
  }
};

const registrarPagoClienteACuenta = async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cuentas = await client.query(
      `SELECT cuenta.id, cuenta.venta_id, cuenta.saldo_pendiente
       FROM ventas_a_cuenta_app cuenta
       JOIN ventas ON ventas.id = cuenta.venta_id
       WHERE ventas.cliente_id = $1
         AND ventas.estado = 'ACTIVA'
         AND cuenta.archivada = false
         AND cuenta.saldo_pendiente > 0
       ORDER BY cuenta.fecha_creacion, cuenta.id
       FOR UPDATE OF cuenta`,
      [req.params.clienteId]
    );
    if (!cuentas.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ mensaje: "El cliente no tiene saldo pendiente" });
    }

    const monto = Number(req.body.monto);
    const saldoTotal = cuentas.rows.reduce(
      (total, cuenta) => total + Number(cuenta.saldo_pendiente),
      0
    );
    const metodoPago = String(req.body.metodo_pago || "");
    const marcaTarjeta = req.body.marca_tarjeta || null;
    const usaTarjeta = metodoPago === "Tarjeta";

    if (!Number.isFinite(monto) || monto <= 0 || monto > saldoTotal) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "El importe debe ser mayor a cero y no superar el saldo total" });
    }
    if (!["Efectivo", "Transferencia", "Tarjeta", "Credito"].includes(metodoPago)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "Método de pago inválido" });
    }
    if (usaTarjeta && !MARCAS_TARJETA.includes(marcaTarjeta)) {
      await client.query("ROLLBACK");
      return res.status(400).json({ mensaje: "Seleccioná una tarjeta válida" });
    }

    const grupoPago = randomUUID();
    const pagosIds = [];
    let restante = monto;
    for (const cuenta of cuentas.rows) {
      if (restante <= 0) break;
      const saldoCuenta = Number(cuenta.saldo_pendiente);
      const aplicado = Number(Math.min(restante, saldoCuenta).toFixed(2));
      const nuevoSaldo = Number((saldoCuenta - aplicado).toFixed(2));
      const pago = await client.query(
        `INSERT INTO pagos_a_cuenta_app
         (venta_a_cuenta_id, usuario_id, metodo_pago, marca_tarjeta, monto, grupo_pago)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [cuenta.id, req.usuario.id, metodoPago, usaTarjeta ? marcaTarjeta : null, aplicado, grupoPago]
      );
      pagosIds.push(pago.rows[0].id);
      await client.query(
        "UPDATE ventas_a_cuenta_app SET saldo_pendiente = $1 WHERE id = $2",
        [nuevoSaldo, cuenta.id]
      );
      restante = Number((restante - aplicado).toFixed(2));
    }

    await client.query(
      `INSERT INTO movimientos_caja
       (tipo, descripcion, monto, metodo_pago, referencia)
       VALUES ('INGRESO', $1, $2, $3, $4)`,
      [
        `Entrega a cuenta cliente #${req.params.clienteId}`,
        monto,
        usaTarjeta ? `Tarjeta ${marcaTarjeta}` : metodoPago,
        `a-cuenta-grupo:${grupoPago}`,
      ]
    );
    await client.query("COMMIT");
    res.json({
      mensaje: "Entrega registrada",
      pago_id: pagosIds[0],
      saldo_pendiente: Number((saldoTotal - monto).toFixed(2)),
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ mensaje: "Error registrando la entrega" });
  } finally {
    client.release();
  }
};

const obtenerComprobantePagoACuenta = async (req, res) => {
  try {
    const resultado = await pool.query(
      `WITH elegido AS (
         SELECT id, grupo_pago
         FROM pagos_a_cuenta_app
         WHERE id = $1
       ), pagos_recibo AS (
         SELECT pago.*
         FROM pagos_a_cuenta_app pago
         CROSS JOIN elegido
         WHERE (elegido.grupo_pago IS NOT NULL AND pago.grupo_pago = elegido.grupo_pago)
            OR (elegido.grupo_pago IS NULL AND pago.id = elegido.id)
       )
       SELECT
         MIN(pago.id) AS comprobante_id,
         MIN(pago.fecha) AS fecha,
         MIN(pago.metodo_pago) AS metodo_pago,
         MIN(pago.marca_tarjeta) AS marca_tarjeta,
         SUM(pago.monto) AS monto,
         string_agg(DISTINCT ventas.id::text, ', ' ORDER BY ventas.id::text) AS ventas_ids,
         clientes.id AS cliente_id,
         clientes.nombre,
         clientes.apellido,
         MIN(usuarios.nombre) AS cobrado_por,
         COALESCE((
           SELECT SUM(cuenta_saldo.saldo_pendiente)
           FROM ventas_a_cuenta_app cuenta_saldo
           JOIN ventas venta_saldo ON venta_saldo.id = cuenta_saldo.venta_id
           WHERE venta_saldo.cliente_id = clientes.id
             AND venta_saldo.estado = 'ACTIVA'
             AND cuenta_saldo.archivada = false
         ), 0) AS saldo_pendiente
       FROM pagos_recibo pago
       JOIN ventas_a_cuenta_app cuenta ON cuenta.id = pago.venta_a_cuenta_id
       JOIN ventas ON ventas.id = cuenta.venta_id
       JOIN clientes ON clientes.id = ventas.cliente_id
       JOIN usuarios ON usuarios.id = pago.usuario_id
       GROUP BY clientes.id, clientes.nombre, clientes.apellido`,
      [req.params.id]
    );
    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "Comprobante no encontrado" });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo el comprobante" });
  }
};

const archivarVentasACuentaCliente = async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE ventas_a_cuenta_app cuenta
       SET archivada = true
       WHERE cuenta.archivada = false
         AND cuenta.venta_id IN (
           SELECT id FROM ventas
           WHERE cliente_id = $1 AND estado = 'ACTIVA'
         )
         AND NOT EXISTS (
           SELECT 1
           FROM ventas_a_cuenta_app pendiente
           JOIN ventas venta_pendiente ON venta_pendiente.id = pendiente.venta_id
           WHERE venta_pendiente.cliente_id = $1
             AND venta_pendiente.estado = 'ACTIVA'
             AND pendiente.archivada = false
             AND pendiente.saldo_pendiente > 0
         )
       RETURNING cuenta.id`,
      [req.params.clienteId]
    );
    if (!resultado.rowCount) {
      return res.status(409).json({ mensaje: "Solo se puede eliminar una cuenta totalmente pagada" });
    }
    res.json({ mensaje: "Cuenta del cliente archivada" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error archivando la cuenta del cliente" });
  }
};

const archivarVentaACuenta = async (req, res) => {
  try {
    const resultado = await pool.query(
      `UPDATE ventas_a_cuenta_app
       SET archivada = true
       WHERE id = $1 AND saldo_pendiente = 0
       RETURNING id`,
      [req.params.id]
    );
    if (!resultado.rowCount) {
      return res.status(409).json({ mensaje: "Solo se puede quitar una cuenta totalmente pagada" });
    }
    res.json({ mensaje: "Cuenta archivada" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error archivando la cuenta" });
  }
};

const obtenerVenta = async (req, res) => {
  try {
    const venta = await pool.query(
      `SELECT v.*, c.nombre AS cliente_nombre, c.apellido AS cliente_apellido
       FROM ventas v
       LEFT JOIN clientes c ON c.id = v.cliente_id
       WHERE v.id = $1`,
      [req.params.id]
    );

    if (venta.rowCount === 0) {
      return res.status(404).json({ mensaje: "Venta no encontrada" });
    }

    const detalles = await pool.query(
      `SELECT d.*, p.marca AS producto_marca, p.nombre AS producto_nombre
       FROM detalle_ventas d
       JOIN productos p ON p.id = d.producto_id
       WHERE d.venta_id = $1
       ORDER BY d.id`,
      [req.params.id]
    );

    res.json({ ...venta.rows[0], productos: detalles.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo la venta" });
  }
};

const editarVenta = async (req, res) => {
  const client = await pool.connect();
  try {
    const clienteId = Number(req.body.cliente_id);
    const productosSolicitados = req.body.productos;
    const descuento = Number(Number(req.body.descuento || 0).toFixed(2));
    if (
      !Number.isInteger(clienteId) ||
      !Array.isArray(productosSolicitados) ||
      productosSolicitados.length === 0 ||
      !Number.isFinite(descuento) ||
      descuento < 0
    ) {
      return res.status(400).json({ mensaje: "Datos de edición inválidos" });
    }

    const cantidades = new Map();
    for (const item of productosSolicitados) {
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad);
      if (!Number.isInteger(productoId) || !Number.isInteger(cantidad) || cantidad < 1) {
        return res.status(400).json({ mensaje: "Producto o cantidad inválidos" });
      }
      cantidades.set(productoId, (cantidades.get(productoId) || 0) + cantidad);
    }

    await client.query("BEGIN");
    const venta = await client.query(
      "SELECT * FROM ventas WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );
    if (!venta.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ mensaje: "Venta no encontrada" });
    }
    if (venta.rows[0].estado === "ANULADA") {
      await client.query("ROLLBACK");
      return res.status(409).json({ mensaje: "No se puede editar una venta anulada" });
    }

    const cobros = await client.query(
      `SELECT
         (SELECT COUNT(*) FROM cuotas cuota
          JOIN ventas_cuotas plan ON plan.id = cuota.venta_cuota_id
          WHERE plan.venta_id = $1 AND cuota.pagada = true
            AND cuota.pagada_al_registrar = false)
         +
         (SELECT COUNT(*) FROM pagos_a_cuenta_app pago
          JOIN ventas_a_cuenta_app cuenta ON cuenta.id = pago.venta_a_cuenta_id
          WHERE cuenta.venta_id = $1)
         +
         (SELECT COUNT(*) FROM cobros_cheques_app cobro
          JOIN cheques_app cheque ON cheque.id = cobro.cheque_id
          JOIN ventas_cheques_app plan_cheques ON plan_cheques.id = cheque.venta_cheques_id
          WHERE plan_cheques.venta_id = $1) AS total`,
      [req.params.id]
    );
    if (Number(cobros.rows[0].total) > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        mensaje: "No se puede editar una venta que ya tiene cuotas, entregas o cheques cobrados",
      });
    }

    const cliente = await client.query("SELECT id FROM clientes WHERE id = $1", [clienteId]);
    if (!cliente.rowCount) {
      await client.query("ROLLBACK");
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    const detallesAnteriores = await client.query(
      `SELECT producto_id, cantidad, precio_unitario, costo_unitario
       FROM detalle_ventas WHERE venta_id = $1`,
      [req.params.id]
    );
    const anteriores = new Map(detallesAnteriores.rows.map((item) => [
      Number(item.producto_id),
      {
        cantidad: Number(item.cantidad),
        precio: Number(item.precio_unitario),
        costo: Number(item.costo_unitario),
      },
    ]));
    const idsProductos = [...new Set([...anteriores.keys(), ...cantidades.keys()])].sort((a, b) => a - b);
    const productos = await client.query(
      `SELECT id, marca, nombre, precio, costo, stock
       FROM productos
       WHERE id = ANY($1::int[])
       ORDER BY id
       FOR UPDATE`,
      [idsProductos]
    );
    if (productos.rowCount !== idsProductos.length) {
      throw Object.assign(new Error("Uno de los productos ya no existe"), { status: 404 });
    }

    const productosPorId = new Map(productos.rows.map((producto) => [Number(producto.id), producto]));
    const nuevosDetalles = [];
    let subtotal = 0;
    for (const [productoId, cantidad] of cantidades) {
      const producto = productosPorId.get(productoId);
      const anterior = anteriores.get(productoId);
      const disponible = Number(producto.stock) + Number(anterior?.cantidad || 0);
      if (cantidad > disponible) {
        throw Object.assign(
          new Error(`Stock insuficiente para ${producto.nombre}. Disponible: ${disponible}`),
          { status: 409 }
        );
      }
      const precio = anterior?.precio ?? Number(producto.precio);
      const costo = anterior?.costo ?? Number(producto.costo);
      const subtotalDetalle = Number((precio * cantidad).toFixed(2));
      subtotal += subtotalDetalle;
      nuevosDetalles.push({ productoId, cantidad, precio, costo, subtotal: subtotalDetalle });
    }
    subtotal = Number(subtotal.toFixed(2));
    if (descuento > subtotal) {
      throw Object.assign(new Error("El descuento no puede superar el subtotal"), { status: 400 });
    }
    const porcentajeRecargo = Number(venta.rows[0].porcentaje_recargo || 0);
    const montoRecargo = Number((subtotal * porcentajeRecargo / 100).toFixed(2));
    const total = Number((subtotal + montoRecargo - descuento).toFixed(2));

    for (const productoId of idsProductos) {
      const producto = productosPorId.get(productoId);
      const cantidadAnterior = anteriores.get(productoId)?.cantidad || 0;
      const cantidadNueva = cantidades.get(productoId) || 0;
      const diferenciaVenta = cantidadNueva - cantidadAnterior;
      if (diferenciaVenta === 0) continue;
      const stockAnterior = Number(producto.stock);
      const stockNuevo = stockAnterior - diferenciaVenta;
      await client.query("UPDATE productos SET stock = $1 WHERE id = $2", [stockNuevo, productoId]);
      await client.query(
        `INSERT INTO movimientos_stock_app
         (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia)
         VALUES ($1, $2, 'EDICION_VENTA', $3, $4, $5, $6)`,
        [
          productoId,
          req.usuario.id,
          -diferenciaVenta,
          stockAnterior,
          stockNuevo,
          `edicion:venta:${req.params.id}:${productoId}:${Date.now()}`,
        ]
      );
    }

    await client.query("DELETE FROM detalle_ventas WHERE venta_id = $1", [req.params.id]);
    for (const detalle of nuevosDetalles) {
      await client.query(
        `INSERT INTO detalle_ventas
         (venta_id, producto_id, cantidad, precio_unitario, costo_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, detalle.productoId, detalle.cantidad, detalle.precio, detalle.costo, detalle.subtotal]
      );
    }

    await client.query(
      `UPDATE ventas
       SET cliente_id = $1, subtotal = $2, monto_recargo = $3,
           descuento = $4, total = $5
       WHERE id = $6`,
      [clienteId, subtotal, montoRecargo, descuento, total, req.params.id]
    );

    const planCuotas = await client.query(
      "SELECT id, cantidad_cuotas FROM ventas_cuotas WHERE venta_id = $1",
      [req.params.id]
    );
    if (planCuotas.rowCount) {
      const cantidadCuotas = Number(planCuotas.rows[0].cantidad_cuotas);
      const montoCuota = Number((total / cantidadCuotas).toFixed(2));
      await client.query(
        "UPDATE ventas_cuotas SET monto_cuota = $1, total_financiado = $2 WHERE id = $3",
        [montoCuota, total, planCuotas.rows[0].id]
      );
      for (let numero = 1; numero <= cantidadCuotas; numero += 1) {
        const monto = numero === cantidadCuotas
          ? Number((total - montoCuota * (cantidadCuotas - 1)).toFixed(2))
          : montoCuota;
        await client.query(
          "UPDATE cuotas SET monto = $1 WHERE venta_cuota_id = $2 AND numero_cuota = $3",
          [monto, planCuotas.rows[0].id, numero]
        );
      }

      // Si la primera cuota ya se cobró al registrar la venta, su comprobante
      // y su ingreso en caja tienen que seguir al monto nuevo.
      const cobradasAlRegistrar = await client.query(
        `SELECT id, monto
         FROM cuotas
         WHERE venta_cuota_id = $1 AND pagada_al_registrar = true`,
        [planCuotas.rows[0].id]
      );
      for (const cuota of cobradasAlRegistrar.rows) {
        await client.query(
          `UPDATE cobros_cuotas_app
           SET monto_base = $1, monto_recargo = 0, monto_total = $1
           WHERE cuota_id = $2`,
          [cuota.monto, cuota.id]
        );
        await client.query(
          "UPDATE movimientos_caja SET monto = $1 WHERE referencia = $2",
          [cuota.monto, `cuota:${cuota.id}`]
        );
      }
    }

    if (venta.rows[0].metodo_pago === "A cuenta") {
      await client.query(
        `UPDATE ventas_a_cuenta_app
         SET total = $1, saldo_pendiente = $1
         WHERE venta_id = $2`,
        [total, req.params.id]
      );
    } else if (venta.rows[0].metodo_pago === "Cheques") {
      await client.query(
        `UPDATE movimientos_caja
         SET monto = $1, metodo_pago = 'Cheques'
         WHERE referencia = $2`,
        [total, `venta:${req.params.id}`]
      );
    } else if (!planCuotas.rowCount) {
      const movimiento = await client.query(
        `UPDATE movimientos_caja
         SET monto = $1, metodo_pago = $2
         WHERE referencia = $3`,
        [total, venta.rows[0].metodo_pago, `venta:${req.params.id}`]
      );
      if (!movimiento.rowCount) {
        await client.query(
          `INSERT INTO movimientos_caja
           (tipo, descripcion, monto, metodo_pago, referencia)
           VALUES ('INGRESO', $1, $2, $3, $4)`,
          [`Venta #${req.params.id}`, total, venta.rows[0].metodo_pago, `venta:${req.params.id}`]
        );
      }
    }

    await client.query(
      `INSERT INTO auditoria_app
       (usuario_id, accion, entidad, entidad_id, detalle)
       VALUES ($1, 'EDITAR', 'VENTA', $2, $3)`,
      [
        req.usuario.id,
        req.params.id,
        JSON.stringify({ total_anterior: venta.rows[0].total, total_nuevo: total }),
      ]
    );
    await client.query("COMMIT");
    res.json({ mensaje: "Venta actualizada", venta_id: Number(req.params.id), total });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(error.status || 500).json({
      mensaje: error.status ? error.message : "Error editando la venta",
    });
  } finally {
    client.release();
  }
};

const anularVenta = async (req, res) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    const venta = await client.query(
      "SELECT * FROM ventas WHERE id = $1 FOR UPDATE",
      [req.params.id]
    );

    if (venta.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ mensaje: "Venta no encontrada" });
    }
    if (venta.rows[0].estado === "ANULADA") {
      await client.query("ROLLBACK");
      return res.status(409).json({ mensaje: "La venta ya está anulada" });
    }

    const pagos = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM cuotas c
       JOIN ventas_cuotas vc ON vc.id = c.venta_cuota_id
       WHERE vc.venta_id = $1 AND c.pagada = true
         AND c.pagada_al_registrar = false`,
      [req.params.id]
    );
    if (pagos.rows[0].total > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        mensaje: "No se puede anular una venta que tiene cuotas pagadas",
      });
    }

    const entregasACuenta = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM pagos_a_cuenta_app pago
       JOIN ventas_a_cuenta_app cuenta ON cuenta.id = pago.venta_a_cuenta_id
       WHERE cuenta.venta_id = $1`,
      [req.params.id]
    );
    if (entregasACuenta.rows[0].total > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        mensaje: "No se puede anular una venta que tiene entregas a cuenta registradas",
      });
    }

    const chequesCobrados = await client.query(
      `SELECT COUNT(*)::int AS total
       FROM cobros_cheques_app cobro
       JOIN cheques_app cheque ON cheque.id = cobro.cheque_id
       JOIN ventas_cheques_app plan ON plan.id = cheque.venta_cheques_id
       WHERE plan.venta_id = $1`,
      [req.params.id]
    );
    if (chequesCobrados.rows[0].total > 0) {
      await client.query("ROLLBACK");
      return res.status(409).json({
        mensaje: "No se puede anular una venta que tiene cheques cobrados",
      });
    }

    const detalles = await client.query(
      "SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = $1",
      [req.params.id]
    );
    for (const detalle of detalles.rows) {
      const producto = await client.query(
        "SELECT stock FROM productos WHERE id = $1 FOR UPDATE",
        [detalle.producto_id]
      );
      const stockAnterior = Number(producto.rows[0].stock);
      await client.query(
        "UPDATE productos SET stock = stock + $1 WHERE id = $2",
        [detalle.cantidad, detalle.producto_id]
      );
      await client.query(
        `INSERT INTO movimientos_stock_app
         (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia)
         VALUES ($1, $2, 'ANULACION_VENTA', $3, $4, $5, $6)`,
        [
          detalle.producto_id,
          req.usuario.id,
          detalle.cantidad,
          stockAnterior,
          stockAnterior + Number(detalle.cantidad),
          `anulacion:${req.params.id}`,
        ]
      );
    }

    await client.query(
      `UPDATE ventas
       SET estado = 'ANULADA', fecha_anulacion = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [req.params.id]
    );

    // La primera cuota se cobra al registrar la venta: antes de borrar las
    // cuotas hay que quitar su comprobante y devolver el ingreso a la caja.
    const cobradasAlRegistrar = await client.query(
      `SELECT c.id, c.monto
       FROM cuotas c
       JOIN ventas_cuotas vc ON vc.id = c.venta_cuota_id
       WHERE vc.venta_id = $1 AND c.pagada_al_registrar = true`,
      [req.params.id]
    );
    for (const cuota of cobradasAlRegistrar.rows) {
      await client.query(
        "DELETE FROM cobros_cuotas_app WHERE cuota_id = $1",
        [cuota.id]
      );
      await client.query(
        `INSERT INTO movimientos_caja
         (tipo, descripcion, monto, metodo_pago, referencia)
         VALUES ('EGRESO', $1, $2, $3, $4)`,
        [
          `Anulación cobro cuota #${cuota.id}`,
          cuota.monto,
          venta.rows[0].metodo_pago === "Cuotas"
            ? `Tarjeta ${venta.rows[0].marca_tarjeta}`
            : "Efectivo",
          `anulacion:cuota:${cuota.id}`,
        ]
      );
    }

    await client.query(
      `DELETE FROM cuotas
       WHERE venta_cuota_id IN (
         SELECT id FROM ventas_cuotas WHERE venta_id = $1
       )`,
      [req.params.id]
    );

    await client.query(
      "DELETE FROM ventas_cheques_app WHERE venta_id = $1",
      [req.params.id]
    );

    const pagoDiferido = ["Cuotas", "Cuotas efectivo", "A cuenta", "Cheques"]
      .includes(venta.rows[0].metodo_pago);
    let debeRevertirIngreso = !pagoDiferido;
    if (venta.rows[0].metodo_pago === "Cheques") {
      const ingresoAnterior = await client.query(
        `SELECT id FROM movimientos_caja
         WHERE referencia = $1 AND tipo = 'INGRESO'
         LIMIT 1`,
        [`venta:${req.params.id}`]
      );
      debeRevertirIngreso = ingresoAnterior.rowCount > 0;
    }
    if (debeRevertirIngreso) {
      await client.query(
        `INSERT INTO movimientos_caja
         (tipo, descripcion, monto, metodo_pago, referencia)
         VALUES ('EGRESO', $1, $2, $3, $4)`,
        [
          `Anulación venta #${req.params.id}`,
          venta.rows[0].total,
          venta.rows[0].metodo_pago,
          `anulacion:${req.params.id}`,
        ]
      );
    }

    await client.query(
      `INSERT INTO auditoria_app
       (usuario_id, accion, entidad, entidad_id, detalle)
       VALUES ($1, 'ANULAR', 'VENTA', $2, $3)`,
      [req.usuario.id, req.params.id, JSON.stringify({ motivo: req.body.motivo || null })]
    );

    await client.query("COMMIT");
    res.json({ mensaje: "Venta anulada y stock restaurado" });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(500).json({ mensaje: "Error anulando la venta" });
  } finally {
    client.release();
  }
};

module.exports = {
  crearVenta,
  obtenerVentas,
  obtenerVenta,
  editarVenta,
  anularVenta,
  obtenerCuotasPendientes,
  pagarCuota,
  obtenerComprobanteCuota,
  archivarPlanCuotas,
  obtenerChequesPendientes,
  cobrarCheque,
  obtenerComprobanteCheque,
  archivarPlanCheques,
  obtenerVentasACuenta,
  registrarPagoACuenta,
  registrarPagoClienteACuenta,
  obtenerComprobantePagoACuenta,
  archivarVentaACuenta,
  archivarVentasACuentaCliente,
};
