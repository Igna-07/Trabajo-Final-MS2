const pool = require("../config/db");

const validarCliente = ({ nombre, email }) => {
  if (!String(nombre || "").trim()) return "El nombre es obligatorio";
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return "El email no es válido";
  }
  return null;
};

const obtenerClientes = async (req, res) => {
  try {
    const resultado = await pool.query(
      "SELECT * FROM clientes ORDER BY id DESC"
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo clientes" });
  }
};

const crearCliente = async (req, res) => {
  try {
    const { nombre, apellido, telefono, email, direccion } = req.body;

    const errorValidacion = validarCliente(req.body);
    if (errorValidacion) {
      return res.status(400).json({ mensaje: errorValidacion });
    }

    const resultado = await pool.query(
      `
      INSERT INTO clientes (nombre, apellido, telefono, email, direccion)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
      `,
      [
        nombre.trim(),
        apellido?.trim() || null,
        telefono?.trim() || null,
        email?.trim() || null,
        direccion?.trim() || null,
      ]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error creando cliente" });
  }
};

const actualizarCliente = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, apellido, telefono, email, direccion } = req.body;

    const errorValidacion = validarCliente(req.body);
    if (errorValidacion) {
      return res.status(400).json({ mensaje: errorValidacion });
    }

    const resultado = await pool.query(
      `
      UPDATE clientes
      SET nombre = $1,
          apellido = $2,
          telefono = $3,
          email = $4,
          direccion = $5
      WHERE id = $6
      RETURNING *
      `,
      [
        nombre.trim(),
        apellido?.trim() || null,
        telefono?.trim() || null,
        email?.trim() || null,
        direccion?.trim() || null,
        id,
      ]
    );

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error actualizando cliente" });
  }
};

const eliminarCliente = async (req, res) => {
  try {
    const { id } = req.params;

    const resultado = await pool.query("DELETE FROM clientes WHERE id = $1", [id]);

    if (resultado.rowCount === 0) {
      return res.status(404).json({ mensaje: "Cliente no encontrado" });
    }

    res.json({ mensaje: "Cliente eliminado" });
  } catch (error) {
    console.error(error);
    const enUso = error.code === "23503";
    res.status(enUso ? 409 : 500).json({
      mensaje: enUso
        ? "No se puede eliminar un cliente que tiene ventas registradas"
        : "Error eliminando cliente",
    });
  }
};

module.exports = {
  obtenerClientes,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
};
