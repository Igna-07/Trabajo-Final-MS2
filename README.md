# Trabajo Final MS2

Sistema base de control de stock con gestión de productos, ventas, clientes, compras, caja y movimientos de inventario. Incluye una aplicación React, API Node.js/Express y PostgreSQL.

## Requisitos

- Docker Desktop con Docker Compose, o Node.js 22 y PostgreSQL 17 para desarrollo local.
- Git para clonar el repositorio.

## Inicio con Docker

1. Copiá `.env.example` a `.env`.
2. Reemplazá las contraseñas y el secreto JWT por valores propios y seguros. No subas `.env` a GitHub.
3. Ejecutá `docker compose up -d --build` desde la carpeta del proyecto.
4. Abrí http://localhost:3000.

Las cuentas iniciales se crean solo si configurás las variables de administrador y empleado en `.env`. Usá contraseñas de al menos 10 caracteres.

Para detener la aplicación: `docker compose stop`. Los datos quedan en el volumen Docker `stock_data`.

## Desarrollo local

Configurá las variables de `backend/.env.example` en `backend/.env`. Luego ejecutá `npm install`, `npm run setup` y `npm run dev` dentro de `backend/`. En otra terminal, ejecutá `npm install` y `npm run dev` dentro de `frontend/`.

## Estructura

- `backend/`: API, autenticación y lógica de negocio.
- `frontend/`: interfaz web React.
- `database/schema.sql`: esquema de PostgreSQL.
- `docker-compose.yml`: servicios de aplicación y base de datos.

Este proyecto es un punto de partida. Revisá y adaptá nombres, módulos y reglas de negocio al alcance de tu trabajo.
