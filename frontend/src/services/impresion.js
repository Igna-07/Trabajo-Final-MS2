export const encabezadoImpresion = (titulo, subtitulo = "") => `
  <div class="encabezado-local">
    <img class="logo-local" src="${window.location.origin}/favicon.svg" alt="Logo de Control de Stock" />
    <div>
      <h1>Control de Stock</h1>
      <p>${titulo}</p>
      ${subtitulo ? `<small>${subtitulo}</small>` : ""}
    </div>
  </div>
`;

export const estilosEncabezadoImpresion = `
  .encabezado-local{display:flex;align-items:center;justify-content:center;gap:16px;text-align:left;border-bottom:2px solid #111;padding-bottom:14px;margin-bottom:20px}
  .encabezado-local .logo-local{width:76px;height:76px;border-radius:50%;object-fit:cover}
  .encabezado-local h1{margin:0;font-size:28px}
  .encabezado-local p{margin:4px 0 0}
  .encabezado-local small{color:#555}
`;

export const finalizarImpresion = (ventana) => {
  ventana.document.close();
  const logo = ventana.document.querySelector(".logo-local");
  const imprimir = () => {
    ventana.focus();
    ventana.print();
  };
  if (!logo || logo.complete) imprimir();
  else {
    logo.addEventListener("load", imprimir, { once: true });
    logo.addEventListener("error", imprimir, { once: true });
  }
};
