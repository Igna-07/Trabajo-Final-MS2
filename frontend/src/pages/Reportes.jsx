import { useEffect, useState } from 'react';
import MainLayout from '../layout/MainLayout';
import { apiFetch, leerRespuesta } from '../services/api';

const hoy = () => new Date().toLocaleDateString('en-CA');
const nombres = { ventas: 'Ventas', productos: 'Productos vendidos', clientes: 'Compras por cliente', inventario: 'Inventario actual' };

export default function Reportes() {
  const [tipo, setTipo] = useState('ventas');
  const [desde, setDesde] = useState(() => `${hoy().slice(0, 7)}-01`);
  const [hasta, setHasta] = useState(hoy);
  const [datos, setDatos] = useState([]);
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [consulta, setConsulta] = useState(() => ({ tipo: 'ventas', desde: `${hoy().slice(0, 7)}-01`, hasta: hoy() }));

  useEffect(() => {
    const abort = new AbortController();
    apiFetch(`/api/reportes/${consulta.tipo}?${new URLSearchParams({ desde: consulta.desde, hasta: consulta.hasta })}`, { signal: abort.signal })
      .then(leerRespuesta)
      .then(setDatos)
      .catch((e) => { if (e.name !== 'AbortError') setError(e.message); })
      .finally(() => { if (!abort.signal.aborted) setCargando(false); });
    return () => abort.abort();
  }, [consulta]);

  const consultar = (event) => {
    event.preventDefault();
    if (!desde || !hasta || desde > hasta) {
      setError('Ingresá un período válido.');
      return;
    }
    setError('');
    setCargando(true);
    setDatos([]);
    setConsulta({ tipo, desde, hasta });
  };

  const exportar = async () => {
    setExportando(true);
    try {
      const response = await apiFetch(`/api/reportes/${consulta.tipo}/excel?${new URLSearchParams({ desde: consulta.desde, hasta: consulta.hasta })}`);
      if (!response.ok) await leerRespuesta(response);
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `${consulta.tipo}-${consulta.desde}-${consulta.hasta}.xlsx`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e.message);
    } finally {
      setExportando(false);
    }
  };

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-2">Reportes</h1>
      <p className="text-gray-500 mb-6">Consultá ventas, clientes e inventario y descargá los resultados en Excel.</p>
      <form onSubmit={consultar} className="flex flex-wrap items-end gap-3 mb-6">
        <label>Reporte<select className="block border rounded p-2" value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {Object.entries(nombres).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Desde<input className="block border rounded p-2" type="date" required value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input className="block border rounded p-2" type="date" required value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)} /></label>
        <button className="bg-black text-white rounded px-4 py-2" disabled={cargando}>Consultar</button>
        <button type="button" onClick={exportar} disabled={cargando || exportando || Boolean(error)} className="bg-green-700 text-white rounded px-4 py-2 disabled:opacity-50">{exportando ? 'Descargando…' : 'Descargar Excel (.xlsx)'}</button>
      </form>
      {error && <p role="alert" className="text-red-600 mb-4">{error}</p>}
      {cargando ? <p>Cargando reporte…</p> : <>
        <h2 className="text-xl font-semibold mb-3">{nombres[consulta.tipo]} · {datos.length} registros</h2>
        {consulta.tipo === 'inventario' && <p className="text-gray-500 mb-3">El inventario muestra el stock actual; no aplica el filtro de fechas.</p>}
        <div className="overflow-x-auto"><table className="w-full border text-sm">
          <thead><tr>{Object.keys(datos[0] || {}).map((key) => <th className="border p-2 text-left" key={key}>{key.replaceAll('_', ' ')}</th>)}</tr></thead>
          <tbody>{datos.map((row, index) => <tr key={row.id ?? index}>{Object.entries(row).map(([key, value]) => <td className="border p-2" key={key}>{value ?? '—'}</td>)}</tr>)}</tbody>
        </table></div>
        {!datos.length && !error && <p className="text-gray-500 mt-4">No hay datos para el período seleccionado.</p>}
      </>}
    </MainLayout>
  );
}
