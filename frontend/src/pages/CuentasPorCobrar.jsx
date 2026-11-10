import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";
import { encabezadoImpresion, estilosEncabezadoImpresion, finalizarImpresion } from "../services/impresion";

const agruparVentasACuenta = (cuentas) => {
  const grupos = new Map();
  cuentas.forEach((cuenta) => {
    if (!grupos.has(cuenta.cliente_id)) {
      grupos.set(cuenta.cliente_id, {
        cliente_id: cuenta.cliente_id,
        nombre: cuenta.nombre,
        apellido: cuenta.apellido,
        total: 0,
        saldo_pendiente: 0,
        ventas: [],
        pagosPorClave: new Map(),
      });
    }
    const grupo = grupos.get(cuenta.cliente_id);
    grupo.total += Number(cuenta.total);
    grupo.saldo_pendiente += Number(cuenta.saldo_pendiente);
    grupo.ventas.push({
      id: cuenta.venta_id,
      total: Number(cuenta.total),
      saldo_pendiente: Number(cuenta.saldo_pendiente),
      fecha: cuenta.fecha_creacion,
    });
    cuenta.pagos.forEach((pago) => {
      const clave = pago.grupo_pago || `pago-${pago.id}`;
      if (!grupo.pagosPorClave.has(clave)) {
        grupo.pagosPorClave.set(clave, { ...pago, monto: 0 });
      }
      grupo.pagosPorClave.get(clave).monto += Number(pago.monto);
    });
  });
  return [...grupos.values()].map((grupo) => ({
    ...grupo,
    pagos: [...grupo.pagosPorClave.values()].sort(
      (a, b) => new Date(b.fecha) - new Date(a.fecha)
    ),
  }));
};

