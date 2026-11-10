require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const productosRoutes = require("./routes/productosRoutes");
const dashboardRoutes = require("./routes/dashboardRoutes");
const clientesRoutes = require("./routes/clientesRoutes");
const ventasRoutes = require("./routes/ventasRoutes");
const cajaRoutes = require("./routes/cajaRoutes");
const operacionesRoutes = require("./routes/operacionesRoutes");
const presupuestosRoutes = require("./routes/presupuestosRoutes");
const administracionRoutes = require("./routes/administracionRoutes");
const planillasRoutes = require("./routes/planillasRoutes");
const { autenticar } = require("./middleware/auth");

const app = express();

const requiredEnv = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD", "JWT_SECRET"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);

if (missingEnv.length > 0) {
  throw new Error(`Faltan variables de entorno: ${missingEnv.join(", ")}`);
}

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.disable("x-powered-by");
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origen no permitido"));
  },
}));
app.use(express.json());

app.get("/api/health", (req, res) => {
  res.json({
    mensaje: "API de Trabajo Final MS2 funcionando",
  });
});

app.use("/api/auth", authRoutes);
app.use("/api", autenticar);
app.use("/api/productos", productosRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/clientes", clientesRoutes);
app.use("/api/ventas", ventasRoutes);
app.use("/api/caja", cajaRoutes);
app.use("/api/operaciones", operacionesRoutes);
app.use("/api/presupuestos", presupuestosRoutes);
app.use("/api/administracion", administracionRoutes);
app.use("/api/planillas", planillasRoutes);
const frontendDist = path.resolve(__dirname, "../../frontend/dist");

if (process.env.NODE_ENV === "production") {
  app.use(express.static(frontendDist));
  app.get("*splat", (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((error, req, res, next) => {
  console.error(error);
  res.status(500).json({ mensaje: "Error interno del servidor" });
});

const port = Number(process.env.PORT) || 3000;

const server = app.listen(port, "0.0.0.0", () => {
  console.log(`Servidor corriendo en puerto ${port}`);
});

module.exports = { app, server };
