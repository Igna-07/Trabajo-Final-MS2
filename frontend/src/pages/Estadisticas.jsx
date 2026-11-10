import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";

const moneda = (valor) => `$${Number(valor || 0).toLocaleString("es-AR", {
  maximumFractionDigits: 2,
})}`;
const numero = (valor, decimales = 1) => Number(valor || 0).toLocaleString("es-AR", {
  maximumFractionDigits: decimales,
});

export default function Estadisticas() {
  const [dias, setDias] = useState(30);
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/dashboard/estadisticas?dias=${dias}`)
      .then(leerRespuesta)
      .then(setDatos)
      .catch((fallo) => setError(fallo.message))
      .finally(() => setCargando(false));
  }, [dias]);

  const maximoDia = Math.max(...(datos?.ventas_diarias || []).map((item) => Number(item.total)), 1);
  const maximoProducto = Math.max(...(datos?.productos || []).map((item) => Number(item.ingresos)), 1);

  return (
    <MainLayout>
      <div className="flex flex-col gap-4 mb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-4xl font-bold">Estadísticas</h1>
          <p className="text-gray-500 mt-1">Indicadores calculados con las ventas y el inventario registrados.</p>
        </div>
        <label>
          <span className="block text-sm mb-1">Período analizado</span>
          <select
            value={dias}
            onChange={(event) => {
              setCargando(true);
              setError("");
              setDias(Number(event.target.value));
            }}
            className="border rounded p-2 bg-white"
          >
            <option value="7">Últimos 7 días</option>
            <option value="30">Últimos 30 días</option>
            <option value="90">Últimos 90 días</option>
            <option value="365">Últimos 12 meses</option>
          </select>
        </label>
      </div>

      {cargando && <p>Cargando estadísticas...</p>}
      {error && <p className="text-red-600">{error}</p>}

      {datos && !cargando && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {[
              ["Ingresos", moneda(datos.resumen.ingresos), `${datos.resumen.cantidad_ventas} ventas`],
              ["Ganancia bruta", moneda(datos.resumen.ganancia_bruta), `Margen ${numero(datos.resumen.margen_bruto)}%`],
              ["Ticket promedio", moneda(datos.resumen.ticket_promedio), `${datos.resumen.unidades_vendidas} unidades vendidas`],
              ["Cuentas por cobrar", moneda(datos.cuentas.total_pendiente), `${moneda(datos.cuentas.total_vencido)} vencido`],
              ["Inventario al costo", moneda(datos.inventario.valor_costo), `${datos.inventario.unidades} unidades`],
              ["Inventario a precio de venta", moneda(datos.inventario.valor_venta), "Valor potencial"],
              ["Retorno sobre inventario", `${numero(datos.resumen.retorno_inventario, 2)}x`, "Ganancia bruta / stock actual"],
              ["Rotación sobre stock actual", `${numero(datos.inventario.rotacion_sobre_stock_actual, 2)}x`, "Costo vendido / stock actual"],
            ].map(([titulo, valor, detalle]) => (
              <div key={titulo} className="border rounded-xl p-4 shadow-sm">
                <p className="text-sm text-gray-500">{titulo}</p>
                <strong className="block text-2xl mt-1">{valor}</strong>
                <span className="text-xs text-gray-500">{detalle}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
            <section className="border rounded-xl p-5 lg:col-span-2">
              <h2 className="text-xl font-bold mb-4">Ventas por día</h2>
              <div className="flex items-end gap-1 h-56 overflow-x-auto pb-6">
                {datos.ventas_diarias.map((item) => (
                  <div key={item.fecha} className="group flex-1 min-w-3 h-full flex items-end relative">
                    <div
                      className="w-full bg-blue-600 rounded-t min-h-px"
                      style={{ height: `${Number(item.total) * 100 / maximoDia}%` }}
                      title={`${new Date(item.fecha).toLocaleDateString("es-AR")}: ${moneda(item.total)}`}
                    />
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-500">Cada barra representa el total vendido en un día.</p>
            </section>

            <section className="border rounded-xl p-5">
              <h2 className="text-xl font-bold mb-4">Estado del stock</h2>
              <div className="space-y-3">
                <div className="flex justify-between"><span>Saludable</span><strong>{datos.inventario.stock_saludable}</strong></div>
                <div className="flex justify-between text-amber-700"><span>Stock bajo (1 a 3)</span><strong>{datos.inventario.stock_bajo}</strong></div>
                <div className="flex justify-between text-red-700"><span>Sin stock</span><strong>{datos.inventario.sin_stock}</strong></div>
              </div>
              {datos.resumen.crecimiento !== null && (
                <div className="border-t mt-5 pt-4">
                  <p className="text-sm text-gray-500">Variación contra el período anterior</p>
                  <strong className={Number(datos.resumen.crecimiento) >= 0 ? "text-green-700" : "text-red-700"}>
                    {Number(datos.resumen.crecimiento) >= 0 ? "+" : ""}{numero(datos.resumen.crecimiento)}%
                  </strong>
                </div>
              )}
            </section>
          </div>

          <section className="border rounded-xl p-5 mt-6 overflow-x-auto">
            <h2 className="text-xl font-bold mb-1">Rendimiento por producto</h2>
            <p className="text-sm text-gray-500 mb-4">La tasa de salida compara unidades vendidas con las vendidas más el stock actual.</p>
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th className="border p-2 text-left">Producto</th>
                  <th className="border p-2">Ingresos</th>
                  <th className="border p-2">Vendidas</th>
                  <th className="border p-2">Stock</th>
                  <th className="border p-2">Tasa de salida</th>
                  <th className="border p-2">Días de stock</th>
                </tr>
              </thead>
              <tbody>
                {datos.productos.map((producto) => (
                  <tr key={producto.id}>
                    <td className="border p-2">
                      <strong>{producto.marca} · {producto.nombre}</strong>
                      <div className="bg-gray-100 rounded h-1.5 mt-2">
                        <div className="bg-blue-600 h-1.5 rounded" style={{ width: `${Number(producto.ingresos) * 100 / maximoProducto}%` }} />
                      </div>
                    </td>
                    <td className="border p-2 text-right">{moneda(producto.ingresos)}</td>
                    <td className="border p-2 text-center">{producto.unidades_vendidas}</td>
                    <td className="border p-2 text-center">{producto.stock}</td>
                    <td className="border p-2 text-center">{numero(producto.tasa_salida)}%</td>
                    <td className="border p-2 text-center">{producto.dias_stock === null ? "Sin ventas" : numero(producto.dias_stock)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="border rounded-xl p-5 mt-6">
            <h2 className="text-xl font-bold mb-4">Ventas por forma de pago</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {datos.medios_pago.map((item) => (
                <div key={item.metodo_pago} className="bg-gray-50 border rounded-lg p-3 flex justify-between">
                  <span>{item.metodo_pago}<small className="block text-gray-500">{item.cantidad} ventas</small></span>
                  <strong>{moneda(item.total)}</strong>
                </div>
              ))}
            </div>
          </section>

          <p className="text-xs text-gray-500 mt-4">
            Actualizado: {new Date(datos.actualizado_en).toLocaleString("es-AR")}. Los márgenes usan el costo guardado en cada venta; las ventas anteriores toman el costo disponible al aplicar esta actualización.
          </p>
        </>
      )}
    </MainLayout>
  );
}
