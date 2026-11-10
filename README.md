# Control de Stock - Trabajo Final MSII 2026

Aplicación de gestión de inventario, ventas y cobros con **MySQL + FastAPI (Python) + React (JavaScript)**. Esta versión reemplaza Express/PostgreSQL y conserva los módulos de la interfaz original: productos, clientes, ventas, cuotas, cheques, cuentas corrientes, compras, caja, presupuestos y planillas. Agrega un módulo de reportes con descargas Excel reales (`.xlsx`).

## Inicio con Docker

Requisitos: Docker Desktop con Compose y Git.

1. Copiar `.env.example` a `.env` en la raíz.
2. Elegir contraseñas propias para MySQL, root, administrador y empleado. Usar un `JWT_SECRET` aleatorio de al menos 32 caracteres. No publicar `.env`.
3. Ejecutar desde la raíz:

```sh
docker compose up -d --build
```

Abrir [la aplicación](http://localhost:3000) e ingresar con `ADMIN_EMAIL` / `ADMIN_PASSWORD` configurados. La [documentación interactiva de la API](http://localhost:3000/docs) permite explorar los endpoints y autorizarse con el token devuelto por `/api/auth/login`.

MySQL 8.4 se inicia en un volumen propio `mysql_data`. La aplicación prepara el esquema, el procedimiento y las cuentas al arrancar. Las cuentas solo se insertan si no existen; cambiar las variables de entorno no cambia la contraseña de una cuenta existente. Para detener: `docker compose stop`.

## Desarrollo local en Windows

Requisitos: Python 3.11 o superior, Node.js 22.12 o superior y MySQL 8.4 o superior.

Crear una base MySQL vacía con codificación utf8mb4 y un usuario con permisos sobre esa base. En una sesión MySQL de administración, adaptar los valores:

```sql
CREATE DATABASE stock_db CHARACTER SET utf8mb4;
CREATE USER 'stock_user'@'localhost' IDENTIFIED BY 'TU_CLAVE_MYSQL';
GRANT ALL PRIVILEGES ON stock_db.* TO 'stock_user'@'localhost';
```

Copiar `backend/.env.example` a `backend/.env` y configurar host, puerto (3306), base, usuario, contraseña y cuentas iniciales. En una terminal:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m app.setup
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 3000
```

En otra terminal:

```powershell
cd frontend
npm ci
npm run dev
```

Abrir la URL de Vite (normalmente [localhost:5173](http://localhost:5173)). Vite redirige `/api` a FastAPI en el puerto 3000. Si ese puerto está ocupado, cambiar tanto el puerto de Uvicorn como el proxy de `frontend/vite.config.js`.

## Requisitos de la consigna

La matriz detallada se encuentra en [docs/requisitos.md](docs/requisitos.md), y el modelo entidad-relación en [docs/modelo-er.md](docs/modelo-er.md).

| Requisito | Implementación |
|---|---|
| MySQL, mínimo cuatro tablas relacionadas | `database/schema.sql`: 24 tablas InnoDB con PK, FK y restricciones |
| Procedimiento parametrizado con COMMIT/ROLLBACK | `database/procedures.sql`: `registrar_venta`, invocado por la API |
| REST API FastAPI | `backend/app/main.py` y routers; Swagger en `/docs` |
| CRUD de entidades principales | Productos y clientes; también proveedores y planillas |
| Tres consultas con JOIN, subconsultas y GROUP BY | `backend/app/repositories/reports.py`, usadas por pantalla y exportación |
| MySQL asíncrono | `aiomysql`, pool y transacciones con `async/await` |
| JWT y control de acceso | HS256 con vencimiento, Argon2, roles ADMIN/EMPLEADO y estado activo consultado en BD |
| Formularios, tablas y dashboard React | Pantallas existentes y nuevo módulo Reportes |
| Exportación de reportes | Excel `.xlsx` generado con openpyxl; filtros de fechas |
| Validación en cliente y servidor | Formularios React, esquemas Pydantic y constraints MySQL |
| Arquitectura por capas | routers, schemas, services, repositories, database y security |

## Reglas de negocio

- Las ventas leen los precios y costos desde MySQL; el cliente no puede imponer importes. Se bloquean las filas de productos para impedir stock negativo por ventas simultáneas.
- La venta, detalles, stock, cuotas/cheques y movimientos de caja se confirman juntos. Ante cualquier fallo el procedimiento hace ROLLBACK y relanza el error.
- La primera cuota se cobra al registrar la venta. El último importe absorbe los centavos de redondeo, también en los cheques.
- Los cobros bloquean la venta y la cuota/cuenta correspondiente. Un doble cobro se rechaza. Las entregas por cliente se reparten desde las ventas más antiguas y comparten un comprobante agrupado.
- Solo el administrador puede modificar productos/precios, aplicar descuentos, editar/anular ventas, gestionar compras/usuarios y consultar estadísticas/reportes.
- Una venta con cobros posteriores al alta no se puede editar. Una anulación conserva el historial, restaura stock y registra egresos por los importes efectivamente cobrados.
- Las cuentas se archivan solo cuando no tienen pendientes. Los registros utilizados por operaciones no se eliminan por las restricciones referenciales.
- Los reportes de productos/clientes consideran ventas activas. El reporte de ventas muestra también anuladas con su estado. El inventario muestra el stock actual y no aplica el filtro temporal.

## Pruebas

Usar una base exclusiva cuyo nombre termine en `_test`, con el mismo esquema y usuarios iniciales. Configurar las variables para apuntar a esa base antes de inicializar y ejecutar. Las pruebas agregan datos; nunca deben ejecutarse sobre una base de uso real.

```powershell
cd backend
.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.venv\Scripts\python.exe -m app.setup
.venv\Scripts\python.exe -m pytest tests -q
```

Desde `frontend/`, ejecutar `npm run lint` y `npm run build`.

La suite verifica JWT vencido/inválido, usuarios inactivos, roles, CRUD, validación, COMMIT, ROLLBACK, stock concurrente, edición/anulación, financiamiento, cobros duplicados, reparto de entregas, compras, presupuestos, planillas, caja y archivos XLSX. Ver [docs/verificacion.md](docs/verificacion.md) para los resultados de esta adaptación.

## Backup y alcance de la migración

Con Docker iniciado, ejecutar `./scripts/backup.ps1` en PowerShell o `sh scripts/backup.sh` en Linux. El backup incluye procedimientos MySQL y se guarda en `backups/` (ignorado por Git).

El esquema debe iniciarse sobre una base MySQL vacía. No se importa automáticamente información de PostgreSQL: si ya tenés datos reales, hay que planificar su traslado por separado. El volumen PostgreSQL anterior no se reutiliza ni se elimina.

Los comprobantes son internos y no constituyen facturas fiscales.
