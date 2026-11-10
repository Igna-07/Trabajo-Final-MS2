const express = require("express");
const router = express.Router();
const { autorizar } = require("../middleware/auth");

const {
  obtenerClientes,
  crearCliente,
  actualizarCliente,
  eliminarCliente,
} = require("../controllers/clientesController");

router.get("/", obtenerClientes);
router.post("/", crearCliente);
router.put("/:id", actualizarCliente);
router.delete("/:id", autorizar("ADMIN"), eliminarCliente);

module.exports = router;
