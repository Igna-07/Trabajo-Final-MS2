const pool = require("../config/db");

const grillaVacia = () =>
  Array.from({ length: 10 }, () => Array.from({ length: 6 }, () => ""));

const normalizarContenido = (contenido) => {
  if (!Array.isArray(contenido)) return grillaVacia();

  return contenido
    .slice(0, 200)
    .map((fila) =>
      Array.isArray(fila)
        ? fila.slice(0, 50).map((celda) => String(celda ?? ""))
        : []
    );
};

const obtenerPlanillas = async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT
        planillas.id,
        planillas.nombre,
        planillas.cliente_id,
        planillas.fecha_actualizacion,
        clientes.nombre AS cliente_nombre,
        clientes.apellido AS cliente_apellido
      FROM planillas_clientes_app planillas
      LEFT JOIN clientes ON clientes.id = planillas.cliente_id
      ORDER BY planillas.fecha_actualizacion DESC, planillas.id DESC
    `);

    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo planillas" });
  }
};

const obtenerPlanilla = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT *
       FROM planillas_clientes_app
       WHERE id = $1`,
      [req.params.id]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "Planilla no encontrada" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo la planilla" });
  }
};

const crearPlanilla = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || "").trim();
    const clienteId = req.body.cliente_id ? Number(req.body.cliente_id) : null;
    const contenido = normalizarContenido(req.body.contenido);

    if (!nombre) {
      return res.status(400).json({ mensaje: "El nombre es obligatorio" });
    }
    if (clienteId !== null && !Number.isInteger(clienteId)) {
      return res.status(400).json({ mensaje: "Cliente invalido" });
    }

    const resultado = await pool.query(
      `INSERT INTO planillas_clientes_app
       (nombre, cliente_id, usuario_id, contenido)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [nombre, clienteId, req.usuario.id, JSON.stringify(contenido)]
    );

    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error creando planilla" });
  }
};

const actualizarPlanilla = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || "").trim();
    const clienteId = req.body.cliente_id ? Number(req.body.cliente_id) : null;
    const contenido = normalizarContenido(req.body.contenido);

    if (!nombre) {
      return res.status(400).json({ mensaje: "El nombre es obligatorio" });
    }
    if (clienteId !== null && !Number.isInteger(clienteId)) {
      return res.status(400).json({ mensaje: "Cliente invalido" });
    }

    const resultado = await pool.query(
      `UPDATE planillas_clientes_app
       SET nombre = $1,
           cliente_id = $2,
           contenido = $3,
           fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE id = $4
       RETURNING *`,
      [nombre, clienteId, JSON.stringify(contenido), req.params.id]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "Planilla no encontrada" });
    }

    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error guardando planilla" });
  }
};

const eliminarPlanilla = async (req, res) => {
  try {
    const resultado = await pool.query(
      "DELETE FROM planillas_clientes_app WHERE id = $1",
      [req.params.id]
    );

    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "Planilla no encontrada" });
    }

    res.json({ mensaje: "Planilla eliminada" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error eliminando planilla" });
  }
};

module.exports = {
  obtenerPlanillas,
  obtenerPlanilla,
  crearPlanilla,
  actualizarPlanilla,
  eliminarPlanilla,
};
