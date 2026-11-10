// src/services/authService.js

export const login = async (email, password) => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  const text = await response.text();
  let data = {};

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error(
        "El backend respondió de forma inválida. Revisá la configuración del backend."
      );
    }
  }

  if (!response.ok) {
    if (response.status === 502 || response.status === 503) {
      throw new Error(
        "El backend no está disponible. Iniciá el backend y volvé a intentar."
      );
    }

    throw new Error(data.mensaje || "No se pudo iniciar sesión");
  }

  return data;
};
