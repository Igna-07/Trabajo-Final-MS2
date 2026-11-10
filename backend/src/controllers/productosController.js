const pool = require("../config/db");

const validarProducto = ({ marca, nombre, costo, precio, stock }) => {
  if (!String(marca || "").trim()) return "La marca es obligatoria";
  if (!String(nombre || "").trim()) return "El nombre es obligatorio";
  if (!Number.isFinite(Number(costo)) || Number(costo) < 0) {
    return "El costo debe ser un numero mayor o igual a cero";
  }
  if (!Number.isFinite(Number(precio)) || Number(precio) < 0) {
    return "El precio debe ser un número mayor o igual a cero";
  }
  if (!Number.isInteger(Number(stock)) || Number(stock) < 0) {
    return "El stock debe ser un número entero mayor o igual a cero";
  }
  return null;
};

const obtenerProductos = async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT * FROM productos ORDER BY id DESC"
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: "Error al obtener productos",
      error: error.message,
    });
  }
};

const crearProducto = async (req, res) => {
  try {
    const {
      marca,
      nombre,
      descripcion,
      costo,
      precio,
      stock,
    } = req.body;

    const errorValidacion = validarProducto(req.body);
    if (errorValidacion) {
      return res.status(400).json({ mensaje: errorValidacion });
    }

    const resultado = await pool.query(
      `
      INSERT INTO productos
      (
        marca,
        nombre,
        descripcion,
        costo,
        precio,
        stock
      )
      VALUES
      ($1,$2,$3,$4,$5,$6)
      RETURNING *
      `,
      [
        marca.trim(),
        nombre.trim(),
        descripcion?.trim() || null,
        Number(costo),
        Number(precio),
        Number(stock),
      ]
    );

    res.status(201).json(
      resultado.rows[0]
    );

  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: "Error creando producto",
    });
  }
};

const eliminarProducto = async (req, res) => {
  try {

    const { id } = req.params;

    const resultado = await pool.query(
      "DELETE FROM productos WHERE id = $1",
      [id]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensaje: "Producto no encontrado" });
    }

    res.json({
      mensaje: "Producto eliminado"
    });

  } catch (error) {

    console.error(error);

    const enUso = error.code === "23503";
    res.status(enUso ? 409 : 500).json({
      mensaje: enUso
        ? "No se puede eliminar un producto que tiene ventas registradas"
        : "Error eliminando producto"
    });

  }
};

const actualizarProducto = async (req, res) => {
  try {
    const { id } = req.params;
    const { marca, nombre, descripcion, costo, precio, stock } = req.body;

    const errorValidacion = validarProducto(req.body);
    if (errorValidacion) {
      return res.status(400).json({ mensaje: errorValidacion });
    }

    const resultado = await pool.query(
      `
      UPDATE productos
      SET marca = $1,
          nombre = $2,
          descripcion = $3,
          costo = $4,
          precio = $5,
          stock = $6
      WHERE id = $7
      RETURNING *
      `,
      [
        marca.trim(),
        nombre.trim(),
        descripcion?.trim() || null,
        Number(costo),
        Number(precio),
        Number(stock),
        id,
      ]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensaje: "Producto no encontrado" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      mensaje: "Error actualizando producto",
    });
  }
};

const actualizarPreciosPorMarca = async (req, res) => {
  try {
    const marca = String(req.body.marca || "").trim();
    const porcentaje = Number(req.body.porcentaje);

    if (!marca) {
      return res.status(400).json({ mensaje: "La marca es obligatoria" });
    }
    if (!Number.isFinite(porcentaje) || porcentaje < -99 || porcentaje > 500) {
      return res.status(400).json({
        mensaje: "El porcentaje debe estar entre -99 y 500",
      });
    }

    const resultado = await pool.query(
      `UPDATE productos
       SET precio = ROUND((precio * (1 + ($1 / 100.0)))::numeric, 2)
       WHERE LOWER(marca) = LOWER($2)
       RETURNING id, marca, nombre, precio`,
      [porcentaje, marca]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({
        mensaje: "No se encontraron productos con esa marca",
      });
    }

    res.json({
      mensaje: "Precios actualizados",
      cantidad: resultado.rowCount,
      productos: resultado.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error actualizando precios por marca" });
  }
};

module.exports = {
  obtenerProductos,
  crearProducto,
  eliminarProducto,
  actualizarProducto,
  actualizarPreciosPorMarca,
};

