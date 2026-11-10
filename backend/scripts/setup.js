require("dotenv").config();

const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const pool = require("../src/config/db");

const setup = async () => {
  const schemaPath = path.resolve(__dirname, "../../database/schema.sql");
  await pool.query(fs.readFileSync(schemaPath, "utf8"));

  const crearUsuarioInicial = async ({ nombre, email, password, rol }) => {
    if (!email || !password) return;
    if (password.length < 10) {
      throw new Error(`La contraseña inicial de ${rol} debe tener al menos 10 caracteres`);
    }

    const hash = await bcrypt.hash(password, 12);
    await pool.query(
      `INSERT INTO usuarios (nombre, email, password, rol, activo)
       VALUES ($1, LOWER($2), $3, $4, true)
       ON CONFLICT (email)
       DO UPDATE SET nombre = EXCLUDED.nombre,
                     password = EXCLUDED.password,
                     rol = EXCLUDED.rol,
                     activo = true`,
      [nombre, email.trim(), hash, rol]
    );
  };

  await crearUsuarioInicial({
    nombre: process.env.ADMIN_NAME || "Administrador",
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    rol: "ADMIN",
  });
  await crearUsuarioInicial({
    nombre: process.env.EMPLOYEE_NAME || "Empleado",
    email: process.env.EMPLOYEE_EMAIL,
    password: process.env.EMPLOYEE_PASSWORD,
    rol: "EMPLEADO",
  });

  const administradores = await pool.query(
    "SELECT id FROM usuarios WHERE rol = 'ADMIN' AND activo = true LIMIT 1"
  );
  if (!administradores.rowCount) {
    await pool.query(
      `UPDATE usuarios
       SET rol = 'ADMIN'
       WHERE id = (
         SELECT id FROM usuarios WHERE activo = true ORDER BY id LIMIT 1
       )`
    );
    console.log("El usuario activo más antiguo fue promovido a administrador");
  }

  console.log("Base de datos preparada");
};

setup()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
