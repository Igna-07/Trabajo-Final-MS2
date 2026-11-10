# Correspondencia con la consigna MSII 2026

El dominio elegido es gestión de inventarios y stock. El proyecto contiene MySQL, una REST API FastAPI escrita en Python y un cliente React escrito en JavaScript.

| Apartado | Evidencia y forma de comprobarlo |
|---|---|
| A. Mínimo cuatro tablas normalizadas y relacionadas | `database/schema.sql` separa productos, clientes, usuarios, ventas y detalles, además de compras, proveedores y entidades de financiamiento. Todas tienen PK; las referencias se expresan como FK InnoDB. Ver `modelo-er.md`. |
| A. Stored Procedure parametrizado | `database/procedures.sql`, `registrar_venta`: recibe cliente, usuario, método, líneas JSON, descuento, tarjeta, cuotas y cheques. Devuelve el ID por parámetro OUT. |
| A. COMMIT / ROLLBACK | El procedimiento inicia una transacción. Un EXIT HANDLER FOR SQLEXCEPTION ejecuta ROLLBACK y RESIGNAL. Solo al finalizar la operación completa ejecuta COMMIT. La prueba `test_sale_commit_rollback_edit_cancel` fuerza errores después de modificar stock y comprueba la reversión. |
| A. Integridad referencial y constraints | PK, FK, UNIQUE en emails, planes y cobros; CHECK para cantidades, precios, saldos, roles y estados. Se restringe la eliminación de entidades utilizadas. |
| B. FastAPI | `backend/app/main.py`; rutas agrupadas por módulo en `app/routers/`. `/docs` y `/openapi.json` describen los endpoints y sus esquemas. |
| B. CRUD | `/api/productos` y `/api/clientes`: GET/POST y PUT/DELETE por ID, además de proveedores y planillas. Un registro relacionado no se borra: devuelve 409 para conservar el historial. |
| B. SQL 1: ventas con JOIN y subconsulta | `app/repositories/reports.py`, reporte `ventas`: INNER JOIN de ventas con clientes y subconsulta correlacionada de detalles/productos para el resumen. |
| B. SQL 2: ventas por producto con GROUP BY | Mismo archivo, reporte `productos`: INNER JOIN de productos, detalles y ventas; SUM de unidades, ingresos y costos, agrupados por producto. |
| B. SQL 3: compras por cliente con GROUP BY | Mismo archivo, reporte `clientes`: INNER JOIN clientes/ventas, COUNT de ventas y SUM de totales, agrupados por cliente. |
| B. Conexión asíncrona MySQL | `app/database.py`: `aiomysql.create_pool`, adquisición de conexión y cursor asíncronos; cada execute/fetch/commit/rollback se espera con await. No hay conexión SQL síncrona en la aplicación. |
| B. JWT obligatorio | `app/security.py` y `app/routers/auth.py`: login, emisión HS256, sub/iat/exp, vencimiento a 4 horas, validación de algoritmo y usuario activo. Roles ADMIN/EMPLEADO verificados en servidor. Contraseñas Argon2. |
| C. React consume la API | `frontend/src/services/api.js`, `authService.js` y pantallas. Se mantiene el contrato `/api` del proyecto anterior. |
| C. Alta, modificación y baja con validación | `Productos.jsx` y `Clientes.jsx` validan datos antes de enviarlos. MySQL y Pydantic vuelven a validarlos. La baja pregunta al usuario y el servidor comprueba permisos y referencias. |
| C. Tablas y dashboard | Dashboard, estadísticas, productos, clientes, historial, compras, movimientos y cuentas por cobrar. |
| C. Módulo de reportes exportable | `/reports` permite elegir ventas, productos vendidos, compras por cliente o inventario. Descarga `.xlsx` real desde `/api/reportes/{nombre}/excel`. Pantalla y Excel comparten las mismas consultas. |
| Adicional. Validación cruzada | Cliente: obligatoriedad, números, enteros, decimales, email, fechas. Servidor: modelos en `app/schemas.py`; SQL parametrizado y constraints. Los errores devuelven `mensaje` y, si aplica, detalle de campos. |
| Adicional. Arquitectura por capas | Presentación React → routers HTTP/Pydantic → servicios de negocio → repositorios SQL/unidad de trabajo → MySQL. JWT y configuración están en módulos independientes. |

## Demostración sugerida

1. Ingresar como administrador, crear cliente y producto con stock inicial.
2. Editar ambos y comprobar la validación de un email inválido o stock negativo.
3. Registrar una compra y comprobar que aumenta stock y aparece su movimiento.
4. Registrar una venta en efectivo y comprobar detalle, stock y caja.
5. Intentar una venta sin stock: no debe crear venta, detalles ni movimientos parciales.
6. Registrar una venta en cuotas: la primera queda pagada; cobrar las siguientes y ver sus comprobantes.
7. Mostrar `/reports`, cambiar fechas y exportar productos/clientes/ventas a Excel.
8. Ingresar como empleado: puede vender y cobrar, pero no acceder a reportes, compras o administración.
9. Mostrar Swagger, el procedimiento SQL y el modelo E/R.
10. Ejecutar la suite contra una base exclusiva `_test` y mostrar las pruebas de concurrencia y rollback.

La presentación y explicación del código corresponden al grupo; la documentación sirve como guía de revisión técnica.
