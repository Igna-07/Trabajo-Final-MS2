import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/authService";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (event) => {
    event.preventDefault();

    try {
      const data = await login(email, password);
      localStorage.setItem("token", data.token);
      localStorage.setItem("usuario", JSON.stringify(data.usuario));
      navigate(data.usuario.rol === "ADMIN" ? "/dashboard" : "/sales");
    } catch (error) {
      const sinConexion =
        error instanceof TypeError ||
        error.message === "Failed to fetch";

      alert(
        sinConexion
          ? "No se pudo conectar con el backend. Verificá que el backend esté iniciado y disponible en el puerto 3000."
          : error.message
      );
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-[400px] p-6 rounded-xl border shadow"
      >
        <div className="flex flex-col items-center mb-6">
          <img
            src="/favicon.svg"
            alt="Logo de Control de Stock"
            className="h-28 w-28 rounded-full object-cover mb-3"
          />
          <h1 className="text-3xl font-bold">Control de Stock</h1>
        </div>

        <input
          type="email"
          required
          autoComplete="username"
          placeholder="Correo"
          className="w-full border p-3 mb-4 rounded"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />

        <input
          type="password"
          required
          autoComplete="current-password"
          placeholder="Contraseña"
          className="w-full border p-3 mb-4 rounded"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />

        <button
          type="submit"
          className="w-full p-3 rounded bg-black text-white"
        >
          Ingresar
        </button>
      </form>
    </div>
  );
}
