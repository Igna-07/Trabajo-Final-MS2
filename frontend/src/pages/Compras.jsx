import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";

export default function Compras() {
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [compras, setCompras] = useState([]);
  const [proveedorId, setProveedorId] = useState("");
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(1);
  const [costo, setCosto] = useState("");

  const cargar = async () => {
    const respuestas = await Promise.all([
      apiFetch("/api/operaciones/proveedores"),
      apiFetch("/api/productos"),
      apiFetch("/api/operaciones/compras"),
    ]);
    setProveedores(await leerRespuesta(respuestas[0]));
    setProductos(await leerRespuesta(respuestas[1]));
    setCompras(await leerRespuesta(respuestas[2]));
  };

  useEffect(() => {
    Promise.all([
      apiFetch("/api/operaciones/proveedores"),
      apiFetch("/api/productos"),
      apiFetch("/api/operaciones/compras"),
    ]).then(async (respuestas) => {
      setProveedores(await leerRespuesta(respuestas[0]));
      setProductos(await leerRespuesta(respuestas[1]));
      setCompras(await leerRespuesta(respuestas[2]));
    }).catch(console.error);
  }, []);

  const nuevoProveedor = async () => {
    const nombre = window.prompt("Nombre del proveedor:");
    if (!nombre) return;
    try {
      await leerRespuesta(await apiFetch("/api/operaciones/proveedores", {
        method: "POST",
        body: JSON.stringify({ nombre }),
      }));
      await cargar();
    } catch (error) {
      alert(error.message);
    }
  };

  const registrarCompra = async () => {
    if (!proveedorId || !productoId || !Number.isInteger(Number(cantidad)) || Number(cantidad) < 1
      || String(costo).trim() === '' || !/^\d+(\.\d{1,2})?$/.test(String(costo)) || Number(costo) > 999999999999) {
      alert('Seleccioná proveedor y producto, una cantidad entera positiva y un costo válido.');
      return;
    }
    try {
      await leerRespuesta(await apiFetch("/api/operaciones/compras", {
        method: "POST",
        body: JSON.stringify({
          proveedor_id: Number(proveedorId),
          productos: [{
            producto_id: Number(productoId),
            cantidad: Number(cantidad),
            costo_unitario: Number(costo),
          }],
        }),
      }));
      setProductoId("");
      setCantidad(1);
      setCosto("");
      await cargar();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <MainLayout>
      <div className="flex justify-between mb-6">
        <h1 className="text-4xl font-bold">Compras y proveedores</h1>
        <button onClick={nuevoProveedor} className="bg-black text-white px-4 py-2 rounded">
          Nuevo proveedor
        </button>
      </div>

      <div className="border rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-3 mb-8">
        <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} className="border p-2 rounded">
          <option value="">Proveedor</option>
          {proveedores.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)} className="border p-2 rounded">
          <option value="">Producto</option>
          {productos.map((item) => (
            <option key={item.id} value={item.id}>
              {item.marca} · {item.nombre}
            </option>
          ))}
        </select>
        <input type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} placeholder="Cantidad" className="border p-2 rounded" />
        <input type="number" min="0" value={costo} onChange={(e) => setCosto(e.target.value)} placeholder="Costo unitario" className="border p-2 rounded" />
        <button onClick={registrarCompra} className="bg-green-700 text-white p-2 rounded md:col-span-4">
          Registrar compra y sumar stock
        </button>
      </div>

      <table className="w-full border">
        <thead><tr><th className="border p-2">Compra</th><th className="border p-2">Fecha</th><th className="border p-2">Proveedor</th><th className="border p-2">Total</th></tr></thead>
        <tbody>{compras.map((compra) => (
          <tr key={compra.id}><td className="border p-2">#{compra.id}</td><td className="border p-2">{new Date(compra.fecha).toLocaleString("es-AR")}</td><td className="border p-2">{compra.proveedor}</td><td className="border p-2">${Number(compra.total).toLocaleString("es-AR")}</td></tr>
        ))}</tbody>
      </table>
    </MainLayout>
  );
}
