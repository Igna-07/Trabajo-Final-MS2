import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";

export default function Caja() {
  const [resumen, setResumen] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [sesion, setSesion] = useState(null);

  useEffect(() => {
    const cargarCaja = async () => {
      try {
        const respuesta = await apiFetch("/api/caja/diaria");
        const datos = await leerRespuesta(respuesta);

        setResumen(datos.resumen || []);
        setMovimientos(datos.movimientos || []);
        setSesion(datos.sesion || null);
      } catch (error) {
        console.error(error);
      }
    };

    cargarCaja();
  }, []);

  const actualizarCaja = async () => {
    const datos = await leerRespuesta(await apiFetch("/api/caja/diaria"));
    setResumen(datos.resumen || []);
    setMovimientos(datos.movimientos || []);
    setSesion(datos.sesion || null);
  };

  const abrirCaja = async () => {
    const saldo = window.prompt("Saldo inicial de caja:", "0");
    if (saldo === null) return;
    try {
      await leerRespuesta(await apiFetch("/api/caja/abrir", {
        method: "POST",
        body: JSON.stringify({ saldo_inicial: Number(saldo) }),
      }));
      await actualizarCaja();
    } catch (error) {
      alert(error.message);
    }
  };

  const cerrarCaja = async () => {
    const saldo = window.prompt("Dinero contado al cerrar la caja:");
    if (saldo === null) return;
    try {
      const cierre = await leerRespuesta(await apiFetch("/api/caja/cerrar", {
        method: "POST",
        body: JSON.stringify({ saldo_contado: Number(saldo) }),
      }));
      alert(`Caja cerrada. Diferencia: $${Number(cierre.diferencia).toLocaleString("es-AR")}`);
      await actualizarCaja();
    } catch (error) {
      alert(error.message);
    }
  };

  const totalDia = resumen.reduce(
    (acc, item) => acc + Number(item.total),
    0
  );

  return (
    <MainLayout>
      <div>
        <div className="flex justify-between items-center">
          <h1 className="text-4xl font-bold mb-2">Caja Diaria</h1>
          {sesion ? (
            <button onClick={cerrarCaja} className="bg-red-600 text-white px-4 py-2 rounded">Cerrar caja</button>
          ) : (
            <button onClick={abrirCaja} className="bg-green-700 text-white px-4 py-2 rounded">Abrir caja</button>
          )}
        </div>

        <p className="text-gray-500 mb-6">
          Movimientos e ingresos del día
        </p>

        <div className="grid grid-cols-4 gap-4 mb-8">

          {resumen.map((item) => (
            <div
              key={item.metodo_pago}
              className="border rounded-xl p-4 shadow"
            >
              <p className="text-gray-500">
                {item.metodo_pago}
              </p>

              <h2 className="text-2xl font-bold">
                $
                {Number(item.total).toLocaleString("es-AR")}
              </h2>
            </div>
          ))}

          <div className="border rounded-xl p-4 shadow bg-green-50">
            <p className="text-gray-500">
              Total del Día
            </p>

            <h2 className="text-2xl font-bold text-green-700">
              $
              {totalDia.toLocaleString("es-AR")}
            </h2>
          </div>

        </div>

        <div className="border rounded-xl overflow-hidden">

          <div className="p-4 bg-gray-100">
            <h2 className="font-bold">
              Movimientos
            </h2>
          </div>

          <table className="w-full">

            <thead>
              <tr>
                <th className="border p-2">Fecha</th>
                <th className="border p-2">Tipo</th>
                <th className="border p-2">Descripción</th>
                <th className="border p-2">Método</th>
                <th className="border p-2">Monto</th>
              </tr>
            </thead>

            <tbody>

              {movimientos.map((mov) => (
                <tr key={mov.id}>
                  <td className="border p-2">
                    {new Date(
                      mov.fecha
                    ).toLocaleString("es-AR")}
                  </td>

                  <td className="border p-2">
                    {mov.tipo}
                  </td>

                  <td className="border p-2">
                    {mov.descripcion}
                  </td>

                  <td className="border p-2">
                    {mov.metodo_pago}
                  </td>

                  <td className="border p-2 font-bold">
                    $
                    {Number(
                      mov.monto
                    ).toLocaleString("es-AR")}
                  </td>
                </tr>
              ))}

            </tbody>

          </table>

        </div>
      </div>
    </MainLayout>
  );
}
