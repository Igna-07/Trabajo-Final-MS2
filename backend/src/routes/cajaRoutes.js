const express = require("express");
const router = express.Router();

const {
  obtenerCajaDiaria,
  abrirCaja,
  cerrarCaja,
} = require("../controllers/cajaController");

router.get("/diaria", obtenerCajaDiaria);
router.post("/abrir", abrirCaja);
router.post("/cerrar", cerrarCaja);

module.exports = router;
