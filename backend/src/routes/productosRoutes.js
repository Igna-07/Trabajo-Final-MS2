const express = require("express");
const router = express.Router();
const { autorizar } = require("../middleware/auth");

const {
  obtenerProductos,
  crearProducto,
  eliminarProducto,
  actualizarProducto,
  actualizarPreciosPorMarca,
} = require("../controllers/productosController");

router.get("/", obtenerProductos);
router.put("/marca/precios", autorizar("ADMIN"), actualizarPreciosPorMarca);
router.post("/", autorizar("ADMIN"), crearProducto);
router.delete("/:id", autorizar("ADMIN"), eliminarProducto);
router.put("/:id", autorizar("ADMIN"), actualizarProducto);

module.exports = router;
