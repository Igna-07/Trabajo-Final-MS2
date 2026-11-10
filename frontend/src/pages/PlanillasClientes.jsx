import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";

const crearGrilla = (filas = 10, columnas = 6) =>
  Array.from({ length: filas }, () => Array.from({ length: columnas }, () => ""));

const normalizarGrilla = (contenido) => {
  if (!Array.isArray(contenido) || contenido.length === 0) return crearGrilla();
  const ancho = Math.max(6, ...contenido.map((fila) => Array.isArray(fila) ? fila.length : 0));
  return contenido.map((fila) =>
    Array.from({ length: ancho }, (_, indice) => String(fila?.[indice] ?? ""))
  );
};

const nombreColumna = (indice) => {
  let numero = indice + 1;
  let nombre = "";
  while (numero > 0) {
    const resto = (numero - 1) % 26;
    nombre = String.fromCharCode(65 + resto) + nombre;
    numero = Math.floor((numero - 1) / 26);
  }
  return nombre;
};

export default function PlanillasClientes() {
  const [planillas, setPlanillas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [planillaId, setPlanillaId] = useState("");
  const [nombre, setNombre] = useState("Nueva planilla");
  const [clienteId, setClienteId] = useState("");
  const [contenido, setContenido] = useState(crearGrilla());
  const [guardando, setGuardando] = useState(false);

  const columnas = useMemo(() => Math.max(1, contenido[0]?.length || 1), [contenido]);

  const cargarListas = async () => {
    const [planillasRes, clientesRes] = await Promise.all([
      apiFetch("/api/planillas"),
      apiFetch("/api/clientes"),
    ]);
    setPlanillas(await leerRespuesta(planillasRes));
    setClientes(await leerRespuesta(clientesRes));
  };

  useEffect(() => {
    cargarListas().catch((error) => alert(error.message));
  }, []);

  const nuevaPlanilla = () => {
    setPlanillaId("");
    setNombre("Nueva planilla");
    setClienteId("");
    setContenido(crearGrilla());
  };

  const abrirPlanilla = async (id) => {
    const respuesta = await apiFetch(`/api/planillas/${id}`);
    const planilla = await leerRespuesta(respuesta);
    setPlanillaId(String(planilla.id));
    setNombre(planilla.nombre);
    setClienteId(planilla.cliente_id ? String(planilla.cliente_id) : "");
    setContenido(normalizarGrilla(planilla.contenido));
  };

  const cambiarCelda = (filaIndice, columnaIndice, valor) => {
    setContenido((actual) =>
      actual.map((fila, indice) =>
        indice === filaIndice
          ? fila.map((celda, col) => col === columnaIndice ? valor : celda)
          : fila
      )
    );
  };

  const agregarFila = () => {
    setContenido((actual) => [...actual, Array.from({ length: columnas }, () => "")]);
  };

  const agregarColumna = () => {
    setContenido((actual) => actual.map((fila) => [...fila, ""]));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const respuesta = await apiFetch(
        planillaId ? `/api/planillas/${planillaId}` : "/api/planillas",
        {
          method: planillaId ? "PUT" : "POST",
          body: JSON.stringify({
            nombre,
            cliente_id: clienteId ? Number(clienteId) : null,
            contenido,
          }),
        }
      );
      const planilla = await leerRespuesta(respuesta);
      setPlanillaId(String(planilla.id));
      await cargarListas();
      alert("Planilla guardada");
    } catch (error) {
      alert(error.message);
    } finally {
      setGuardando(false);
    }
  };

  const eliminar = async () => {
    if (!planillaId || !window.confirm("Eliminar planilla?")) return;
    try {
      await leerRespuesta(await apiFetch(`/api/planillas/${planillaId}`, {
        method: "DELETE",
      }));
      nuevaPlanilla();
      await cargarListas();
    } catch (error) {
      alert(error.message);
    }
  };

  const exportarCsv = () => {
    const csv = contenido
      .map((fila) =>
        fila
          .map((celda) => `"${String(celda).replaceAll('"', '""')}"`)
          .join(",")
      )
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement("a");
    enlace.href = url;
    enlace.download = `${nombre || "planilla"}.csv`;
    enlace.click();
    URL.revokeObjectURL(url);
  };

  return (
    <MainLayout>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-4xl font-bold">Planillas de Clientes</h1>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={nuevaPlanilla} className="border px-4 py-2 rounded">
              Nueva
            </button>
            <button type="button" onClick={exportarCsv} className="border px-4 py-2 rounded">
              Exportar CSV
            </button>
            {planillaId && (
              <button type="button" onClick={eliminar} className="border border-red-300 px-4 py-2 rounded text-red-700">
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={guardar}
              disabled={guardando}
              className="bg-black text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr] gap-5">
          <aside className="border rounded-xl p-4 h-fit">
            <h2 className="font-bold mb-3">Guardadas</h2>
            <div className="space-y-2">
              {planillas.map((planilla) => (
                <button
                  type="button"
                  key={planilla.id}
                  onClick={() => abrirPlanilla(planilla.id)}
                  className={`w-full rounded border p-3 text-left ${String(planilla.id) === planillaId ? "bg-gray-100" : ""}`}
                >
                  <strong className="block">{planilla.nombre}</strong>
                  <span className="text-sm text-gray-500">
                    {[planilla.cliente_nombre, planilla.cliente_apellido].filter(Boolean).join(" ") || "Sin cliente"}
                  </span>
                </button>
              ))}
              {planillas.length === 0 && (
                <p className="text-sm text-gray-500">No hay planillas guardadas.</p>
              )}
            </div>
          </aside>

          <section className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_280px_auto_auto] gap-3">
              <input
                value={nombre}
                onChange={(event) => setNombre(event.target.value)}
                className="border p-2 rounded"
                placeholder="Nombre de la planilla"
              />
              <select
                value={clienteId}
                onChange={(event) => setClienteId(event.target.value)}
                className="border p-2 rounded bg-white"
              >
                <option value="">Sin cliente</option>
                {clientes.map((cliente) => (
                  <option key={cliente.id} value={cliente.id}>
                    {cliente.nombre} {cliente.apellido}
                  </option>
                ))}
              </select>
              <button type="button" onClick={agregarFila} className="border px-3 py-2 rounded">
                + Fila
              </button>
              <button type="button" onClick={agregarColumna} className="border px-3 py-2 rounded">
                + Columna
              </button>
            </div>

            <div className="overflow-auto border rounded-xl max-h-[65vh]">
              <table className="min-w-full border-collapse bg-white">
                <thead>
                  <tr>
                    <th className="sticky top-0 bg-gray-100 border p-2 w-12"></th>
                    {Array.from({ length: columnas }, (_, indice) => (
                      <th key={indice} className="sticky top-0 bg-gray-100 border p-2 min-w-36">
                        {nombreColumna(indice)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {contenido.map((fila, filaIndice) => (
                    <tr key={filaIndice}>
                      <th className="bg-gray-50 border p-2 text-sm font-medium">
                        {filaIndice + 1}
                      </th>
                      {fila.map((celda, columnaIndice) => (
                        <td key={columnaIndice} className="border p-0">
                          <input
                            value={celda}
                            onChange={(event) =>
                              cambiarCelda(filaIndice, columnaIndice, event.target.value)
                            }
                            className="h-10 w-full min-w-36 px-2 outline-none focus:bg-blue-50"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </MainLayout>
  );
}
