import { useEffect, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";
import { esAdmin } from "../services/session";

export default function Clientes() {
  const admin = esAdmin();
  const [clientes, setClientes] = useState([]);
  const [mostrarModal, setMostrarModal] = useState(false);
  const [clienteEditando, setClienteEditando] = useState(null);

  const [formulario, setFormulario] = useState({
    nombre: "",
    apellido: "",
    telefono: "",
    email: "",
    direccion: "",
  });

  useEffect(() => {
    cargarClientes();
  }, []);

  async function cargarClientes() {
    const respuesta = await apiFetch("/api/clientes");
    const datos = await leerRespuesta(respuesta);

    setClientes(datos);
  }

  const handleChange = (e) => {
    setFormulario({
      ...formulario,
      [e.target.name]: e.target.value,
    });
  };

  const guardarCliente = async () => {
    const url = clienteEditando
      ? `/api/clientes/${clienteEditando.id}`
      : "/api/clientes";

    const metodo = clienteEditando ? "PUT" : "POST";

    try {
      const respuesta = await apiFetch(url, {
        method: metodo,
        body: JSON.stringify(formulario),
      });
      await leerRespuesta(respuesta);
    } catch (error) {
      alert(error.message);
      return;
    }

    setMostrarModal(false);
    setClienteEditando(null);

    setFormulario({
      nombre: "",
      apellido: "",
      telefono: "",
      email: "",
      direccion: "",
    });

    cargarClientes();
  };

  const eliminarCliente = async (id) => {
    if (!window.confirm("¿Eliminar cliente?")) return;

    const respuesta = await apiFetch(
      `/api/clientes/${id}`,
      {
        method: "DELETE",
      }
    );

    try {
      await leerRespuesta(respuesta);
      cargarClientes();
    } catch (error) {
      alert(error.message);
    }
  };

  const editarCliente = (cliente) => {
    setClienteEditando(cliente);

    setFormulario({
      nombre: cliente.nombre,
      apellido: cliente.apellido,
      telefono: cliente.telefono,
      email: cliente.email,
      direccion: cliente.direccion,
    });

    setMostrarModal(true);
  };

  return (
    <MainLayout>
      <div>
        <div className="flex justify-between mb-6">
          <h1 className="text-4xl font-bold">
            Clientes
          </h1>

          <button
            onClick={() => setMostrarModal(true)}
            className="bg-black text-white px-4 py-2 rounded"
          >
            Nuevo Cliente
          </button>
        </div>

        <table className="w-full border">
          <thead>
            <tr>
              <th className="border p-2">Nombre</th>
              <th className="border p-2">Apellido</th>
              <th className="border p-2">Teléfono</th>
              <th className="border p-2">Email</th>
              <th className="border p-2">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {clientes.map((cliente) => (
              <tr key={cliente.id}>
                <td className="border p-2">{cliente.nombre}</td>
                <td className="border p-2">{cliente.apellido}</td>
                <td className="border p-2">{cliente.telefono}</td>
                <td className="border p-2">{cliente.email}</td>

                <td className="border p-2">
                  <button
                    onClick={() => editarCliente(cliente)}
                    className="bg-blue-500 text-white px-2 py-1 rounded mr-2"
                  >
                    Editar
                  </button>

                  {admin && (
                    <button
                      onClick={() => eliminarCliente(cliente.id)}
                      className="bg-red-500 text-white px-2 py-1 rounded"
                    >
                      Eliminar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {mostrarModal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center">
            <div className="bg-white p-6 rounded w-[500px]">

              <h2 className="text-2xl font-bold mb-4">
                {clienteEditando
                  ? "Editar Cliente"
                  : "Nuevo Cliente"}
              </h2>

              <input
                name="nombre"
                placeholder="Nombre"
                value={formulario.nombre}
                onChange={handleChange}
                className="border p-2 w-full mb-3"
              />

              <input
                name="apellido"
                placeholder="Apellido"
                value={formulario.apellido}
                onChange={handleChange}
                className="border p-2 w-full mb-3"
              />

              <input
                name="telefono"
                placeholder="Teléfono"
                value={formulario.telefono}
                onChange={handleChange}
                className="border p-2 w-full mb-3"
              />

              <input
                name="email"
                placeholder="Email"
                value={formulario.email}
                onChange={handleChange}
                className="border p-2 w-full mb-3"
              />

              <input
                name="direccion"
                placeholder="Dirección"
                value={formulario.direccion}
                onChange={handleChange}
                className="border p-2 w-full mb-4"
              />

              <button
                onClick={guardarCliente}
                className="bg-black text-white px-4 py-2 rounded mr-2"
              >
                Guardar
              </button>

              <button
                onClick={() => setMostrarModal(false)}
                className="border px-4 py-2 rounded"
              >
                Cancelar
              </button>

            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