export default function CuentasPorCobrar() {
  const [cuotas, setCuotas] = useState([]);
  const [cheques, setCheques] = useState([]);
  const [cuentas, setCuentas] = useState([]);
  const [clienteAbierto, setClienteAbierto] = useState(null);
  const [clienteChequesAbierto, setClienteChequesAbierto] = useState(null);
  const [cuotaCobrar, setCuotaCobrar] = useState(null);
  const [chequeCobrar, setChequeCobrar] = useState(null);
  const [cuentaCobrar, setCuentaCobrar] = useState(null);
  const [montoEntrega, setMontoEntrega] = useState("");
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [marcaTarjeta, setMarcaTarjeta] = useState("VISA");
  const [cuentaClienteAbierta, setCuentaClienteAbierta] = useState(null);

  const cargarDatos = async () => {
    const [cuotasRes, chequesRes, cuentasRes] = await Promise.all([
      apiFetch("/api/ventas/cuotas"),
      apiFetch("/api/ventas/cheques"),
      apiFetch("/api/ventas/a-cuenta"),
    ]);
    setCuotas(await leerRespuesta(cuotasRes));
    setCheques(await leerRespuesta(chequesRes));
    setCuentas(await leerRespuesta(cuentasRes));
  };

  useEffect(() => {
    Promise.all([
      apiFetch("/api/ventas/cuotas"),
      apiFetch("/api/ventas/cheques"),
      apiFetch("/api/ventas/a-cuenta"),
    ])
      .then(async ([cuotasRes, chequesRes, cuentasRes]) => {
        setCuotas(await leerRespuesta(cuotasRes));
        setCheques(await leerRespuesta(chequesRes));
        setCuentas(await leerRespuesta(cuentasRes));
      })
      .catch(console.error);
  }, []);

  const montoBaseCobro = Number(cuotaCobrar?.monto || 0);

  const imprimirComprobante = async (cuotaId) => {
    const ventana = window.open("", "_blank", "width=620,height=760");
    try {
      const comprobante = await leerRespuesta(
        await apiFetch(`/api/ventas/cuotas/${cuotaId}/comprobante`)
      );
      if (!ventana) {
        throw new Error("El navegador bloqueó la ventana de impresión");
      }
      ventana.document.write(`
        <html><head><title>Comprobante #${comprobante.comprobante_id}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:28px;color:#111}
          ${estilosEncabezadoImpresion}
          .fila{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #ddd}
          .total{font-size:24px;font-weight:bold;margin-top:16px}
          .pie{margin-top:28px;font-size:12px;text-align:center;color:#555}
        </style></head><body>
        ${encabezadoImpresion(`Comprobante interno de pago N° ${comprobante.comprobante_id}`)}
        <p><strong>Cliente:</strong> ${comprobante.nombre} ${comprobante.apellido || ""}</p>
        <p><strong>Fecha:</strong> ${new Date(comprobante.fecha).toLocaleString("es-AR")}</p>
        <div class="fila"><span>Venta</span><strong>#${comprobante.venta_id}</strong></div>
        <div class="fila"><span>Cuota</span><strong>${comprobante.numero_cuota} de ${comprobante.cantidad_cuotas}</strong></div>
        <div class="fila"><span>Monto base</span><strong>$${Number(comprobante.monto_base).toLocaleString("es-AR")}</strong></div>
        <div class="fila"><span>Recargo (${Number(comprobante.porcentaje_recargo)}%)</span><strong>$${Number(comprobante.monto_recargo).toLocaleString("es-AR")}</strong></div>
        <div class="fila"><span>Medio de pago</span><strong>${comprobante.metodo_pago}${comprobante.marca_tarjeta ? ` - ${comprobante.marca_tarjeta.replace("_", " ")}` : ""}</strong></div>
        <p class="total">Total recibido: $${Number(comprobante.monto_total).toLocaleString("es-AR")}</p>
        <p><strong>Saldo pendiente:</strong> $${Number(comprobante.saldo_pendiente).toLocaleString("es-AR")}</p>
        <p><strong>Cobrado por:</strong> ${comprobante.cobrado_por}</p>
        <p class="pie">Comprobante interno no válido como factura fiscal.</p>
        </body></html>
      `);
      finalizarImpresion(ventana);
    } catch (error) {
      ventana?.close();
      alert(error.message);
    }
  };

  const pagarCuota = async () => {
    if (!cuotaCobrar) return;
    try {
      await leerRespuesta(await apiFetch(
        `/api/ventas/cuotas/${cuotaCobrar.id}/pagar`,
        {
          method: "PUT",
          body: JSON.stringify({
            metodo_pago: metodoPago,
            marca_tarjeta: metodoPago === "Tarjeta" ? marcaTarjeta : null,
          }),
        }
      ));
      const cuotaId = cuotaCobrar.id;
      setCuotaCobrar(null);
      await cargarDatos();
      await imprimirComprobante(cuotaId);
    } catch (error) {
      alert(error.message);
    }
  };

  const imprimirComprobanteCheque = async (chequeId) => {
    const ventana = window.open("", "_blank", "width=620,height=760");
    try {
      const comprobante = await leerRespuesta(
        await apiFetch(`/api/ventas/cheques/${chequeId}/comprobante`)
      );
      if (!ventana) throw new Error("El navegador bloqueó la ventana de impresión");
      ventana.document.write(`
        <html><head><title>Comprobante de cheque #${comprobante.comprobante_id}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:28px;color:#111}
          ${estilosEncabezadoImpresion}
          .fila{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #ddd}
          .pie{margin-top:28px;font-size:12px;text-align:center;color:#555}
        </style></head><body>
        ${encabezadoImpresion(`Comprobante de cobro de cheque N° ${comprobante.comprobante_id}`)}
        <p><strong>Cliente:</strong> ${comprobante.nombre} ${comprobante.apellido || ""}</p>
        <p><strong>Fecha de cobro:</strong> ${new Date(comprobante.fecha).toLocaleString("es-AR")}</p>
        <div class="fila"><span>Venta</span><strong>#${comprobante.venta_id}</strong></div>
        <div class="fila"><span>Cheque</span><strong>Cheque ${comprobante.numero_cheque} de ${comprobante.cantidad_cheques}</strong></div>
        <div class="fila"><span>Vencimiento</span><strong>${new Date(comprobante.fecha_vencimiento).toLocaleDateString("es-AR")}</strong></div>
        <p><strong>Estado:</strong> Cobrado</p>
        <p><strong>Cobrado por:</strong> ${comprobante.cobrado_por}</p>
        <p class="pie">Comprobante interno no válido como factura fiscal.</p>
        </body></html>
      `);
      finalizarImpresion(ventana);
    } catch (error) {
      ventana?.close();
      alert(error.message);
    }
  };

  const cobrarCheque = async () => {
    if (!chequeCobrar) return;
    try {
      await leerRespuesta(await apiFetch(
        `/api/ventas/cheques/${chequeCobrar.id}/cobrar`,
        { method: "PUT" }
      ));
      const chequeId = chequeCobrar.id;
      setChequeCobrar(null);
      await cargarDatos();
      await imprimirComprobanteCheque(chequeId);
    } catch (error) {
      alert(error.message);
    }
  };

  const archivarCheques = async (cliente, chequesCliente) => {
    if (!window.confirm(
      `¿Quitar los cheques finalizados de ${cliente}? Los comprobantes seguirán guardados.`
    )) return;
    const planes = [...new Set(chequesCliente.map((cheque) => cheque.venta_cheques_id))];
    try {
      await Promise.all(planes.map(async (planId) => {
        await leerRespuesta(await apiFetch(
          `/api/ventas/cheques/planes/${planId}`,
          { method: "DELETE" }
        ));
      }));
      if (clienteChequesAbierto === cliente) setClienteChequesAbierto(null);
      await cargarDatos();
    } catch (error) {
      alert(error.message);
    }
  };

  const imprimirComprobanteACuenta = async (pagoId) => {
    const ventana = window.open("", "_blank", "width=620,height=760");
    try {
      const comprobante = await leerRespuesta(
        await apiFetch(`/api/ventas/a-cuenta/pagos/${pagoId}/comprobante`)
      );
      if (!ventana) throw new Error("El navegador bloqueó la ventana de impresión");
      ventana.document.write(`
        <html><head><title>Comprobante #${comprobante.comprobante_id}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:28px;color:#111}
          ${estilosEncabezadoImpresion}
          .fila{display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid #ddd}
          .total{font-size:24px;font-weight:bold;margin-top:16px}
          .pie{margin-top:28px;font-size:12px;text-align:center;color:#555}
        </style></head><body>
        ${encabezadoImpresion(`Comprobante interno de entrega N° ${comprobante.comprobante_id}`)}
        <p><strong>Cliente:</strong> ${comprobante.nombre} ${comprobante.apellido || ""}</p>
        <p><strong>Fecha:</strong> ${new Date(comprobante.fecha).toLocaleString("es-AR")}</p>
        <div class="fila"><span>Ventas a cuenta</span><strong>#${comprobante.ventas_ids}</strong></div>
        <div class="fila"><span>Medio de pago</span><strong>${comprobante.metodo_pago}${comprobante.marca_tarjeta ? ` - ${comprobante.marca_tarjeta.replace("_", " ")}` : ""}</strong></div>
        <p class="total">Entrega recibida: $${Number(comprobante.monto).toLocaleString("es-AR")}</p>
        <p><strong>Saldo pendiente:</strong> $${Number(comprobante.saldo_pendiente).toLocaleString("es-AR")}</p>
        <p><strong>Cobrado por:</strong> ${comprobante.cobrado_por}</p>
        <p class="pie">Comprobante interno no válido como factura fiscal.</p>
        </body></html>
      `);
      finalizarImpresion(ventana);
    } catch (error) {
      ventana?.close();
      alert(error.message);
    }
  };

  const registrarEntrega = async () => {
    if (!cuentaCobrar) return;
    try {
      const resultado = await leerRespuesta(await apiFetch(
        `/api/ventas/a-cuenta/clientes/${cuentaCobrar.cliente_id}/pagar`,
        {
          method: "PUT",
          body: JSON.stringify({
            monto: Number(montoEntrega),
            metodo_pago: metodoPago,
            marca_tarjeta: metodoPago === "Tarjeta" ? marcaTarjeta : null,
          }),
        }
      ));
      setCuentaCobrar(null);
      setCuentaClienteAbierta(null);
      setMontoEntrega("");
      await cargarDatos();
      await imprimirComprobanteACuenta(resultado.pago_id);
    } catch (error) {
      alert(error.message);
    }
  };

  const archivarCuentaAbierta = async (cuenta) => {
    if (!window.confirm(`¿Eliminar la cuenta finalizada de ${cuenta.nombre} ${cuenta.apellido || ""}? Los comprobantes seguirán guardados.`)) return;
    try {
      await leerRespuesta(await apiFetch(`/api/ventas/a-cuenta/clientes/${cuenta.cliente_id}`, { method: "DELETE" }));
      setCuentaClienteAbierta(null);
      await cargarDatos();
    } catch (error) {
      alert(error.message);
    }
  };

  const imprimirEstadoCuenta = (cuenta) => {
    const ventana = window.open("", "_blank", "width=720,height=850");
    if (!ventana) {
      alert("El navegador bloqueó la ventana de impresión");
      return;
    }
    const ventas = cuenta.ventas.map((venta) => `
      <tr><td>#${venta.id}</td><td>${new Date(venta.fecha).toLocaleDateString("es-AR")}</td><td>$${venta.total.toLocaleString("es-AR")}</td></tr>
    `).join("");
    const pagos = cuenta.pagos.map((pago) => `
      <tr><td>${new Date(pago.fecha).toLocaleString("es-AR")}</td><td>${pago.metodo_pago}</td><td>$${Number(pago.monto).toLocaleString("es-AR")}</td></tr>
    `).join("");
    ventana.document.write(`
      <html><head><title>Estado de cuenta</title><style>
      body{font-family:Arial,sans-serif;padding:28px;color:#111}${estilosEncabezadoImpresion}
      table{width:100%;border-collapse:collapse;margin:12px 0 24px}td,th{border:1px solid #ccc;padding:8px;text-align:left}
      .resumen{display:flex;justify-content:space-between;font-size:18px;border-top:2px solid #111;padding-top:14px}
      </style></head><body>
      ${encabezadoImpresion("Estado de cuenta corriente")}
      <p><strong>Cliente:</strong> ${cuenta.nombre} ${cuenta.apellido || ""}</p>
      <h2>Ventas</h2><table><thead><tr><th>Venta</th><th>Fecha</th><th>Total</th></tr></thead><tbody>${ventas}</tbody></table>
      <h2>Entregas</h2><table><thead><tr><th>Fecha</th><th>Medio</th><th>Importe</th></tr></thead><tbody>${pagos || '<tr><td colspan="3">Sin entregas</td></tr>'}</tbody></table>
      <div class="resumen"><span>Total comprado: <strong>$${cuenta.total.toLocaleString("es-AR")}</strong></span><span>Saldo: <strong>$${cuenta.saldo_pendiente.toLocaleString("es-AR")}</strong></span></div>
      </body></html>
    `);
    finalizarImpresion(ventana);
  };

  const archivarCuenta = async (cliente, cuotasCliente) => {
    if (!window.confirm(
      `¿Quitar a ${cliente} de Cuentas por Cobrar? Los comprobantes seguirán guardados.`
    )) return;

    const planes = [
      ...new Set(cuotasCliente.map((cuota) => cuota.venta_cuota_id)),
    ];

    try {
      await Promise.all(planes.map(async (planId) => {
        const respuesta = await apiFetch(
          `/api/ventas/cuotas/planes/${planId}`,
          { method: "DELETE" }
        );
        await leerRespuesta(respuesta);
      }));
      if (clienteAbierto === cliente) setClienteAbierto(null);
      await cargarDatos();
    } catch (error) {
      alert(error.message);
    }
  };

  const cuotasPorCliente = cuotas.reduce((acc, cuota) => {
    const cliente = `${cuota.nombre} ${cuota.apellido || ""}`.trim();
    if (!acc[cliente]) acc[cliente] = [];
    acc[cliente].push(cuota);
    return acc;
  }, {});

  const chequesPorCliente = cheques.reduce((acc, cheque) => {
    const cliente = `${cheque.nombre} ${cheque.apellido || ""}`.trim();
    if (!acc[cliente]) acc[cliente] = [];
    acc[cliente].push(cheque);
    return acc;
  }, {});

  const hoy = new Date();
  const pendientes = cuotas.filter((cuota) => !cuota.pagada);
  const chequesPendientes = cheques.filter((cheque) => !cheque.cobrado);
  const cuentasAgrupadas = agruparVentasACuenta(cuentas);
  const cuentasPendientes = cuentasAgrupadas.filter((cuenta) => cuenta.saldo_pendiente > 0);
  const totalPendienteCuotas = pendientes.reduce(
    (total, cuota) => total + Number(cuota.monto),
    0
  );
  const totalPendiente = cuentasPendientes.reduce(
    (total, cuenta) => total + cuenta.saldo_pendiente,
    totalPendienteCuotas
  );
  const vencidas = pendientes.filter(
    (cuota) => new Date(cuota.fecha_vencimiento) < hoy
  );
  const proximas = pendientes.filter((cuota) => {
    const dias = Math.ceil(
      (new Date(cuota.fecha_vencimiento) - hoy) / 86400000
    );
    return dias >= 0 && dias <= 10;
  });
  const chequesVencidos = chequesPendientes.filter(
    (cheque) => new Date(cheque.fecha_vencimiento) < hoy
  );
  const chequesProximos = chequesPendientes.filter((cheque) => {
    const dias = Math.ceil(
      (new Date(cheque.fecha_vencimiento) - hoy) / 86400000
    );
    return dias >= 0 && dias <= 10;
  });

  const colorFila = (cuota) => {
    if (cuota.pagada) return "bg-green-100";
    const dias = Math.ceil(
      (new Date(cuota.fecha_vencimiento) - hoy) / 86400000
    );
    if (dias < 0) return "bg-red-100";
    if (dias <= 10) return "bg-yellow-100";
    return "";
  };

  const colorFilaCheque = (cheque) => {
    if (cheque.cobrado) return "bg-green-100";
    const dias = Math.ceil(
      (new Date(cheque.fecha_vencimiento) - hoy) / 86400000
    );
    if (dias < 0) return "bg-red-100";
    if (dias <= 10) return "bg-yellow-100";
    return "";
  };

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-6">Cuentas por Cobrar</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[
          ["Total a cobrar", `$${totalPendiente.toLocaleString("es-AR")}`],
          ["Pendientes", pendientes.length + chequesPendientes.length + cuentasPendientes.length],
          ["Próximas", proximas.length + chequesProximos.length],
          ["Vencidas", vencidas.length + chequesVencidos.length],
        ].map(([titulo, valor]) => (
          <div key={titulo} className="border rounded-xl p-4 shadow">
            <p className="text-gray-500">{titulo}</p>
            <h2 className="text-2xl font-bold">{valor}</h2>
          </div>
        ))}
      </div>

      <h2 className="text-2xl font-bold mb-4">Cuotas</h2>
      <div className="space-y-4">
        {Object.entries(cuotasPorCliente).map(([cliente, cuotasCliente]) => {
          const cuotasPendientes = cuotasCliente.filter((cuota) => !cuota.pagada);
          const deuda = cuotasPendientes.reduce(
            (total, cuota) => total + Number(cuota.monto),
            0
          );
          const todasPagadas = cuotasPendientes.length === 0;
          return (
            <div key={cliente} className="border rounded-xl overflow-hidden">
              <div className="flex bg-gray-100">
                <button
                  onClick={() => setClienteAbierto(clienteAbierto === cliente ? null : cliente)}
                  className="flex-1 flex justify-between p-4 text-left"
                >
                  <span><strong>{cliente}</strong><br />{cuotasPendientes.length} pendientes</span>
                  <strong>${deuda.toLocaleString("es-AR")}</strong>
                </button>
                {todasPagadas && (
                  <button
                    type="button"
                    onClick={() => archivarCuenta(cliente, cuotasCliente)}
                    title="Quitar cuenta finalizada"
                    aria-label={`Quitar cuenta finalizada de ${cliente}`}
                    className="px-5 text-2xl font-bold text-red-600 hover:bg-red-100"
                  >
                    ×
                  </button>
                )}
              </div>
              {clienteAbierto === cliente && (
                <div className="overflow-x-auto">
                  <table className="w-full border-t">
                    <thead>
                      <tr>
                        <th className="border p-2">Venta</th>
                        <th className="border p-2">Productos</th>
                        <th className="border p-2">Cuota</th>
                        <th className="border p-2">Monto</th>
                        <th className="border p-2">Vencimiento</th>
                        <th className="border p-2">Estado</th>
                        <th className="border p-2">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cuotasCliente.map((cuota) => (
                        <tr key={cuota.id} className={colorFila(cuota)}>
                          <td className="border p-2">#{cuota.venta_id}</td>
                          <td className="border p-2 min-w-64">{cuota.productos_resumen}</td>
                          <td className="border p-2">Cuota {cuota.numero_cuota} de {cuota.cantidad_cuotas}</td>
                          <td className="border p-2">${Number(cuota.monto).toLocaleString("es-AR")}</td>
                          <td className="border p-2">{new Date(cuota.fecha_vencimiento).toLocaleDateString("es-AR")}</td>
                          <td className="border p-2">{cuota.pagada ? "Pagada" : "Pendiente"}</td>
                          <td className="border p-2">
                            {cuota.pagada ? (
                              <button onClick={() => imprimirComprobante(cuota.id)}
                                className="bg-blue-600 text-white px-3 py-1 rounded">
                                Reimprimir
                              </button>
                            ) : (
                              <button onClick={() => setCuotaCobrar(cuota)}
                                className="bg-green-700 text-white px-3 py-1 rounded">
                                Cobrar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Cheques</h2>
        <div className="space-y-4">
          {Object.entries(chequesPorCliente).map(([cliente, chequesCliente]) => {
            const pendientesCliente = chequesCliente.filter((cheque) => !cheque.cobrado);
            const todosCobrados = pendientesCliente.length === 0;
            const estaAbierto = clienteChequesAbierto === cliente;
            return (
              <div key={cliente} className="border rounded-xl overflow-hidden">
                <div className="flex bg-gray-100">
                  <button
                    type="button"
                    onClick={() => setClienteChequesAbierto(estaAbierto ? null : cliente)}
                    className="flex-1 flex justify-between p-4 text-left"
                  >
                    <span><strong>{cliente}</strong><br />{pendientesCliente.length} cheques pendientes</span>
                    <strong>{chequesCliente.length} cheques</strong>
                  </button>
                  {todosCobrados && (
                    <button
                      type="button"
                      onClick={() => archivarCheques(cliente, chequesCliente)}
                      title="Quitar cheques finalizados"
                      aria-label={`Quitar cheques finalizados de ${cliente}`}
                      className="px-5 text-2xl font-bold text-red-600 hover:bg-red-100"
                    >
                      ×
                    </button>
                  )}
                </div>
                {estaAbierto && (
                  <div className="overflow-x-auto">
                    <table className="w-full border-t">
                      <thead>
                        <tr>
                          <th className="border p-2">Venta</th>
                          <th className="border p-2">Cheque</th>
                          <th className="border p-2">Vencimiento</th>
                          <th className="border p-2">Estado</th>
                          <th className="border p-2">Acción</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chequesCliente.map((cheque) => (
                          <tr key={cheque.id} className={colorFilaCheque(cheque)}>
                            <td className="border p-2">#{cheque.venta_id}</td>
                            <td className="border p-2">Cheque {cheque.numero_cheque} de {cheque.cantidad_cheques}</td>
                            <td className="border p-2">{new Date(cheque.fecha_vencimiento).toLocaleDateString("es-AR")}</td>
                            <td className="border p-2">{cheque.cobrado ? "Cobrado" : "Pendiente"}</td>
                            <td className="border p-2">
                              {cheque.cobrado ? (
                                <button
                                  type="button"
                                  onClick={() => imprimirComprobanteCheque(cheque.id)}
                                  className="bg-blue-600 text-white px-3 py-1 rounded"
                                >
                                  Imprimir
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setChequeCobrar(cheque)}
                                  className="bg-green-700 text-white px-3 py-1 rounded"
                                >
                                  Cobrar
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {cheques.length === 0 && (
            <p className="text-gray-500">No hay ventas con cheques registradas.</p>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Ventas a cuenta</h2>
        <div className="space-y-4">
          {cuentasAgrupadas.map((cuenta) => {
            const saldo = cuenta.saldo_pendiente;
            const entregado = cuenta.total - saldo;
            const estaAbierta = cuentaClienteAbierta === cuenta.cliente_id;
            return (
              <div key={cuenta.cliente_id} className={`border rounded-xl overflow-hidden ${saldo === 0 ? "border-green-500" : ""}`}>
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <button
                    type="button"
                    onClick={() => setCuentaClienteAbierta(estaAbierta ? null : cuenta.cliente_id)}
                    className="flex-1 p-4 text-left"
                  >
                    <strong>{cuenta.nombre} {cuenta.apellido || ""}</strong>
                    <p className="text-sm text-gray-500">{cuenta.ventas.length} venta{cuenta.ventas.length === 1 ? "" : "s"} a cuenta · {estaAbierta ? "Ocultar detalle" : "Ver detalle"}</p>
                  </button>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <span>Total<br /><strong>${cuenta.total.toLocaleString("es-AR")}</strong></span>
                    <span>Entregado<br /><strong className="text-green-700">${entregado.toLocaleString("es-AR")}</strong></span>
                    <span>Falta abonar<br /><strong className="text-red-700">${saldo.toLocaleString("es-AR")}</strong></span>
                  </div>
                  {saldo > 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        setCuentaCobrar(cuenta);
                        setMontoEntrega("");
                      }}
                      className="bg-green-700 text-white px-4 py-2 rounded mx-4 mb-4 md:mb-0"
                    >
                      Registrar entrega
                    </button>
                  ) : (
                    <div className="flex gap-2 mx-4 mb-4 md:mb-0">
                      <button
                        type="button"
                        onClick={() => imprimirEstadoCuenta(cuenta)}
                        className="bg-blue-600 text-white px-4 py-2 rounded"
                      >
                        Imprimir
                      </button>
                      <button
                        type="button"
                        onClick={() => archivarCuentaAbierta(cuenta)}
                        className="border border-red-600 text-red-600 px-4 py-2 rounded"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>

                {estaAbierta && (
                  <div className="overflow-x-auto border-t p-4">
                    <h3 className="font-bold mb-2">Compras a cuenta</h3>
                    <table className="w-full text-sm mb-5">
                      <thead><tr><th className="border p-2">Venta</th><th className="border p-2">Fecha</th><th className="border p-2">Total</th><th className="border p-2">Saldo</th></tr></thead>
                      <tbody>{cuenta.ventas.map((venta) => (
                        <tr key={venta.id}>
                          <td className="border p-2">#{venta.id}</td>
                          <td className="border p-2">{new Date(venta.fecha).toLocaleDateString("es-AR")}</td>
                          <td className="border p-2">${venta.total.toLocaleString("es-AR")}</td>
                          <td className="border p-2">${venta.saldo_pendiente.toLocaleString("es-AR")}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                    <h3 className="font-bold mb-2">Entregas</h3>
                    {cuenta.pagos.length > 0 ? (
                    <table className="w-full text-sm">
                      <thead>
                        <tr>
                          <th className="border p-2">Fecha</th>
                          <th className="border p-2">Entrega</th>
                          <th className="border p-2">Medio de pago</th>
                          <th className="border p-2">Comprobante</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cuenta.pagos.map((pago) => (
                          <tr key={pago.id}>
                            <td className="border p-2">{new Date(pago.fecha).toLocaleString("es-AR")}</td>
                            <td className="border p-2">${Number(pago.monto).toLocaleString("es-AR")}</td>
                            <td className="border p-2">{pago.metodo_pago}{pago.marca_tarjeta ? ` - ${pago.marca_tarjeta.replace("_", " ")}` : ""}</td>
                            <td className="border p-2">
                              <button
                                type="button"
                                onClick={() => imprimirComprobanteACuenta(pago.id)}
                                className="bg-blue-600 text-white px-3 py-1 rounded"
                              >
                                Reimprimir
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    ) : <p className="text-gray-500">Todavía no hay entregas registradas.</p>}
                  </div>
                )}
              </div>
            );
          })}
          {cuentasAgrupadas.length === 0 && (
            <p className="text-gray-500">No hay ventas a cuenta registradas.</p>
          )}
        </div>
      </section>

      {chequeCobrar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-3">Cobrar cheque {chequeCobrar.numero_cheque}</h2>
            <p className="mb-2"><strong>Cliente:</strong> {chequeCobrar.nombre} {chequeCobrar.apellido || ""}</p>
            <p className="mb-2"><strong>Venta:</strong> #{chequeCobrar.venta_id}</p>
            <p className="mb-5"><strong>Vencimiento:</strong> {new Date(chequeCobrar.fecha_vencimiento).toLocaleDateString("es-AR")}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={cobrarCheque}
                className="bg-green-700 text-white px-4 py-2 rounded"
              >
                Cobrar e imprimir
              </button>
              <button
                type="button"
                onClick={() => setChequeCobrar(null)}
                className="border px-4 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {cuotaCobrar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-4">Cobrar cuota {cuotaCobrar.numero_cuota}</h2>
            <p className="mb-4">Monto base: <strong>${montoBaseCobro.toLocaleString("es-AR")}</strong></p>
            <label className="block mb-1">Método de pago</label>
            <select className="border p-2 rounded w-full mb-3" value={metodoPago}
              onChange={(event) => setMetodoPago(event.target.value)}>
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>Credito</option>
              <option>Tarjeta</option>
            </select>
            {metodoPago === "Tarjeta" && (
              <>
                <label className="block mb-1">Tarjeta</label>
                <select className="border p-2 rounded w-full mb-3" value={marcaTarjeta}
                  onChange={(event) => setMarcaTarjeta(event.target.value)}>
                  <option value="VISA">Visa</option>
                  <option value="MASTERCARD">Mastercard</option>
                  <option value="NARANJA_X">Naranja X</option>
                </select>
                <p className="text-sm text-gray-600">
                  Sin recargo por pago con tarjeta en un pago.
                </p>
              </>
            )}
            <p className="text-xl font-bold my-4">
              Total: ${montoBaseCobro.toLocaleString("es-AR")}
            </p>
            <div className="flex gap-3">
              <button onClick={pagarCuota} className="bg-green-700 text-white px-4 py-2 rounded">
                Cobrar e imprimir
              </button>
              <button onClick={() => setCuotaCobrar(null)} className="border px-4 py-2 rounded">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {cuentaCobrar && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold mb-2">Registrar entrega</h2>
            <p className="mb-4">
              Saldo pendiente: <strong>${Number(cuentaCobrar.saldo_pendiente).toLocaleString("es-AR")}</strong>
            </p>
            <label className="block mb-1">Importe entregado</label>
            <input
              type="number"
              min="0.01"
              max={cuentaCobrar.saldo_pendiente}
              step="0.01"
              value={montoEntrega}
              onChange={(event) => setMontoEntrega(event.target.value)}
              className="border p-2 rounded w-full mb-3"
              autoFocus
            />
            <label className="block mb-1">Método de pago</label>
            <select
              className="border p-2 rounded w-full mb-3"
              value={metodoPago}
              onChange={(event) => setMetodoPago(event.target.value)}
            >
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>Credito</option>
              <option>Tarjeta</option>
            </select>
            {metodoPago === "Tarjeta" && (
              <>
                <label className="block mb-1">Tarjeta</label>
                <select
                  className="border p-2 rounded w-full mb-3"
                  value={marcaTarjeta}
                  onChange={(event) => setMarcaTarjeta(event.target.value)}
                >
                  <option value="VISA">Visa</option>
                  <option value="MASTERCARD">Mastercard</option>
                  <option value="NARANJA_X">Naranja X</option>
                </select>
              </>
            )}
            <p className="mb-4">
              Quedará por abonar: <strong>${Math.max(
                Number(cuentaCobrar.saldo_pendiente) - Number(montoEntrega || 0),
                0
              ).toLocaleString("es-AR")}</strong>
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={registrarEntrega}
                disabled={!montoEntrega || Number(montoEntrega) <= 0 || Number(montoEntrega) > Number(cuentaCobrar.saldo_pendiente)}
                className="bg-green-700 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                Registrar e imprimir
              </button>
              <button
                type="button"
                onClick={() => {
                  setCuentaCobrar(null);
                  setMontoEntrega("");
                }}
                className="border px-4 py-2 rounded"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
