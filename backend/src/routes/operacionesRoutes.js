const express = require("express");
const { autorizar } = require("../middleware/auth");
const {
  obtenerProveedores,
  crearProveedor,
  crearCompra,
  obtenerCompras,
  obtenerMovimientosStock,
} = require("../controllers/operacionesController");

const router = express.Router();

router.use(autorizar("ADMIN"));
router.get("/proveedores", obtenerProveedores);
router.post("/proveedores", crearProveedor);
router.get("/compras", obtenerCompras);
router.post("/compras", crearCompra);
router.get("/stock", obtenerMovimientosStock);

module.exports = router;
