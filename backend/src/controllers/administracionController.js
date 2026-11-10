const bcrypt = require("bcrypt");
const pool = require("../config/db");

const RECARGOS_BASE = [
  ["VISA", 1],
  ["VISA", 2],
  ["VISA", 3],
  ["VISA", 6],
  ["VISA", 12],
  ["MASTERCARD", 1],
  ["MASTERCARD", 2],
  ["MASTERCARD", 3],
  ["MASTERCARD", 6],
  ["MASTERCARD", 12],
  ["NARANJA_X", 1],
  ["NARANJA_X", 2],
  ["NARANJA_X", 3],
  ["NARANJA_X", 6],
  ["NARANJA_X", 12],
  ...Array.from({ length: 12 }, (_, indice) => ["EFECTIVO", indice + 1]),
];

const asegurarRecargosBase = async () => {
  await pool.query(`
    ALTER TABLE recargos_tarjeta_app
      DROP CONSTRAINT IF EXISTS recargos_tarjeta_app_marca_check
  `);
  await pool.query(`
    ALTER TABLE recargos_tarjeta_app
      ADD CONSTRAINT recargos_tarjeta_app_marca_check
      CHECK (marca IN ('VISA', 'MASTERCARD', 'NARANJA_X', 'EFECTIVO'))
  `);

  await pool.query(
    `INSERT INTO recargos_tarjeta_app (marca, cantidad_cuotas, porcentaje)
     SELECT marca, cantidad_cuotas, 0
     FROM UNNEST($1::text[], $2::int[]) AS base(marca, cantidad_cuotas)
     ON CONFLICT (marca, cantidad_cuotas) DO NOTHING`,
    [
      RECARGOS_BASE.map(([marca]) => marca),
      RECARGOS_BASE.map(([, cuotas]) => cuotas),
    ]
  );
};

const listarUsuarios = async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nombre, email, rol, activo, fecha_creacion
       FROM usuarios
       ORDER BY id`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo usuarios" });
  }
};

const crearUsuario = async (req, res) => {
  try {
    const nombre = String(req.body.nombre || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const rol = req.body.rol === "ADMIN" ? "ADMIN" : "EMPLEADO";

    if (!nombre || !email || password.length < 10) {
      return res.status(400).json({
        mensaje: "Nombre, email y contraseña de al menos 10 caracteres son obligatorios",
      });
    }

    const hash = await bcrypt.hash(password, 12);
    const resultado = await pool.query(
      `INSERT INTO usuarios (nombre, email, password, rol)
       VALUES ($1, $2, $3, $4)
       RETURNING id, nombre, email, rol, activo, fecha_creacion`,
      [nombre, email, hash, rol]
    );
    res.status(201).json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(error.code === "23505" ? 409 : 500).json({
      mensaje: error.code === "23505"
        ? "Ya existe un usuario con ese email"
        : "Error creando usuario",
    });
  }
};

const actualizarUsuario = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const nombre = String(req.body.nombre || "").trim();
    const rol = req.body.rol === "ADMIN" ? "ADMIN" : "EMPLEADO";
    const activo = Boolean(req.body.activo);
    const password = String(req.body.password || "");

    if (!nombre || (password && password.length < 10)) {
      return res.status(400).json({
        mensaje: "El nombre es obligatorio y la nueva contraseña debe tener al menos 10 caracteres",
      });
    }
    if (id === req.usuario.id && (!activo || rol !== "ADMIN")) {
      return res.status(400).json({
        mensaje: "No podés quitarte tus propios permisos de administrador",
      });
    }

    const parametros = [nombre, rol, activo, id];
    let passwordSql = "";
    if (password) {
      parametros.push(await bcrypt.hash(password, 12));
      passwordSql = `, password = $${parametros.length}`;
    }

    const resultado = await pool.query(
      `UPDATE usuarios
       SET nombre = $1, rol = $2, activo = $3${passwordSql}
       WHERE id = $4
       RETURNING id, nombre, email, rol, activo, fecha_creacion`,
      parametros
    );
    if (!resultado.rowCount) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error actualizando usuario" });
  }
};

const listarRecargos = async (req, res) => {
  try {
    await asegurarRecargosBase();
    const resultado = await pool.query(
      `SELECT * FROM recargos_tarjeta_app
       WHERE activo = true
       ORDER BY marca, cantidad_cuotas`
    );
    res.json(resultado.rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error obteniendo recargos" });
  }
};

const actualizarRecargo = async (req, res) => {
  try {
    const porcentaje = Number(req.body.porcentaje);
    if (!Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 500) {
      return res.status(400).json({ mensaje: "Porcentaje inválido" });
    }
    const configuracion = await pool.query(
      "SELECT marca, cantidad_cuotas FROM recargos_tarjeta_app WHERE id = $1",
      [req.params.id]
    );
    if (!configuracion.rowCount) {
      return res.status(404).json({ mensaje: "Configuración no encontrada" });
    }
    if (
      configuracion.rows[0].marca !== "EFECTIVO" &&
      Number(configuracion.rows[0].cantidad_cuotas) === 1 &&
      porcentaje !== 0
    ) {
      return res.status(400).json({
        mensaje: "No se permite recargo para pagos con tarjeta en un pago",
      });
    }
    const resultado = await pool.query(
      `UPDATE recargos_tarjeta_app
       SET porcentaje = $1, fecha_actualizacion = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [porcentaje, req.params.id]
    );
    res.json(resultado.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ mensaje: "Error actualizando recargo" });
  }
};

module.exports = {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  listarRecargos,
  actualizarRecargo,
};
