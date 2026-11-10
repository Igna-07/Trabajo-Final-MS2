const express = require("express");
const router = express.Router();
const { autorizar } = require("../middleware/auth");

const {
  crearVenta,
  obtenerVentas,
  obtenerCuotasPendientes,
  pagarCuota,
  obtenerComprobanteCuota,
  archivarPlanCuotas,
  obtenerChequesPendientes,
  cobrarCheque,
  obtenerComprobanteCheque,
  archivarPlanCheques,
  obtenerVentasACuenta,
  registrarPagoACuenta,
  registrarPagoClienteACuenta,
  obtenerComprobantePagoACuenta,
  archivarVentaACuenta,
  archivarVentasACuentaCliente,
  obtenerVenta,
  editarVenta,
  anularVenta,
} = require("../controllers/ventasController");

router.get("/", obtenerVentas);
router.post("/", crearVenta);
router.get("/cuotas", obtenerCuotasPendientes);
router.get("/cheques", obtenerChequesPendientes);
router.put("/cheques/:id/cobrar", cobrarCheque);
router.get("/cheques/:id/comprobante", obtenerComprobanteCheque);
router.delete("/cheques/planes/:id", archivarPlanCheques);
router.get("/a-cuenta", obtenerVentasACuenta);
router.put("/a-cuenta/clientes/:clienteId/pagar", registrarPagoClienteACuenta);
router.delete("/a-cuenta/clientes/:clienteId", archivarVentasACuentaCliente);
router.put("/a-cuenta/:id/pagar", registrarPagoACuenta);
router.get("/a-cuenta/pagos/:id/comprobante", obtenerComprobantePagoACuenta);
router.delete("/a-cuenta/:id", archivarVentaACuenta);
router.get("/:id", obtenerVenta);
router.put("/:id", autorizar("ADMIN"), editarVenta);
router.delete("/:id", autorizar("ADMIN"), anularVenta);

router.put(
  "/cuotas/:id/pagar",
  pagarCuota
);
router.get("/cuotas/:id/comprobante", obtenerComprobanteCuota);
router.delete("/cuotas/planes/:id", archivarPlanCuotas);

module.exports = router;
