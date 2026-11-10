const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const autenticar = async (req, res, next) => {
  const authorization = req.headers.authorization;

  if (!authorization?.startsWith("Bearer ")) {
    return res.status(401).json({ mensaje: "Acceso no autorizado" });
  }

  try {
    const token = jwt.verify(
      authorization.slice("Bearer ".length),
      process.env.JWT_SECRET
    );
    const resultado = await pool.query(
      `SELECT id, nombre, email, rol
       FROM usuarios
       WHERE id = $1 AND activo = true`,
      [token.id]
    );
    if (!resultado.rowCount) {
      return res.status(401).json({ mensaje: "Usuario inactivo o inexistente" });
    }
    req.usuario = resultado.rows[0];
    next();
  } catch {
    return res.status(401).json({ mensaje: "Sesión vencida o inválida" });
  }
};

const autorizar = (...roles) => (req, res, next) => {
  if (!req.usuario || !roles.includes(req.usuario.rol)) {
    return res.status(403).json({
      mensaje: "No tenés permisos para realizar esta acción",
    });
  }

  next();
};

module.exports = { autenticar, autorizar };
