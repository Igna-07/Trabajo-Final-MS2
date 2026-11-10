export const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem("token");
  const headers = new Headers(options.headers || {});

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, { ...options, headers });

  if (response.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("usuario");
    window.location.assign("/");
    throw new Error("Sesión vencida");
  }

  if (response.status === 403) {
    throw new Error("No tenés permisos para realizar esta acción");
  }

  return response;
};

export const leerRespuesta = async (response) => {
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.mensaje || "No se pudo completar la operación");
  }

  return data;
};
