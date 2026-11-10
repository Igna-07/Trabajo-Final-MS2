import { Navigate } from "react-router-dom";
import { obtenerUsuario } from "../services/session";

export default function ProtectedRoute({ children, roles }) {
  if (!localStorage.getItem("token")) {
    return <Navigate to="/" replace />;
  }

  const usuario = obtenerUsuario();
  if (roles && !roles.includes(usuario?.rol)) {
    return <Navigate to="/sales" replace />;
  }

  return children;
}
