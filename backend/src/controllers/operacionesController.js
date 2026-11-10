const pool = require("../config/db");

const obtenerProveedores = async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT * FROM proveedores_app WHERE activo = true ORDER BY nombre"
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo proveedores" });
  }
};

const crearProveedor = async (req, res) => {
  try {
    const { nombre, telefono, email, direccion } = req.body;
    if (!String(nombre || "").trim()) {
      return res.status(400).json({ mensaje: "El nombre es obligatorio" });
    }
    const resultado = await pool.query(
      `INSERT INTO proveedores_app (nombre, telefono, email, direccion)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [nombre.trim(), telefono || null, email || null, direccion || null]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error creando proveedor" });
  }
};

const crearCompra = async (req, res) => {
  const client = await pool.connect();
  try {
    const proveedorId = Number(req.body.proveedor_id);
    const items = req.body.productos;
    if (!Number.isInteger(proveedorId) || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ mensaje: "Datos de compra inválidos" });
    }

    await client.query("BEGIN");
    const detalles = [];
    let total = 0;

    for (const item of items) {
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad);
      const costo = Number(item.costo_unitario);
      if (
        !Number.isInteger(productoId) ||
        !Number.isInteger(cantidad) ||
        cantidad < 1 ||
        !Number.isFinite(costo) ||
        costo < 0
      ) {
        throw Object.assign(new Error("Producto, cantidad o costo inválidos"), {
          status: 400,
        });
      }
      const producto = await client.query(
        "SELECT id, stock FROM productos WHERE id = $1 FOR UPDATE",
        [productoId]
      );
      if (!producto.rowCount) {
        throw Object.assign(new Error("Producto no encontrado"), { status: 404 });
      }
      const subtotal = cantidad * costo;
      total += subtotal;
      detalles.push({
        productoId,
        cantidad,
        costo,
        subtotal,
        stockAnterior: Number(producto.rows[0].stock),
      });
    }

    const compra = await client.query(
      `INSERT INTO compras_app (proveedor_id, usuario_id, total)
       VALUES ($1, $2, $3) RETURNING *`,
      [proveedorId, req.usuario.id, total]
    );

    for (const detalle of detalles) {
      await client.query(
        `INSERT INTO detalle_compras_app
         (compra_id, producto_id, cantidad, costo_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          compra.rows[0].id,
          detalle.productoId,
          detalle.cantidad,
          detalle.costo,
          detalle.subtotal,
        ]
      );
      const stockNuevo = detalle.stockAnterior + detalle.cantidad;
      await client.query(
        "UPDATE productos SET stock = $1, costo = $2 WHERE id = $3",
        [stockNuevo, detalle.costo, detalle.productoId]
      );
      await client.query(
        `INSERT INTO movimientos_stock_app
         (producto_id, usuario_id, tipo, cantidad, stock_anterior, stock_nuevo, referencia)
         VALUES ($1, $2, 'COMPRA', $3, $4, $5, $6)`,
        [
          detalle.productoId,
          req.usuario.id,
          detalle.cantidad,
          detalle.stockAnterior,
          stockNuevo,
          `compra:${compra.rows[0].id}`,
        ]
      );
    }

    await client.query("COMMIT");
    res.status(201).json({ mensaje: "Compra registrada", compra: compra.rows[0] });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    res.status(error.status || 500).json({
      mensaje: error.status ? error.message : "Error registrando compra",
    });
  } finally {
    client.release();
  }
};

const obtenerCompras = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT c.id, c.total, c.fecha, p.nombre AS proveedor
       FROM compras_app c
       JOIN proveedores_app p ON p.id = c.proveedor_id
       ORDER BY c.id DESC`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo compras" });
  }
};

const obtenerMovimientosStock = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT m.*, p.marca AS producto_marca, p.nombre AS producto
       FROM movimientos_stock_app m
       JOIN productos p ON p.id = m.producto_id
       ORDER BY m.id DESC LIMIT 500`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo movimientos de stock" });
  }
};

module.exports = {
  obtenerProveedores,
  crearProveedor,
  crearCompra,
  obtenerCompras,
  obtenerMovimientosStock,
};
