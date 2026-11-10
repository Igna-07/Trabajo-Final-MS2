const express = require("express");
const { autorizar } = require("../middleware/auth");
const {
  listarUsuarios,
  crearUsuario,
  actualizarUsuario,
  listarRecargos,
  actualizarRecargo,
} = require("../controllers/administracionController");

const router = express.Router();

router.get("/recargos", listarRecargos);
router.use(autorizar("ADMIN"));
router.get("/usuarios", listarUsuarios);
router.post("/usuarios", crearUsuario);
router.put("/usuarios/:id", actualizarUsuario);
router.put("/recargos/:id", actualizarRecargo);

module.exports = router;
