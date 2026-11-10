const express = require("express");
const { autorizar } = require("../middleware/auth");
const router = express.Router();
router.use(autorizar("ADMIN"));

const {
  obtenerMetricas,
  obtenerEstadisticas,
} = require("../controllers/dashboardController");

router.get("/metricas", obtenerMetricas);
router.get("/estadisticas", obtenerEstadisticas);

module.exports = router;
