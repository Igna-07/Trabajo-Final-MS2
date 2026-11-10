import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";

export default function Dashboard() {
  const [metricas, setMetricas] = useState({
    productos: 0,
    clientes: 0,
    ventasHoy: 0,
    cantidadVentas: 0,
    cuotasVencidas: 0,
    stockBajo: 0,
  });

  useEffect(() => {
    apiFetch("/api/dashboard/metricas")
      .then(leerRespuesta)
      .then(setMetricas)
      .catch(console.error);
  }, []);

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-6">Resumen operativo</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Metrica titulo="Ventas de hoy" valor={metricas.ventasHoy} />
        <Metrica titulo="Productos" valor={metricas.productos} />
        <Metrica titulo="Clientes" valor={metricas.clientes} />
        <Metrica titulo="Ventas registradas" valor={metricas.cantidadVentas} />
        <Metrica
          titulo="Stock bajo"
          valor={metricas.stockBajo}
          alerta
        />
        <Metrica
          titulo="Cuotas vencidas"
          valor={metricas.cuotasVencidas}
          alerta
        />
      </div>
    </MainLayout>
  );
}

function Metrica({ titulo, valor, alerta = false }) {
  return (
    <div className="border rounded-xl p-5 shadow">
      <p className="text-gray-500">{titulo}</p>
      <h2 className={`text-3xl font-bold ${alerta ? "text-red-600" : ""}`}>
        {valor}
      </h2>
    </div>
  );
}
