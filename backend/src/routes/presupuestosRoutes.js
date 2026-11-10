const express = require("express");
const {
  obtenerPresupuestos,
  crearPresupuesto,
  obtenerPresupuesto,
} = require("../controllers/presupuestosController");

const router = express.Router();
router.get("/", obtenerPresupuestos);
router.post("/", crearPresupuesto);
router.get("/:id", obtenerPresupuesto);
module.exports = router;
