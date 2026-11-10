import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Productos from "./pages/Productos";
import Clientes from "./pages/Clientes";
import Ventas from "./pages/Ventas";
import HistorialVentas from "./pages/HistorialVentas";
import CuentasPorCobrar from "./pages/CuentasPorCobrar";
import Caja from "./pages/Caja";
import ProtectedRoute from "./components/ProtectedRoute";
import Compras from "./pages/Compras";
import MovimientosStock from "./pages/MovimientosStock";
import Presupuestos from "./pages/Presupuestos";
import Administracion from "./pages/Administracion";
import PlanillasClientes from "./pages/PlanillasClientes";
import Estadisticas from "./pages/Estadisticas";

const protegida = (element, roles) => (
  <ProtectedRoute roles={roles}>{element}</ProtectedRoute>
);

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={protegida(<Dashboard />, ["ADMIN"])} />
        <Route path="/statistics" element={protegida(<Estadisticas />, ["ADMIN"])} />
        <Route path="/products" element={protegida(<Productos />)} />
        <Route path="/customers" element={protegida(<Clientes />)} />
        <Route path="/sales" element={protegida(<Ventas />)} />
        <Route path="/sales-history" element={protegida(<HistorialVentas />)} />
        <Route path="/receivables" element={protegida(<CuentasPorCobrar />)} />
        <Route path="/caja" element={protegida(<Caja />)} />
        <Route path="/compras" element={protegida(<Compras />, ["ADMIN"])} />
        <Route path="/stock-movements" element={protegida(<MovimientosStock />, ["ADMIN"])} />
        <Route path="/budgets" element={protegida(<Presupuestos />)} />
        <Route path="/spreadsheets" element={protegida(<PlanillasClientes />)} />
        <Route path="/administration" element={protegida(<Administracion />, ["ADMIN"])} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
