CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  apellido VARCHAR(120),
  telefono VARCHAR(50),
  email VARCHAR(180),
  direccion TEXT,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS productos (
  id SERIAL PRIMARY KEY,
  marca VARCHAR(120) NOT NULL DEFAULT 'Sin marca',
  nombre VARCHAR(180) NOT NULL,
  descripcion TEXT,
  costo NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  precio NUMERIC(14, 2) NOT NULL CHECK (precio >= 0),
  stock INTEGER DEFAULT 0 CHECK (stock >= 0),
  codigo_barras VARCHAR(100),
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS marca VARCHAR(120) NOT NULL DEFAULT 'Sin marca';

ALTER TABLE productos
  ADD COLUMN IF NOT EXISTS costo NUMERIC(14, 2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'productos_costo_check'
  ) THEN
    ALTER TABLE productos
      ADD CONSTRAINT productos_costo_check CHECK (costo >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'EMPLEADO'
    CHECK (rol IN ('ADMIN', 'EMPLEADO')),
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS rol VARCHAR(20) NOT NULL DEFAULT 'EMPLEADO';

CREATE TABLE IF NOT EXISTS ventas (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  metodo_pago VARCHAR(50) NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER REFERENCES ventas(id),
  producto_id INTEGER REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(14, 2) NOT NULL CHECK (precio_unitario >= 0),
  costo_unitario NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0)
);

ALTER TABLE detalle_ventas
  ADD COLUMN IF NOT EXISTS costo_unitario NUMERIC(14, 2) NOT NULL DEFAULT 0;

UPDATE detalle_ventas detalle
SET costo_unitario = producto.costo
FROM productos producto
WHERE producto.id = detalle.producto_id
  AND detalle.costo_unitario = 0;

CREATE TABLE IF NOT EXISTS ventas_cuotas (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER REFERENCES ventas(id),
  cantidad_cuotas INTEGER CHECK (cantidad_cuotas > 0),
  monto_cuota NUMERIC(14, 2) CHECK (monto_cuota >= 0),
  total_financiado NUMERIC(14, 2) CHECK (total_financiado >= 0),
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ventas_cuotas
  ADD COLUMN IF NOT EXISTS archivada BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE ventas_cuotas
  DROP CONSTRAINT IF EXISTS ventas_cuotas_cantidad_cuotas_check;

ALTER TABLE ventas_cuotas
  ADD CONSTRAINT ventas_cuotas_cantidad_cuotas_check
  CHECK (cantidad_cuotas > 0);

CREATE TABLE IF NOT EXISTS cuotas (
  id SERIAL PRIMARY KEY,
  venta_cuota_id INTEGER REFERENCES ventas_cuotas(id),
  numero_cuota INTEGER CHECK (numero_cuota > 0),
  monto NUMERIC(14, 2) CHECK (monto >= 0),
  fecha_vencimiento DATE,
  pagada BOOLEAN DEFAULT FALSE,
  fecha_pago DATE,
  UNIQUE (venta_cuota_id, numero_cuota)
);

ALTER TABLE cuotas
  ADD COLUMN IF NOT EXISTS pagada_al_registrar BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS recargos_tarjeta_app (
  id SERIAL PRIMARY KEY,
  marca VARCHAR(30) NOT NULL
    CHECK (marca IN ('VISA', 'MASTERCARD', 'NARANJA_X', 'EFECTIVO')),
  cantidad_cuotas INTEGER NOT NULL CHECK (cantidad_cuotas > 0),
  porcentaje NUMERIC(8, 4) NOT NULL DEFAULT 0
    CHECK (porcentaje >= 0 AND porcentaje <= 500),
  activo BOOLEAN DEFAULT TRUE,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (marca, cantidad_cuotas)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'recargos_tarjeta_app_marca_check'
  ) THEN
    ALTER TABLE recargos_tarjeta_app
      DROP CONSTRAINT recargos_tarjeta_app_marca_check;
  END IF;

  ALTER TABLE recargos_tarjeta_app
    ADD CONSTRAINT recargos_tarjeta_app_marca_check
    CHECK (marca IN ('VISA', 'MASTERCARD', 'NARANJA_X', 'EFECTIVO'));
END $$;

CREATE TABLE IF NOT EXISTS cobros_cuotas_app (
  id SERIAL PRIMARY KEY,
  cuota_id INTEGER NOT NULL UNIQUE REFERENCES cuotas(id),
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  metodo_pago VARCHAR(30) NOT NULL,
  marca_tarjeta VARCHAR(30),
  porcentaje_recargo NUMERIC(8, 4) NOT NULL DEFAULT 0,
  monto_base NUMERIC(14, 2) NOT NULL CHECK (monto_base >= 0),
  monto_recargo NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (monto_recargo >= 0),
  monto_total NUMERIC(14, 2) NOT NULL CHECK (monto_total >= 0),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ventas_cheques_app (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE CASCADE,
  cantidad_cheques INTEGER NOT NULL CHECK (cantidad_cheques BETWEEN 1 AND 10),
  archivada BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cheques_app (
  id SERIAL PRIMARY KEY,
  venta_cheques_id INTEGER NOT NULL REFERENCES ventas_cheques_app(id) ON DELETE CASCADE,
  numero_cheque INTEGER NOT NULL CHECK (numero_cheque BETWEEN 1 AND 10),
  fecha_vencimiento DATE NOT NULL,
  cobrado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cobro TIMESTAMP,
  UNIQUE (venta_cheques_id, numero_cheque)
);

CREATE TABLE IF NOT EXISTS cobros_cheques_app (
  id SERIAL PRIMARY KEY,
  cheque_id INTEGER NOT NULL UNIQUE REFERENCES cheques_app(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ventas_a_cuenta_app (
  id SERIAL PRIMARY KEY,
  venta_id INTEGER NOT NULL UNIQUE REFERENCES ventas(id) ON DELETE CASCADE,
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  saldo_pendiente NUMERIC(14, 2) NOT NULL CHECK (saldo_pendiente >= 0),
  archivada BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pagos_a_cuenta_app (
  id SERIAL PRIMARY KEY,
  venta_a_cuenta_id INTEGER NOT NULL REFERENCES ventas_a_cuenta_app(id) ON DELETE CASCADE,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id),
  metodo_pago VARCHAR(30) NOT NULL,
  marca_tarjeta VARCHAR(30),
  monto NUMERIC(14, 2) NOT NULL CHECK (monto > 0),
  grupo_pago VARCHAR(36),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE pagos_a_cuenta_app
  ADD COLUMN IF NOT EXISTS grupo_pago VARCHAR(36);

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(30) NOT NULL,
  descripcion TEXT,
  monto NUMERIC(14, 2) NOT NULL CHECK (monto >= 0),
  metodo_pago VARCHAR(50),
  referencia VARCHAR(100),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE ventas ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'ACTIVA';
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS fecha_anulacion TIMESTAMP;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS subtotal NUMERIC(14, 2);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS marca_tarjeta VARCHAR(30);
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS porcentaje_recargo NUMERIC(8, 4) DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS monto_recargo NUMERIC(14, 2) DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS descuento NUMERIC(14, 2) NOT NULL DEFAULT 0;
ALTER TABLE ventas ADD COLUMN IF NOT EXISTS cantidad_cheques INTEGER;

INSERT INTO ventas_cheques_app (venta_id, cantidad_cheques)
SELECT ventas.id, ventas.cantidad_cheques
FROM ventas
WHERE ventas.metodo_pago = 'Cheques'
  AND ventas.cantidad_cheques BETWEEN 1 AND 10
ON CONFLICT (venta_id) DO NOTHING;

INSERT INTO cheques_app (venta_cheques_id, numero_cheque, fecha_vencimiento)
SELECT
  plan.id,
  serie.numero,
  (ventas.fecha::date + (serie.numero * INTERVAL '1 month'))::date
FROM ventas_cheques_app plan
JOIN ventas ON ventas.id = plan.venta_id
CROSS JOIN LATERAL generate_series(1, plan.cantidad_cheques) AS serie(numero)
ON CONFLICT (venta_cheques_id, numero_cheque) DO NOTHING;

UPDATE ventas
SET subtotal = total
WHERE subtotal IS NULL;

ALTER TABLE ventas
  ALTER COLUMN subtotal SET NOT NULL;

INSERT INTO recargos_tarjeta_app (marca, cantidad_cuotas, porcentaje)
VALUES
  ('VISA', 1, 0), ('VISA', 2, 0), ('VISA', 3, 0),
  ('VISA', 6, 0), ('VISA', 12, 0),
  ('MASTERCARD', 1, 0), ('MASTERCARD', 2, 0),
  ('MASTERCARD', 3, 0), ('MASTERCARD', 6, 0),
  ('MASTERCARD', 12, 0),
  ('NARANJA_X', 1, 0), ('NARANJA_X', 2, 0),
  ('NARANJA_X', 3, 0), ('NARANJA_X', 6, 0),
  ('NARANJA_X', 12, 0),
  ('EFECTIVO', 1, 0), ('EFECTIVO', 2, 0),
  ('EFECTIVO', 3, 0), ('EFECTIVO', 4, 0),
  ('EFECTIVO', 5, 0), ('EFECTIVO', 6, 0),
  ('EFECTIVO', 7, 0), ('EFECTIVO', 8, 0),
  ('EFECTIVO', 9, 0), ('EFECTIVO', 10, 0),
  ('EFECTIVO', 11, 0), ('EFECTIVO', 12, 0)
ON CONFLICT (marca, cantidad_cuotas) DO NOTHING;

CREATE TABLE IF NOT EXISTS auditoria_app (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id),
  accion VARCHAR(80) NOT NULL,
  entidad VARCHAR(80) NOT NULL,
  entidad_id INTEGER,
  detalle JSONB,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proveedores_app (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(180) NOT NULL,
  telefono VARCHAR(60),
  email VARCHAR(180),
  direccion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS compras_app (
  id SERIAL PRIMARY KEY,
  proveedor_id INTEGER REFERENCES proveedores_app(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_compras_app (
  id SERIAL PRIMARY KEY,
  compra_id INTEGER REFERENCES compras_app(id),
  producto_id INTEGER REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  costo_unitario NUMERIC(14, 2) NOT NULL CHECK (costo_unitario >= 0),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE TABLE IF NOT EXISTS movimientos_stock_app (
  id SERIAL PRIMARY KEY,
  producto_id INTEGER REFERENCES productos(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  tipo VARCHAR(40) NOT NULL,
  cantidad INTEGER NOT NULL,
  stock_anterior INTEGER NOT NULL,
  stock_nuevo INTEGER NOT NULL CHECK (stock_nuevo >= 0),
  referencia VARCHAR(100),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS caja_sesiones_app (
  id SERIAL PRIMARY KEY,
  usuario_apertura_id INTEGER REFERENCES usuarios(id),
  usuario_cierre_id INTEGER REFERENCES usuarios(id),
  saldo_inicial NUMERIC(14, 2) NOT NULL CHECK (saldo_inicial >= 0),
  saldo_esperado NUMERIC(14, 2),
  saldo_contado NUMERIC(14, 2),
  diferencia NUMERIC(14, 2),
  fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'ABIERTA'
);

CREATE TABLE IF NOT EXISTS presupuestos_app (
  id SERIAL PRIMARY KEY,
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  total NUMERIC(14, 2) NOT NULL CHECK (total >= 0),
  estado VARCHAR(30) DEFAULT 'PENDIENTE',
  valido_hasta DATE,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planillas_clientes_app (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(180) NOT NULL,
  cliente_id INTEGER REFERENCES clientes(id),
  usuario_id INTEGER REFERENCES usuarios(id),
  contenido JSONB NOT NULL DEFAULT '[]'::jsonb,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS detalle_presupuestos_app (
  id SERIAL PRIMARY KEY,
  presupuesto_id INTEGER REFERENCES presupuestos_app(id),
  producto_id INTEGER REFERENCES productos(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(14, 2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal NUMERIC(14, 2) NOT NULL CHECK (subtotal >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS movimientos_caja_referencia_unica
  ON movimientos_caja (referencia)
  WHERE referencia IS NOT NULL AND referencia LIKE '%:%';

CREATE INDEX IF NOT EXISTS ventas_fecha_idx ON ventas (fecha);
CREATE INDEX IF NOT EXISTS cuotas_vencimiento_idx
  ON cuotas (pagada, fecha_vencimiento);
CREATE INDEX IF NOT EXISTS productos_stock_idx ON productos (stock);

DELETE FROM movimientos_caja movimiento
USING ventas venta
WHERE venta.metodo_pago = 'Cuotas'
  AND movimiento.descripcion = 'Venta #' || venta.id
  AND movimiento.referencia IN (venta.id::text, 'venta:' || venta.id);
