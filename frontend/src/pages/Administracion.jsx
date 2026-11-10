import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";

const usuarioVacio = {
  nombre: "",
  email: "",
  password: "",
  rol: "EMPLEADO",
};

const gruposRecargo = [
  { clave: "EFECTIVO", titulo: "Efectivo" },
  { clave: "VISA", titulo: "Visa" },
  { clave: "MASTERCARD", titulo: "Mastercard" },
  { clave: "NARANJA_X", titulo: "Naranja X" },
];

export default function Administracion() {
  const [usuarios, setUsuarios] = useState([]);
  const [recargos, setRecargos] = useState([]);
  const [nuevoUsuario, setNuevoUsuario] = useState(usuarioVacio);

  const cargar = async () => {
    const [usuariosRes, recargosRes] = await Promise.all([
      apiFetch("/api/administracion/usuarios"),
      apiFetch("/api/administracion/recargos"),
    ]);
    setUsuarios(await leerRespuesta(usuariosRes));
    setRecargos(await leerRespuesta(recargosRes));
  };

  useEffect(() => {
    Promise.all([
      apiFetch("/api/administracion/usuarios"),
      apiFetch("/api/administracion/recargos"),
    ])
      .then(async ([usuariosRes, recargosRes]) => {
        setUsuarios(await leerRespuesta(usuariosRes));
        setRecargos(await leerRespuesta(recargosRes));
      })
      .catch((error) => alert(error.message));
  }, []);

  const crearUsuario = async () => {
    try {
      await leerRespuesta(await apiFetch("/api/administracion/usuarios", {
        method: "POST",
        body: JSON.stringify(nuevoUsuario),
      }));
      setNuevoUsuario(usuarioVacio);
      await cargar();
    } catch (error) {
      alert(error.message);
    }
  };

  const guardarUsuario = async (usuario) => {
    try {
      await leerRespuesta(await apiFetch(`/api/administracion/usuarios/${usuario.id}`, {
        method: "PUT",
        body: JSON.stringify(usuario),
      }));
      await cargar();
    } catch (error) {
      alert(error.message);
    }
  };

  const guardarRecargo = async (recargo) => {
    try {
      await leerRespuesta(await apiFetch(`/api/administracion/recargos/${recargo.id}`, {
        method: "PUT",
        body: JSON.stringify({ porcentaje: Number(recargo.porcentaje) }),
      }));
      await cargar();
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-6">Administración</h1>

      <section className="border rounded-xl p-5 mb-8">
        <h2 className="text-2xl font-bold mb-4">Usuarios</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-5">
          <input className="border p-2 rounded" placeholder="Nombre" value={nuevoUsuario.nombre}
            onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, nombre: e.target.value })} />
          <input className="border p-2 rounded" placeholder="Email" type="email" value={nuevoUsuario.email}
            onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, email: e.target.value })} />
          <input className="border p-2 rounded" placeholder="Contraseña (mín. 10)" type="password" value={nuevoUsuario.password}
            onChange={(e) => setNuevoUsuario({ ...nuevoUsuario, password: e.target.value })} />
          <button className="bg-black text-white rounded px-4" onClick={crearUsuario}>
            Crear empleado
          </button>
        </div>

        <div className="space-y-3">
          {usuarios.map((usuario, index) => (
            <div key={usuario.id} className="grid grid-cols-1 md:grid-cols-6 gap-2 items-center border p-3 rounded">
              <input className="border p-2 rounded" value={usuario.nombre}
                onChange={(e) => setUsuarios((actual) => actual.map((item, i) =>
                  i === index ? { ...item, nombre: e.target.value } : item))} />
              <span>{usuario.email}</span>
              <select className="border p-2 rounded" value={usuario.rol}
                onChange={(e) => setUsuarios((actual) => actual.map((item, i) =>
                  i === index ? { ...item, rol: e.target.value } : item))}>
                <option value="EMPLEADO">Empleado</option>
                <option value="ADMIN">Administrador</option>
              </select>
              <input className="border p-2 rounded" type="password" placeholder="Nueva contraseña"
                onChange={(e) => setUsuarios((actual) => actual.map((item, i) =>
                  i === index ? { ...item, password: e.target.value } : item))} />
              <label className="flex gap-2 items-center">
                <input type="checkbox" checked={usuario.activo}
                  onChange={(e) => setUsuarios((actual) => actual.map((item, i) =>
                    i === index ? { ...item, activo: e.target.checked } : item))} />
                Activo
              </label>
              <button className="bg-blue-600 text-white p-2 rounded" onClick={() => guardarUsuario(usuario)}>
                Guardar
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="border rounded-xl p-5">
        <h2 className="text-2xl font-bold mb-2">Recargos de cuotas</h2>
        <p className="text-sm text-gray-600 mb-4">
          Carga aqui el porcentaje para cuotas en efectivo y el costo total que informa tu procesador para cada tarjeta y plan.
        </p>
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 mb-5 text-sm">
          <strong>Referencia publicada por Getnet:</strong> para plazo estándar
          informa hasta 2% + IVA de arancel. Sus coeficientes de financiación
          equivalen, sin IVA ni arancel, a 10,50% en 2 cuotas, 14,35% en 3,
          26,55% en 6 y 58,02% en 12 para emisores bancarios; para emisores no
          bancarios informa 11,61%, 15,93%, 29,83% y 67,24%. Verificá siempre
          la liquidación o contrato del negocio antes de guardar estos valores.{" "}
          <a
            href="https://www.getnet.com.ar/aranceles"
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 underline"
          >
            Ver fuente oficial
          </a>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {gruposRecargo.map((grupo) => (
            <div key={grupo.clave} className="border rounded-lg p-4">
              <h3 className="font-bold mb-3">{grupo.titulo}</h3>
              {recargos.filter((item) =>
                item.marca === grupo.clave &&
                (grupo.clave === "EFECTIVO" || Number(item.cantidad_cuotas) > 1)
              ).map((recargo) => (
                <div key={recargo.id} className="flex items-center gap-2 mb-2">
                  <span className="w-20">{recargo.cantidad_cuotas} cuota{recargo.cantidad_cuotas > 1 ? "s" : ""}</span>
                  <input type="number" min="0" step="0.01" className="border p-2 rounded w-24"
                    value={recargo.porcentaje}
                    onChange={(e) => setRecargos((actual) => actual.map((item) =>
                      item.id === recargo.id ? { ...item, porcentaje: e.target.value } : item))} />
                  <span>%</span>
                  <button className="bg-black text-white px-3 py-2 rounded" onClick={() => guardarRecargo(recargo)}>
                    Guardar
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>
    </MainLayout>
  );
}
