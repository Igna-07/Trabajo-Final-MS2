import {
  CreditCard,
  Home,
  Package,
  ShoppingCart,
  Users,
  Wallet,
  LogOut,
  Truck,
  ListRestart,
  FileText,
  FileSpreadsheet,
  Settings,
  ChartNoAxesCombined,
} from "lucide-react";
import { Link } from "react-router-dom";
import { cerrarSesion, esAdmin, obtenerUsuario } from "../services/session";

export default function MainLayout({ children }) {
  const admin = esAdmin();
  const usuario = obtenerUsuario();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="w-full shrink-0 border-b p-4 md:sticky md:top-0 md:h-screen md:w-64 md:self-start md:overflow-y-auto md:border-r md:border-b-0">
        <div className="flex items-center gap-3 mb-8">
          <img
            src="/favicon.svg"
            alt="Logo de Control de Stock"
            className="h-12 w-12 rounded-full object-cover"
          />
          <h1 className="text-xl font-bold">
            Control de Stock
          </h1>
        </div>

        <nav className="space-y-4">
          {admin && (
            <div className="flex gap-2">
              <Home size={20} />
              <Link to="/dashboard">Dashboard</Link>
            </div>
          )}
          {admin && (
            <div className="flex gap-2">
              <ChartNoAxesCombined size={20} />
              <Link to="/statistics">Estadísticas</Link>
            </div>
          )}

          <div className="flex gap-2">
            <Package size={20} />
            <Link to="/products">Productos</Link>
          </div>

          <div className="flex gap-2">
            <ShoppingCart size={20} />
            <Link to="/sales">Ventas</Link>
          </div>

          <div className="flex gap-2">
            <Users size={20} />
            <Link to="/customers">Clientes</Link>
          </div>
          <div className="flex gap-2">
            <Package size={20} />
            <Link to="/sales-history">Historial de Ventas</Link>
          </div>
          <div className="flex gap-2">
            <CreditCard size={20} />
            <Link to="/receivables">Cuentas por Cobrar</Link>
          </div>

          <div className="flex gap-2">
            <Wallet size={20} />
            <Link to="/caja">Caja</Link>
          </div>
          {admin && (
            <>
              <div className="flex gap-2">
                <Truck size={20} />
                <Link to="/compras">Compras</Link>
              </div>
              <div className="flex gap-2">
                <ListRestart size={20} />
                <Link to="/stock-movements">Movimientos de Stock</Link>
              </div>
              <div className="flex gap-2">
                <Settings size={20} />
                <Link to="/administration">Administración</Link>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <FileText size={20} />
            <Link to="/budgets">Presupuestos</Link>
          </div>
          <div className="flex gap-2">
            <FileSpreadsheet size={20} />
            <Link to="/spreadsheets">Planillas</Link>
          </div>

          <button
            type="button"
            onClick={() => {
              cerrarSesion();
              window.location.assign("/");
            }}
            className="flex gap-2 text-red-600"
          >
            <LogOut size={20} />
            Cerrar sesión
          </button>
          <p className="text-xs text-gray-500">
            {usuario?.nombre} · {admin ? "Administrador" : "Empleado"}
          </p>
        </nav>
      </aside>

      <main className="min-w-0 flex-1 p-8">
        {children}
      </main>
    </div>
  );
}
