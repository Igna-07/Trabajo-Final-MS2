export const obtenerUsuario = () => {
  try {
    return JSON.parse(localStorage.getItem("usuario") || "null");
  } catch {
    return null;
  }
};

export const esAdmin = () => obtenerUsuario()?.rol === "ADMIN";

export const cerrarSesion = () => {
  localStorage.removeItem("token");
  localStorage.removeItem("usuario");
};
