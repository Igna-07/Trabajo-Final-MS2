import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";
import { esAdmin } from "../services/session";

const formularioVacio = {
  marca: "",
  nombre: "",
  costo: "",
  stock: "",
  precio: "",
};

export default function Productos() {
  const admin = esAdmin();
  const [productos, setProductos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState("");
  const [mostrarModal, setMostrarModal] = useState(false);
  const [productoEditando, setProductoEditando] = useState(null);
  const [formulario, setFormulario] = useState(formularioVacio);
  const [busqueda, setBusqueda] = useState("");
  const [marcaMasiva, setMarcaMasiva] = useState("");
  const [porcentajeMasivo, setPorcentajeMasivo] = useState("");

  async function cargarProductos() {
    setCargando(true);
    setErrorCarga("");
    try {
      const respuesta = await apiFetch("/api/productos");
      setProductos(await leerRespuesta(respuesta));
    } catch (error) {
      console.error(error);
      setErrorCarga(
        "No se pudo conectar con el backend. Verificá que esté ejecutándose."
      );
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    apiFetch("/api/productos")
      .then(leerRespuesta)
      .then(setProductos)
      .catch((error) => {
        console.error(error);
        setErrorCarga(
          "No se pudo conectar con el backend. Verificá que esté ejecutándose."
        );
      })
  }, []);

  const marcas = useMemo(() => (
    [...new Set(productos.map((producto) => producto.marca).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "es"))
  ), [productos]);

  const productosFiltrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return productos;

    return productos.filter((producto) =>
      [
        producto.marca,
        producto.nombre,
        producto.costo,
        producto.codigo_barras,
      ]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termino))
    );
  }, [busqueda, productos]);

  const abrirNuevo = () => {
    setProductoEditando(null);
    setFormulario(formularioVacio);
    setMostrarModal(true);
  };

  const abrirEditar = (producto) => {
    setProductoEditando(producto);
    setFormulario({
      marca: producto.marca || "",
      nombre: producto.nombre || "",
      costo: producto.costo ?? "",
      stock: producto.stock ?? "",
      precio: producto.precio ?? "",
    });
    setMostrarModal(true);
  };

  const guardarProducto = async () => {
    if (!formulario.marca.trim() || formulario.marca.trim().length > 120 || !formulario.nombre.trim() || formulario.nombre.trim().length > 180) {
      alert('Ingresá una marca (hasta 120 caracteres) y un nombre (hasta 180 caracteres).');
      return;
    }
    if (['costo', 'precio', 'stock'].some((key) => String(formulario[key]).trim() === '' || !Number.isFinite(Number(formulario[key])) || Number(formulario[key]) < 0)
      || !Number.isInteger(Number(formulario.stock)) || Number(formulario.stock) > 1000000000
      || ['costo', 'precio'].some((key) => Number(formulario[key]) > 999999999999 || !/^\d+(\.\d{1,2})?$/.test(String(formulario[key])))) {
      alert('Ingresá costo y precio válidos con hasta dos decimales, y stock entero no negativo.');
      return;
    }
    try {
      const url = productoEditando
        ? `/api/productos/${productoEditando.id}`
        : "/api/productos";

      await leerRespuesta(await apiFetch(url, {
        method: productoEditando ? "PUT" : "POST",
        body: JSON.stringify(formulario),
      }));

      setMostrarModal(false);
      setProductoEditando(null);
      setFormulario(formularioVacio);
      await cargarProductos();
    } catch (error) {
      alert(error.message);
    }
  };

  const eliminarProducto = async (id) => {
    if (!window.confirm("¿Eliminar producto?")) return;

    try {
      await leerRespuesta(await apiFetch(`/api/productos/${id}`, {
        method: "DELETE",
      }));
      await cargarProductos();
    } catch (error) {
      alert(error.message);
    }
  };

  const actualizarMarca = async () => {
    const porcentaje = Number(porcentajeMasivo);
    if (!marcaMasiva || !Number.isFinite(porcentaje)) {
      alert("Seleccioná una marca y escribí un porcentaje válido");
      return;
    }

    const accion = porcentaje >= 0 ? "aumentar" : "descontar";
    const cantidad = productos.filter(
      (producto) => producto.marca?.toLowerCase() === marcaMasiva.toLowerCase()
    ).length;

    if (!window.confirm(
      `¿Querés ${accion} ${Math.abs(porcentaje)}% en ${cantidad} productos de ${marcaMasiva}?`
    )) return;

    try {
      const resultado = await leerRespuesta(await apiFetch(
        "/api/productos/marca/precios",
        {
          method: "PUT",
          body: JSON.stringify({
            marca: marcaMasiva,
            porcentaje,
          }),
        }
      ));
      alert(`${resultado.cantidad} productos actualizados`);
      setPorcentajeMasivo("");
      await cargarProductos();
    } catch (error) {
      alert(error.message);
    }
  };

  const colorStock = (stock) => {
    const cantidad = Number(stock);
    if (cantidad <= 0) return "bg-red-100";
    if (cantidad <= 3) return "bg-yellow-100";
    return "";
  };

  return (
    <MainLayout>
      <div>
        <div className="flex justify-between mb-6">
          <h1 className="text-4xl font-bold">Productos</h1>
          {admin && (
            <button onClick={abrirNuevo} className="px-4 py-2 rounded bg-black text-white">
              Nuevo Producto
            </button>
          )}
        </div>

        {admin && (
          <div className="border rounded-xl p-4 mb-5 bg-gray-50">
            <h2 className="font-bold text-lg mb-3">Actualizar precios por marca</h2>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={marcaMasiva}
                onChange={(event) => setMarcaMasiva(event.target.value)}
                className="border p-2 rounded bg-white"
              >
                <option value="">Seleccionar marca</option>
                {marcas.map((marca) => (
                  <option key={marca} value={marca}>{marca}</option>
                ))}
              </select>
              <input
                type="number"
                step="0.01"
                value={porcentajeMasivo}
                onChange={(event) => setPorcentajeMasivo(event.target.value)}
                placeholder="Porcentaje, ej: 15"
                className="border p-2 rounded"
              />
              <button
                onClick={actualizarMarca}
                className="bg-blue-700 text-white px-4 py-2 rounded"
              >
                Aplicar porcentaje
              </button>
              <p className="text-sm text-gray-600">
                Usá valores negativos para descuento, por ejemplo -10.
              </p>
            </div>
          </div>
        )}

        {errorCarga && (
          <div className="mb-4 rounded border border-red-300 bg-red-50 p-4 text-red-700">
            <p>{errorCarga}</p>
            <button type="button" onClick={cargarProductos} className="mt-2 rounded bg-red-700 px-3 py-1 text-white">
              Reintentar
            </button>
          </div>
        )}

        {cargando && <p className="mb-4 text-gray-500">Cargando productos...</p>}

        <input
          value={busqueda}
          onChange={(event) => setBusqueda(event.target.value)}
          placeholder="Buscar por marca, nombre, costo o codigo"
          className="border p-3 w-full rounded mb-4"
        />

        <div className="overflow-x-auto">
          <table className="w-full border">
            <thead>
              <tr>
                <th className="border p-2">ID</th>
                <th className="border p-2">Marca</th>
                <th className="border p-2">Nombre</th>
                <th className="border p-2">Costo</th>
                <th className="border p-2">Stock</th>
                <th className="border p-2">Precio</th>
                {admin && <th className="border p-2">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.map((producto) => (
                <tr key={producto.id} className={colorStock(producto.stock)}>
                  <td className="border p-2">{producto.id}</td>
                  <td className="border p-2">{producto.marca}</td>
                  <td className="border p-2">{producto.nombre}</td>
                  <td className="border p-2">
                    ${Number(producto.costo || 0).toLocaleString("es-AR")}
                  </td>
                  <td className="border p-2 font-bold">{producto.stock}</td>
                  <td className="border p-2">
                    ${Number(producto.precio).toLocaleString("es-AR")}
                  </td>
                  {admin && (
                    <td className="border p-2 whitespace-nowrap">
                      <button
                        onClick={() => abrirEditar(producto)}
                        className="bg-blue-500 text-white px-2 py-1 rounded mr-2"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => eliminarProducto(producto.id)}
                        className="bg-red-500 text-white px-2 py-1 rounded"
                      >
                        Eliminar
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!cargando && productosFiltrados.length === 0 && (
          <p className="text-center text-gray-500 mt-4">
            No se encontraron productos.
          </p>
        )}

        {mostrarModal && (
          <div className="fixed inset-0 bg-black/50 flex justify-center items-center">
            <div className="bg-white p-6 rounded w-[500px]">
              <h2 className="text-2xl font-bold mb-4">
                {productoEditando ? "Editar Producto" : "Nuevo Producto"}
              </h2>

              {["marca", "nombre", "costo", "stock", "precio"].map((campo) => (
                <input
                  key={campo}
                  type={["costo", "stock", "precio"].includes(campo) ? "number" : "text"}
                  step={campo === "costo" || campo === "precio" ? "0.01" : undefined}
                  name={campo}
                  placeholder={{
                    marca: "Marca",
                    nombre: "Nombre",
                    costo: "Costo",
                    stock: "Stock",
                    precio: "Precio",
                  }[campo]}
                  value={formulario[campo]}
                  onChange={(event) =>
                    setFormulario({
                      ...formulario,
                      [event.target.name]: event.target.value,
                    })
                  }
                  className="border p-2 w-full mb-3"
                />
              ))}

              <div className="flex gap-3">
                <button onClick={guardarProducto} className="bg-black text-white px-4 py-2 rounded">
                  {productoEditando ? "Guardar Cambios" : "Guardar"}
                </button>
                <button onClick={() => setMostrarModal(false)} className="border px-4 py-2 rounded">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </MainLayout>
  );
}
