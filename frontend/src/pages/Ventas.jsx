import { useEffect, useMemo, useState } from "react";
import MainLayout from "../layout/MainLayout";
import { apiFetch, leerRespuesta } from "../services/api";
import { esAdmin } from "../services/session";

export default function Ventas() {
  const admin = esAdmin();
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [clienteId, setClienteId] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState([]);
  const [metodoPago, setMetodoPago] = useState("Efectivo");
  const [cantidadCuotas, setCantidadCuotas] = useState(2);
  const [marcaTarjeta, setMarcaTarjeta] = useState("VISA");
  const [recargos, setRecargos] = useState([]);
  const [guardando, setGuardando] = useState(false);
  const [mostrarDescuento, setMostrarDescuento] = useState(false);
  const [descuentoIngresado, setDescuentoIngresado] = useState("");
  const [descuentoAplicado, setDescuentoAplicado] = useState(0);
  const [cantidadCheques, setCantidadCheques] = useState(1);

  const cargarDatos = async () => {
    const [clientesRes, productosRes, recargosRes] = await Promise.all([
      apiFetch("/api/clientes"),
      apiFetch("/api/productos"),
      apiFetch("/api/administracion/recargos"),
    ]);
    setClientes(await leerRespuesta(clientesRes));
    setProductos(await leerRespuesta(productosRes));
    setRecargos(await leerRespuesta(recargosRes));
  };

  useEffect(() => {
    Promise.all([
      apiFetch("/api/clientes"),
      apiFetch("/api/productos"),
      apiFetch("/api/administracion/recargos"),
    ])
      .then(async ([clientesRes, productosRes, recargosRes]) => {
        setClientes(await leerRespuesta(clientesRes));
        setProductos(await leerRespuesta(productosRes));
        setRecargos(await leerRespuesta(recargosRes));
      })
      .catch((error) => alert(error.message));
  }, []);

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

  const subtotal = carrito.reduce(
    (acumulado, item) => acumulado + Number(item.precio) * item.cantidad,
    0
  );
  const esVentaEnCuotas = metodoPago === "Cuotas" || metodoPago === "Cuotas efectivo";
  const usaTarjeta = metodoPago === "Tarjeta" || metodoPago === "Cuotas";
  const cuotasRecargo = esVentaEnCuotas ? cantidadCuotas : 1;
  const marcaRecargo = metodoPago === "Cuotas efectivo" ? "EFECTIVO" : marcaTarjeta;
  const porcentajeRecargo = esVentaEnCuotas
    ? Number(recargos.find((item) =>
      item.marca === marcaRecargo &&
      Number(item.cantidad_cuotas) === cuotasRecargo
    )?.porcentaje || 0)
    : 0;
  const montoRecargo = subtotal * porcentajeRecargo / 100;
  const descuentoValido = descuentoAplicado >= 0 && descuentoAplicado <= subtotal;
  const total = subtotal + montoRecargo - (descuentoValido ? descuentoAplicado : 0);
  const montoCuota = esVentaEnCuotas ? total / cantidadCuotas : 0;

  const agregarProducto = (producto) => {
    if (Number(producto.stock) < 1) {
      alert("Este producto no tiene stock disponible");
      return;
    }

    setCarrito((actual) => {
      const existente = actual.find((item) => item.id === producto.id);
      if (existente) {
        if (existente.cantidad >= Number(producto.stock)) {
          alert(`Stock disponible: ${producto.stock}`);
          return actual;
        }
        return actual.map((item) =>
          item.id === producto.id
            ? { ...item, cantidad: item.cantidad + 1 }
            : item
        );
      }
      return [...actual, { ...producto, cantidad: 1 }];
    });
  };

  const cambiarCantidad = (productoId, cantidad) => {
    const producto = productos.find((item) => item.id === productoId);
    const nuevaCantidad = Number(cantidad);

    if (!Number.isInteger(nuevaCantidad) || nuevaCantidad < 1) return;
    if (nuevaCantidad > Number(producto.stock)) {
      alert(`Stock disponible: ${producto.stock}`);
      return;
    }

    setCarrito((actual) =>
      actual.map((item) =>
        item.id === productoId ? { ...item, cantidad: nuevaCantidad } : item
      )
    );
  };

  const registrarVenta = async () => {
    if (!clienteId || carrito.length === 0) {
      alert("Seleccioná un cliente y agregá al menos un producto");
      return;
    }

    setGuardando(true);
    try {
      const respuesta = await apiFetch("/api/ventas", {
        method: "POST",
        body: JSON.stringify({
          cliente_id: Number(clienteId),
          metodo_pago: metodoPago,
          cantidad_cuotas: esVentaEnCuotas ? cantidadCuotas : null,
          marca_tarjeta: usaTarjeta ? marcaTarjeta : null,
          descuento: descuentoAplicado,
          cantidad_cheques: metodoPago === "Cheques" ? cantidadCheques : null,
          productos: carrito.map((item) => ({
            producto_id: item.id,
            cantidad: item.cantidad,
          })),
        }),
      });
      const datos = await leerRespuesta(respuesta);

      alert(`Venta #${datos.venta.id} registrada correctamente`);
      setClienteId("");
      setCarrito([]);
      setMetodoPago("Efectivo");
      setCantidadCuotas(2);
      setMarcaTarjeta("VISA");
      setMostrarDescuento(false);
      setDescuentoIngresado("");
      setDescuentoAplicado(0);
      setCantidadCheques(1);
      await cargarDatos();
    } catch (error) {
      alert(error.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <MainLayout>
      <h1 className="text-4xl font-bold mb-6">Nueva Venta</h1>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="border rounded-xl p-5">
          <label className="block mb-2 font-medium">Buscar producto</label>
          <input
            value={busqueda}
            onChange={(event) => setBusqueda(event.target.value)}
            placeholder="Marca, nombre, costo o codigo"
            className="border p-3 w-full rounded mb-4"
          />

          <div className="space-y-2 max-h-[520px] overflow-y-auto">
            {productosFiltrados.map((producto) => (
              <button
                key={producto.id}
                type="button"
                onClick={() => agregarProducto(producto)}
                className="w-full border rounded-lg p-3 text-left flex justify-between"
              >
                <span>
                  <strong>{producto.marca} · {producto.nombre}</strong>
                  <span className="block text-sm text-gray-500">
                    Stock: {producto.stock}
                  </span>
                </span>
                <span>${Number(producto.precio).toLocaleString("es-AR")}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="border rounded-xl p-5 space-y-4">
          <div>
            <label className="block mb-1">Cliente</label>
            <select
              value={clienteId}
              onChange={(event) => setClienteId(event.target.value)}
              className="border p-2 w-full rounded"
            >
              <option value="">Seleccionar cliente</option>
              {clientes.map((cliente) => (
                <option key={cliente.id} value={cliente.id}>
                  {cliente.nombre} {cliente.apellido}
                </option>
              ))}
            </select>
          </div>

          {usaTarjeta && (
            <div>
              <label className="block mb-1">Tarjeta</label>
              <select
                value={marcaTarjeta}
                onChange={(event) => setMarcaTarjeta(event.target.value)}
                className="border p-2 w-full rounded"
              >
                <option value="VISA">Visa</option>
                <option value="MASTERCARD">Mastercard</option>
                <option value="NARANJA_X">Naranja X</option>
              </select>
            </div>
          )}

          <div className="space-y-2">
            {carrito.map((item) => (
              <div key={item.id} className="border rounded-lg p-3 flex gap-3">
                <div className="flex-1">
                  <strong>{item.marca} · {item.nombre}</strong>
                  <p className="text-sm text-gray-500">
                    ${Number(item.precio).toLocaleString("es-AR")} c/u
                  </p>
                </div>
                <input
                  type="number"
                  min="1"
                  max={item.stock}
                  value={item.cantidad}
                  onChange={(event) =>
                    cambiarCantidad(item.id, event.target.value)
                  }
                  className="border rounded w-20 px-2"
                />
                <button
                  type="button"
                  onClick={() =>
                    setCarrito((actual) =>
                      actual.filter((producto) => producto.id !== item.id)
                    )
                  }
                  className="text-red-600"
                >
                  Quitar
                </button>
              </div>
            ))}
            {carrito.length === 0 && (
              <p className="text-gray-500">Todavía no agregaste productos.</p>
            )}
          </div>

          <div>
            <label className="block mb-1">Método de pago</label>
            <select
              value={metodoPago}
              onChange={(event) => {
                const nuevoMetodo = event.target.value;
                setMetodoPago(nuevoMetodo);
                if (nuevoMetodo === "Cuotas" && cantidadCuotas < 2) {
                  setCantidadCuotas(2);
                }
              }}
              className="border p-2 w-full rounded"
            >
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>Credito</option>
              <option>Tarjeta</option>
              <option>Cuotas</option>
              <option>Cuotas efectivo</option>
              <option>A cuenta</option>
              <option>Cheques</option>
            </select>
          </div>

          {metodoPago === "Cheques" && (
            <div className="border rounded-lg bg-gray-50 p-3">
              <label className="block mb-1">Número de cheques</label>
              <select
                value={cantidadCheques}
                onChange={(event) => setCantidadCheques(Number(event.target.value))}
                className="border p-2 w-full rounded bg-white"
              >
                {Array.from({ length: 10 }, (_, indice) => indice + 1).map((cantidad) => (
                  <option key={cantidad} value={cantidad}>
                    {cantidad} {cantidad === 1 ? "cheque" : "cheques"}
                  </option>
                ))}
              </select>
            </div>
          )}

          {esVentaEnCuotas && (
            <div className="border rounded-lg bg-gray-50 p-3">
              <label className="block mb-1">Cantidad de cuotas</label>
              <select
                value={cantidadCuotas}
                onChange={(event) => setCantidadCuotas(Number(event.target.value))}
                className="border p-2 w-full rounded bg-white"
              >
                {(metodoPago === "Cuotas efectivo"
                  ? Array.from({ length: 12 }, (_, indice) => indice + 1)
                  : [2, 3, 6, 12]
                ).map((cantidad) => (
                  <option key={cantidad} value={cantidad}>
                    {cantidad} {cantidad === 1 ? "cuota" : "cuotas"}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-sm">
                {cantidadCuotas} cuotas de{" "}
                <strong>${montoCuota.toLocaleString("es-AR")}</strong>
              </p>
            </div>
          )}

          <div className="border-t pt-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-gray-500">
                Subtotal: ${subtotal.toLocaleString("es-AR")}
              </p>
              {carrito.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setDescuentoIngresado(descuentoAplicado ? String(descuentoAplicado) : "");
                    setMostrarDescuento((actual) => !actual);
                  }}
                  className="border border-blue-600 text-blue-700 px-3 py-2 rounded"
                >
                  {descuentoAplicado > 0 ? "Cambiar descuento" : "Aplicar descuento"}
                </button>
              )}
            </div>
            {mostrarDescuento && (
              <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-blue-50 p-3">
                <label className="flex-1 min-w-48">
                  <span className="block text-sm mb-1">Descuento en dinero</span>
                  <input
                    type="number"
                    min="0"
                    max={subtotal}
                    step="0.01"
                    value={descuentoIngresado}
                    onChange={(event) => setDescuentoIngresado(event.target.value)}
                    placeholder="Ejemplo: 5000"
                    className="border p-2 rounded w-full bg-white"
                    autoFocus
                  />
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const importe = Number(descuentoIngresado || 0);
                    if (!Number.isFinite(importe) || importe < 0 || importe > subtotal) {
                      alert("El descuento no puede superar el subtotal");
                      return;
                    }
                    setDescuentoAplicado(importe);
                    setMostrarDescuento(false);
                  }}
                  className="bg-blue-700 text-white px-4 py-2 rounded"
                >
                  Aplicar
                </button>
                {descuentoAplicado > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setDescuentoAplicado(0);
                      setDescuentoIngresado("");
                      setMostrarDescuento(false);
                    }}
                    className="border px-4 py-2 rounded"
                  >
                    Quitar
                  </button>
                )}
              </div>
            )}
            {esVentaEnCuotas && admin && (
              <p className="text-gray-500">
                Recargo {porcentajeRecargo}%: ${montoRecargo.toLocaleString("es-AR")}
              </p>
            )}
            {descuentoAplicado > 0 && (
              <p className="text-green-700">
                Descuento: -${descuentoAplicado.toLocaleString("es-AR")}
              </p>
            )}
            {!descuentoValido && (
              <p className="text-red-600 text-sm">El descuento supera el subtotal. Corregilo antes de registrar.</p>
            )}
            <p className="text-gray-500 mt-2">Total</p>
            <p className="text-3xl font-bold">
              ${total.toLocaleString("es-AR")}
            </p>
          </div>

          <button
            type="button"
            disabled={guardando || carrito.length === 0 || !descuentoValido}
            onClick={registrarVenta}
            className="bg-black text-white p-3 rounded w-full disabled:opacity-50"
          >
            {guardando ? "Registrando..." : "Registrar Venta"}
          </button>
        </section>
      </div>
    </MainLayout>
  );
}
