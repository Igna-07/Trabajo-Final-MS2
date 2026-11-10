import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";
import { esAdmin } from "../services/session";
import { encabezadoImpresion, estilosEncabezadoImpresion, finalizarImpresion } from "../services/impresion";

export default function HistorialVentas() {
  const admin = esAdmin();
  const [ventas, setVentas] = useState([]);
  const [busqueda, setBusqueda] = useState("");
  const [fecha, setFecha] = useState("");
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [ventaEditar, setVentaEditar] = useState(null);
  const [productoAgregar, setProductoAgregar] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargarVentas = () =>
    apiFetch("/api/ventas")
      .then(leerRespuesta)
      .then(setVentas)
      .catch(console.error);

  useEffect(() => {
    Promise.all([
      apiFetch("/api/ventas"),
      apiFetch("/api/clientes"),
      apiFetch("/api/productos"),
    ]).then(async ([ventasRes, clientesRes, productosRes]) => {
      setVentas(await leerRespuesta(ventasRes));
      setClientes(await leerRespuesta(clientesRes));
      setProductos(await leerRespuesta(productosRes));
    }).catch(console.error);
  }, []);

  const abrirEdicion = async (id) => {
    try {
      const venta = await leerRespuesta(await apiFetch(`/api/ventas/${id}`));
      setVentaEditar({
        ...venta,
        cliente_id: String(venta.cliente_id),
        descuento: Number(venta.descuento || 0),
        productos: venta.productos.map((producto) => ({
          producto_id: Number(producto.producto_id),
          marca: producto.producto_marca,
          nombre: producto.producto_nombre,
          cantidad: Number(producto.cantidad),
          precio_unitario: Number(producto.precio_unitario),
        })),
      });
      setProductoAgregar("");
    } catch (error) {
      alert(error.message);
    }
  };

  const guardarEdicion = async () => {
    if (!ventaEditar) return;
    setGuardando(true);
    try {
      await leerRespuesta(await apiFetch(`/api/ventas/${ventaEditar.id}`, {
        method: "PUT",
        body: JSON.stringify({
          cliente_id: Number(ventaEditar.cliente_id),
          descuento: Number(ventaEditar.descuento || 0),
          productos: ventaEditar.productos.map((producto) => ({
            producto_id: producto.producto_id,
            cantidad: Number(producto.cantidad),
          })),
        }),
      }));
      setVentaEditar(null);
      await cargarVentas();
    } catch (error) {
      alert(error.message);
    } finally {
      setGuardando(false);
    }
  };

  const imprimirVenta = async (id) => {
    try {
      const venta = await leerRespuesta(await apiFetch(`/api/ventas/${id}`));
      const filas = venta.productos.map((producto) => `
        <tr>
          <td>${producto.producto_marca} · ${producto.producto_nombre}</td>
          <td>${producto.cantidad}</td>
          <td>$${Number(producto.precio_unitario).toLocaleString("es-AR")}</td>
          <td>$${Number(producto.subtotal).toLocaleString("es-AR")}</td>
        </tr>
      `).join("");
      const ventana = window.open("", "_blank", "width=700,height=800");
      ventana.document.write(`
        <html><head><title>Venta #${venta.id}</title>
        <style>body{font-family:Arial;padding:30px}${estilosEncabezadoImpresion}table{width:100%;border-collapse:collapse}
        td,th{border:1px solid #ccc;padding:8px}h1{margin-bottom:4px}</style></head>
        <body>${encabezadoImpresion(`Comprobante interno de venta #${venta.id}`)}
        <p>Cliente: ${venta.cliente_nombre || ""} ${venta.cliente_apellido || ""}</p>
        <p>Fecha: ${new Date(venta.fecha).toLocaleString("es-AR")}</p>
        <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody>${filas}</tbody></table>
        <p>Subtotal: $${Number(venta.subtotal).toLocaleString("es-AR")}</p>
        ${Number(venta.monto_recargo) > 0 ? `<p>Recargo: $${Number(venta.monto_recargo).toLocaleString("es-AR")}</p>` : ""}
        ${Number(venta.descuento) > 0 ? `<p>Descuento: -$${Number(venta.descuento).toLocaleString("es-AR")}</p>` : ""}
        <h2>Total: $${Number(venta.total).toLocaleString("es-AR")}</h2>
        <p>Método: ${venta.metodo_pago}${venta.metodo_pago === "Cheques" ? ` (${venta.cantidad_cheques} cheques)` : ""}</p></body></html>
      `);
      finalizarImpresion(ventana);
    } catch (error) {
      alert(error.message);
    }
  };

  const anularVenta = async (id) => {
    const motivo = window.prompt("Motivo de la anulación:");
    if (motivo === null) return;

    try {
      const respuesta = await apiFetch(`/api/ventas/${id}`, {
        method: "DELETE",
        body: JSON.stringify({ motivo }),
      });
      await leerRespuesta(respuesta);
      await cargarVentas();
    } catch (error) {
      alert(error.message);
    }
  };

  const ventasFiltradas = useMemo(() => ventas.filter((venta) => {
    const cliente = `${venta.cliente_nombre || ""} ${venta.cliente_apellido || ""}`.toLowerCase();
    const termino = busqueda.toLowerCase();
    const coincideCliente = cliente.includes(termino) ||
      String(venta.productos_resumen || "").toLowerCase().includes(termino);
    const coincideFecha = !fecha || String(venta.fecha).slice(0, 10) === fecha;
    return coincideCliente && coincideFecha;
  }), [ventas, busqueda, fecha]);

  const exportarCsv = () => {
    const filas = [
      ["ID", "Fecha", "Cliente", "Productos", "Método", "Subtotal", "Descuento", "Total", "Estado"],
      ...ventasFiltradas.map((venta) => [
        venta.id,
        new Date(venta.fecha).toLocaleString("es-AR"),
        `${venta.cliente_nombre || ""} ${venta.cliente_apellido || ""}`,
        venta.productos_resumen,
        venta.metodo_pago,
        venta.subtotal,
        venta.descuento || 0,
        venta.total,
        venta.estado || "ACTIVA",
      ]),
    ];
    const csv = filas.map((fila) =>
      fila.map((valor) => `"${String(valor).replaceAll('"', '""')}"`).join(";")
    ).join("\n");
    const enlace = document.createElement("a");
    enlace.href = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv" }));
    enlace.download = "ventas.csv";
    enlace.click();
    URL.revokeObjectURL(enlace.href);
  };

  const subtotalEdicion = ventaEditar?.productos.reduce(
    (total, producto) => total + Number(producto.precio_unitario) * Number(producto.cantidad),
    0
  ) || 0;
  const recargoEdicion = subtotalEdicion * Number(ventaEditar?.porcentaje_recargo || 0) / 100;
  const totalEdicion = subtotalEdicion + recargoEdicion - Number(ventaEditar?.descuento || 0);

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-6">Historial de Ventas</h1>
      <div className="flex flex-wrap gap-3 mb-4">
        <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar cliente o producto" className="border p-2 rounded" />
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="border p-2 rounded" />
        {admin && <button onClick={exportarCsv} className="bg-green-700 text-white px-4 py-2 rounded">Exportar a Excel</button>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border">
          <thead>
            <tr>
              <th className="border p-2">ID</th>
              <th className="border p-2">Fecha</th>
              <th className="border p-2">Cliente</th>
              <th className="border p-2">Productos</th>
              <th className="border p-2">Método</th>
              <th className="border p-2">Total</th>
              <th className="border p-2">Estado</th>
              <th className="border p-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ventasFiltradas.map((venta) => (
              <tr key={venta.id}>
                <td className="border p-2">{venta.id}</td>
                <td className="border p-2">
                  {new Date(venta.fecha).toLocaleString("es-AR")}
                </td>
                <td className="border p-2">
                  {venta.cliente_nombre} {venta.cliente_apellido}
                </td>
                <td className="border p-2 min-w-64">{venta.productos_resumen}</td>
                <td className="border p-2">
                  {venta.metodo_pago}
                  {venta.metodo_pago === "Cheques" && ` (${venta.cantidad_cheques})`}
                </td>
                <td className="border p-2">
                  ${Number(venta.total).toLocaleString("es-AR")}
                </td>
                <td className="border p-2">{venta.estado || "ACTIVA"}</td>
                <td className="border p-2 whitespace-nowrap">
                  <button
                    onClick={() => imprimirVenta(venta.id)}
                    className="bg-blue-600 text-white px-2 py-1 rounded mr-2"
                  >
                    Imprimir
                  </button>
                  {admin && (venta.estado || "ACTIVA") === "ACTIVA" && (
                    <>
                      <button
                        onClick={() => abrirEdicion(venta.id)}
                        className="bg-amber-600 text-white px-2 py-1 rounded mr-2"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => anularVenta(venta.id)}
                        className="bg-red-600 text-white px-2 py-1 rounded"
                      >
                        Anular
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {ventaEditar && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-1">Editar venta #{ventaEditar.id}</h2>
            <p className="text-sm text-gray-500 mb-4">
              Forma de pago: {ventaEditar.metodo_pago}. El stock y los importes se corregirán automáticamente.
            </p>

            <label className="block mb-1">Cliente</label>
            <select
              value={ventaEditar.cliente_id}
              onChange={(event) => setVentaEditar((actual) => ({ ...actual, cliente_id: event.target.value }))}
              className="border p-2 rounded w-full mb-4"
            >
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>{cliente.nombre} {cliente.apellido}</option>
              ))}
            </select>

            <div className="space-y-2 mb-4">
              {ventaEditar.productos.map((producto) => (
                <div key={producto.producto_id} className="border rounded-lg p-3 flex flex-wrap items-center gap-3">
                  <div className="flex-1 min-w-48">
                    <strong>{producto.marca} · {producto.nombre}</strong>
                    <p className="text-sm text-gray-500">${Number(producto.precio_unitario).toLocaleString("es-AR")} c/u</p>
                  </div>
                  <input
                    type="number"
                    min="1"
                    value={producto.cantidad}
                    onChange={(event) => setVentaEditar((actual) => ({
                      ...actual,
                      productos: actual.productos.map((item) => item.producto_id === producto.producto_id
                        ? { ...item, cantidad: Number(event.target.value) }
                        : item),
                    }))}
                    className="border p-2 rounded w-24"
                  />
                  <button
                    type="button"
                    onClick={() => setVentaEditar((actual) => ({
                      ...actual,
                      productos: actual.productos.filter((item) => item.producto_id !== producto.producto_id),
                    }))}
                    className="text-red-600"
                  >
                    Quitar
                  </button>
                </div>
              ))}
            </div>

            <div className="flex gap-2 mb-4">
              <select value={productoAgregar} onChange={(event) => setProductoAgregar(event.target.value)} className="border p-2 rounded flex-1">
                <option value="">Agregar producto...</option>
                {productos.map((producto) => (
                  <option key={producto.id} value={producto.id}>{producto.marca} · {producto.nombre} · stock {producto.stock}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  const producto = productos.find((item) => item.id === Number(productoAgregar));
                  if (!producto) return;
                  setVentaEditar((actual) => {
                    const existente = actual.productos.find((item) => item.producto_id === producto.id);
                    return {
                      ...actual,
                      productos: existente
                        ? actual.productos.map((item) => item.producto_id === producto.id
                          ? { ...item, cantidad: Number(item.cantidad) + 1 }
                          : item)
                        : [...actual.productos, {
                          producto_id: producto.id,
                          marca: producto.marca,
                          nombre: producto.nombre,
                          cantidad: 1,
                          precio_unitario: Number(producto.precio),
                        }],
                    };
                  });
                  setProductoAgregar("");
                }}
                className="bg-gray-900 text-white px-4 py-2 rounded"
              >
                Agregar
              </button>
            </div>

            <label className="block mb-1">Descuento en dinero</label>
            <input
              type="number"
              min="0"
              max={subtotalEdicion}
              step="0.01"
              value={ventaEditar.descuento}
              onChange={(event) => setVentaEditar((actual) => ({ ...actual, descuento: event.target.value }))}
              className="border p-2 rounded w-full mb-4"
            />

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <p>Subtotal: ${subtotalEdicion.toLocaleString("es-AR")}</p>
              {recargoEdicion > 0 && <p>Recargo: ${recargoEdicion.toLocaleString("es-AR")}</p>}
              {Number(ventaEditar.descuento) > 0 && <p className="text-green-700">Descuento: -${Number(ventaEditar.descuento).toLocaleString("es-AR")}</p>}
              <p className="text-xl font-bold">Total: ${Math.max(totalEdicion, 0).toLocaleString("es-AR")}</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={guardarEdicion}
                disabled={guardando || ventaEditar.productos.length === 0 || Number(ventaEditar.descuento) > subtotalEdicion}
                className="bg-amber-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar cambios"}
              </button>
              <button type="button" onClick={() => setVentaEditar(null)} className="border px-4 py-2 rounded">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  );
}
