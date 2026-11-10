// MySQL DATE no tiene zona horaria. Interpretarlo como fecha local evita
// mostrar el día anterior en Argentina al convertir un string YYYY-MM-DD.
export const fechaLocal = (valor) => new Date(
  typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)
    ? `${valor}T00:00:00`
    : valor
);
