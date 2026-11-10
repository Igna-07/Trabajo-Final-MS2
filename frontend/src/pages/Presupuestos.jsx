import { fechaLocal } from '../services/fechas';
import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";
import {
  encabezadoImpresion,
  estilosEncabezadoImpresion,
  finalizarImpresion,
} from "../services/impresion";

export default function Presupuestos() {
  const [presupuestos, setPresupuestos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);

  const cargar = async () => {
    const respuestas = await Promise.all([
      apiFetch("/api/presupuestos"),
      apiFetch("/api/clientes"),
      apiFetch("/api/productos"),
    ]);
    setPresupuestos(await leerRespuesta(respuestas[0]));
    setClientes(await leerRespuesta(respuestas[1]));
    setProductos(await leerRespuesta(respuestas[2]));
  };

  useEffect(() => {
    Promise.all([
      apiFetch("/api/presupuestos"),
      apiFetch("/api/clientes"),
      apiFetch("/api/productos"),
    ]).then(async (respuestas) => {
      setPresupuestos(await leerRespuesta(respuestas[0]));
      setClientes(await leerRespuesta(respuestas[1]));
      setProductos(await leerRespuesta(respuestas[2]));
    }).catch(console.error);
  }, []);

  const imprimirPresupuesto = async (id) => {
    const ventana = window.open("", "_blank", "width=760,height=900");
    try {
      const presupuesto = await leerRespuesta(await apiFetch(`/api/presupuestos/${id}`));
      if (!ventana) throw new Error("El navegador bloqueó la ventana de impresión");
      const filas = presupuesto.productos.map((producto) => `
        <tr>
          <td>${producto.marca} · ${producto.nombre}</td>
          <td>${producto.cantidad}</td>
          <td>$${Number(producto.precio_unitario).toLocaleString("es-AR")}</td>
          <td>$${Number(producto.subtotal).toLocaleString("es-AR")}</td>
        </tr>
      `).join("");
      ventana.document.write(`
        <html><head><title>Presupuesto #${presupuesto.id}</title>
        <style>
          body{font-family:Arial,sans-serif;padding:30px;color:#111}
          ${estilosEncabezadoImpresion}
          table{width:100%;border-collapse:collapse;margin-top:20px}
          td,th{border:1px solid #ccc;padding:9px;text-align:left}
          .total{text-align:right;font-size:25px;margin-top:20px}
          .pie{margin-top:30px;border-top:1px solid #ccc;padding-top:12px;font-size:12px;color:#555}
        </style></head><body>
        ${encabezadoImpresion(`Presupuesto N° ${presupuesto.id}`, "Documento comercial no válido como factura")}
        <p><strong>Cliente:</strong> ${presupuesto.nombre} ${presupuesto.apellido || ""}</p>
        <p><strong>Fecha:</strong> ${new Date(presupuesto.fecha).toLocaleDateString("es-AR")}</p>
        <p><strong>Válido hasta:</strong> ${fechaLocal(presupuesto.valido_hasta).toLocaleDateString("es-AR")}</p>
        <table><thead><tr><th>Producto</th><th>Cantidad</th><th>Precio</th><th>Subtotal</th></tr></thead>
        <tbody>${filas}</tbody></table>
        <p class="total"><strong>Total: $${Number(presupuesto.total).toLocaleString("es-AR")}</strong></p>
        <p class="pie">Presupuesto sujeto a disponibilidad y actualización de precios luego de su vencimiento. Preparado por ${presupuesto.creado_por}.</p>
        </body></html>
      `);
      finalizarImpresion(ventana);
    } catch (error) {
      ventana?.close();
      alert(error.message);
    }
  };

  const crear = async () => {
    try {
      const presupuesto = await leerRespuesta(await apiFetch("/api/presupuestos", {
        method: "POST",
        body: JSON.stringify({
          cliente_id: Number(clienteId),
          productos: [{ producto_id: Number(productoId), cantidad: Number(cantidad) }],
        }),
      }));
      await cargar();
      await imprimirPresupuesto(presupuesto.id);
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-6">Presupuestos</h1>
      <div className="border rounded-xl p-4 grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <select value={clienteId} onChange={(event) => setClienteId(event.target.value)} className="border p-2 rounded">
          <option value="">Cliente</option>
          {clientes.map((item) => <option key={item.id} value={item.id}>{item.nombre} {item.apellido}</option>)}
        </select>
        <select value={productoId} onChange={(event) => setProductoId(event.target.value)} className="border p-2 rounded">
          <option value="">Producto</option>
          {productos.map((item) => (
            <option key={item.id} value={item.id}>{item.marca} · {item.nombre}</option>
          ))}
        </select>
        <input type="number" min="1" value={cantidad} onChange={(event) => setCantidad(event.target.value)} className="border p-2 rounded" />
        <button onClick={crear} className="bg-black text-white p-2 rounded md:col-span-3">Crear e imprimir presupuesto</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border">
          <thead><tr><th className="border p-2">Número</th><th className="border p-2">Cliente</th><th className="border p-2">Total</th><th className="border p-2">Válido hasta</th><th className="border p-2">Estado</th><th className="border p-2">Acción</th></tr></thead>
          <tbody>{presupuestos.map((item) => (
            <tr key={item.id}>
              <td className="border p-2">#{item.id}</td>
              <td className="border p-2">{item.nombre} {item.apellido}</td>
              <td className="border p-2">${Number(item.total).toLocaleString("es-AR")}</td>
              <td className="border p-2">{fechaLocal(item.valido_hasta).toLocaleDateString("es-AR")}</td>
              <td className="border p-2">{item.estado}</td>
              <td className="border p-2"><button type="button" onClick={() => imprimirPresupuesto(item.id)} className="bg-blue-600 text-white px-3 py-1 rounded">Imprimir</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </MainLayout>
  );
}
