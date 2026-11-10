const pool = require("../config/db");

const obtenerPresupuestos = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT p.*, c.nombre, c.apellido
       FROM presupuestos_app p
       JOIN clientes c ON c.id = p.cliente_id
       ORDER BY p.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo presupuestos" });
  }
};

const crearPresupuesto = async (req, res) => {
  const client = await pool.connect();
  try {
    const clienteId = Number(req.body.cliente_id);
    const productos = req.body.productos;
    if (!Number.isInteger(clienteId) || !Array.isArray(productos) || !productos.length) {
      return res.status(400).json({ mensaje: "Datos de presupuesto inválidos" });
    }
    await client.query("BEGIN");
    const detalles = [];
    let total = 0;
    for (const item of productos) {
      const producto = await client.query(
        "SELECT id, precio FROM productos WHERE id = $1",
        [item.producto_id]
      );
      const cantidad = Number(item.cantidad);
      if (!producto.rowCount || !Number.isInteger(cantidad) || cantidad < 1) {
        throw Object.assign(new Error("Producto o cantidad inválidos"), { status: 400 });
      }
      const precio = Number(producto.rows[0].precio);
      const subtotal = precio * cantidad;
      total += subtotal;
      detalles.push({ productoId: producto.rows[0].id, cantidad, precio, subtotal });
    }
    const presupuesto = await client.query(
      `INSERT INTO presupuestos_app (cliente_id, usuario_id, total, valido_hasta)
       VALUES ($1, $2, $3, CURRENT_DATE + INTERVAL '15 days') RETURNING *`,
      [clienteId, req.usuario.id, total]
    );
    for (const item of detalles) {
      await client.query(
        `INSERT INTO detalle_presupuestos_app
         (presupuesto_id, producto_id, cantidad, precio_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [presupuesto.rows[0].id, item.productoId, item.cantidad, item.precio, item.subtotal]
      );
    }
    await client.query("COMMIT");
    res.status(201).json(presupuesto.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(error.status || 500).json({ mensaje: error.status ? error.message : "Error creando presupuesto" });
  } finally {
    client.release();
  }
};

const obtenerPresupuesto = async (req, res) => {
  try {
    const presupuesto = await pool.query(
      `SELECT p.*, c.nombre, c.apellido, c.telefono, c.email, c.direccion,
              u.nombre AS creado_por
       FROM presupuestos_app p
       JOIN clientes c ON c.id = p.cliente_id
       JOIN usuarios u ON u.id = p.usuario_id
       WHERE p.id = $1`,
      [req.params.id]
    );
    if (!presupuesto.rowCount) {
      return res.status(404).json({ mensaje: "Presupuesto no encontrado" });
    }
    const detalles = await pool.query(
      `SELECT d.*, producto.marca, producto.nombre
       FROM detalle_presupuestos_app d
       JOIN productos producto ON producto.id = d.producto_id
       WHERE d.presupuesto_id = $1
       ORDER BY d.id`,
      [req.params.id]
    );
    res.json({ ...presupuesto.rows[0], productos: detalles.rows });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo el presupuesto" });
  }
};

module.exports = { obtenerPresupuestos, crearPresupuesto, obtenerPresupuesto };
