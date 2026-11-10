import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";

export default function MovimientosStock() {
  const [movimientos, setMovimientos] = useState([]);

  useEffect(() => {
    apiFetch("/api/operaciones/stock")
      .then(leerRespuesta)
      .then(setMovimientos)
      .catch(console.error);
  }, []);

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-6">Movimientos de Stock</h1>
      <div className="overflow-x-auto">
        <table className="w-full border">
          <thead><tr><th className="border p-2">Fecha</th><th className="border p-2">Marca</th><th className="border p-2">Producto</th><th className="border p-2">Tipo</th><th className="border p-2">Cantidad</th><th className="border p-2">Anterior</th><th className="border p-2">Nuevo</th></tr></thead>
          <tbody>{movimientos.map((item) => (
            <tr key={item.id}><td className="border p-2">{new Date(item.fecha).toLocaleString("es-AR")}</td><td className="border p-2">{item.producto_marca}</td><td className="border p-2">{item.producto}</td><td className="border p-2">{item.tipo}</td><td className="border p-2">{item.cantidad}</td><td className="border p-2">{item.stock_anterior}</td><td className="border p-2">{item.stock_nuevo}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </MainLayout>
  );
}
