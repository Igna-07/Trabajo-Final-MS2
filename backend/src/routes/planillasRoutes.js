const express = require("express");
const router = express.Router();

const {
  obtenerPlanillas,
  obtenerPlanilla,
  crearPlanilla,
  actualizarPlanilla,
  eliminarPlanilla,
} = require("../controllers/planillasController");

router.get("/", obtenerPlanillas);
router.post("/", crearPlanilla);
router.get("/:id", obtenerPlanilla);
router.put("/:id", actualizarPlanilla);
router.delete("/:id", eliminarPlanilla);

module.exports = router;
