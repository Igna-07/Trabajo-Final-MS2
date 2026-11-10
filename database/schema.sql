-- MySQL 8.4 - esquema inicial.
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  apellido VARCHAR(120),
  telefono VARCHAR(50),
  email VARCHAR(180),
  direccion TEXT,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS productos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  INDEX productos_stock_idx (stock),
  marca VARCHAR(120) NOT NULL DEFAULT 'Sin marca',
  nombre VARCHAR(180) NOT NULL,
  descripcion TEXT,
  costo DECIMAL(14, 2) NOT NULL DEFAULT 0 CHECK (costo >= 0),
  precio DECIMAL(14, 2) NOT NULL CHECK (precio >= 0),
  stock INT NOT NULL DEFAULT 0 CHECK (stock >= 0),
  codigo_barras VARCHAR(100),
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(180) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(20) NOT NULL DEFAULT 'EMPLEADO'
    CHECK (rol IN ('ADMIN', 'EMPLEADO')),
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ventas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  CHECK (estado IN ('ACTIVA','ANULADA')),
  CHECK (metodo_pago IN ('Efectivo','Transferencia','Tarjeta','Cuotas','Cuotas efectivo','A cuenta','Cheques','Credito')),
  CHECK (subtotal >= 0 AND descuento <= subtotal),
  INDEX ventas_fecha_idx (fecha),
  estado VARCHAR(30) NOT NULL DEFAULT 'ACTIVA',
  fecha_anulacion TIMESTAMP NULL,
  subtotal DECIMAL(14,2) NOT NULL,
  marca_tarjeta VARCHAR(30),
  porcentaje_recargo DECIMAL(8,4) NOT NULL DEFAULT 0,
  monto_recargo DECIMAL(14,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(14,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  cantidad_cheques INT,
  cliente_id INT NOT NULL, FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  total DECIMAL(14, 2) NOT NULL CHECK (total >= 0),
  metodo_pago VARCHAR(50) NOT NULL,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS detalle_ventas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venta_id INT NOT NULL, FOREIGN KEY (venta_id) REFERENCES ventas(id),
  producto_id INT NOT NULL, FOREIGN KEY (producto_id) REFERENCES productos(id),
  cantidad INT NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(14, 2) NOT NULL CHECK (precio_unitario >= 0),
  costo_unitario DECIMAL(14, 2) NOT NULL DEFAULT 0 CHECK (costo_unitario >= 0),
  subtotal DECIMAL(14, 2) NOT NULL CHECK (subtotal >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ventas_cuotas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  archivada BOOLEAN NOT NULL DEFAULT FALSE,
  venta_id INT NOT NULL UNIQUE, FOREIGN KEY (venta_id) REFERENCES ventas(id),
  cantidad_cuotas INT NOT NULL CHECK (cantidad_cuotas > 0),
  monto_cuota DECIMAL(14, 2) NOT NULL CHECK (monto_cuota >= 0),
  total_financiado DECIMAL(14, 2) NOT NULL CHECK (total_financiado >= 0),
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cuotas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  INDEX cuotas_vencimiento_idx (pagada,fecha_vencimiento),
  pagada_al_registrar BOOLEAN NOT NULL DEFAULT FALSE,
  venta_cuota_id INT NOT NULL, FOREIGN KEY (venta_cuota_id) REFERENCES ventas_cuotas(id),
  numero_cuota INT NOT NULL CHECK (numero_cuota > 0),
  monto DECIMAL(14, 2) NOT NULL CHECK (monto >= 0),
  fecha_vencimiento DATE NOT NULL,
  pagada BOOLEAN DEFAULT FALSE,
  fecha_pago DATE,
  UNIQUE (venta_cuota_id, numero_cuota)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS recargos_tarjeta_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  marca VARCHAR(30) NOT NULL
    CHECK (marca IN ('VISA', 'MASTERCARD', 'NARANJA_X', 'EFECTIVO')),
  cantidad_cuotas INT NOT NULL CHECK (cantidad_cuotas > 0),
  porcentaje DECIMAL(8, 4) NOT NULL DEFAULT 0
    CHECK (porcentaje >= 0 AND porcentaje <= 500),
  activo BOOLEAN DEFAULT TRUE,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (marca, cantidad_cuotas)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cobros_cuotas_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cuota_id INT NOT NULL UNIQUE, FOREIGN KEY (cuota_id) REFERENCES cuotas(id),
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  metodo_pago VARCHAR(30) NOT NULL,
  marca_tarjeta VARCHAR(30),
  porcentaje_recargo DECIMAL(8, 4) NOT NULL DEFAULT 0,
  monto_base DECIMAL(14, 2) NOT NULL CHECK (monto_base >= 0),
  monto_recargo DECIMAL(14, 2) NOT NULL DEFAULT 0 CHECK (monto_recargo >= 0),
  monto_total DECIMAL(14, 2) NOT NULL CHECK (monto_total >= 0),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ventas_cheques_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venta_id INT NOT NULL UNIQUE, FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  cantidad_cheques INT NOT NULL CHECK (cantidad_cheques BETWEEN 1 AND 10),
  archivada BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cheques_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venta_cheques_id INT NOT NULL, FOREIGN KEY (venta_cheques_id) REFERENCES ventas_cheques_app(id) ON DELETE CASCADE,
  numero_cheque INT NOT NULL CHECK (numero_cheque BETWEEN 1 AND 10),
  fecha_vencimiento DATE NOT NULL,
  cobrado BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_cobro TIMESTAMP,
  UNIQUE (venta_cheques_id, numero_cheque)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS cobros_cheques_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cheque_id INT NOT NULL UNIQUE, FOREIGN KEY (cheque_id) REFERENCES cheques_app(id) ON DELETE CASCADE,
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS ventas_a_cuenta_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  CHECK (saldo_pendiente <= total),
  venta_id INT NOT NULL UNIQUE, FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE,
  total DECIMAL(14, 2) NOT NULL CHECK (total >= 0),
  saldo_pendiente DECIMAL(14, 2) NOT NULL CHECK (saldo_pendiente >= 0),
  archivada BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS pagos_a_cuenta_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  venta_a_cuenta_id INT NOT NULL, FOREIGN KEY (venta_a_cuenta_id) REFERENCES ventas_a_cuenta_app(id) ON DELETE CASCADE,
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  metodo_pago VARCHAR(30) NOT NULL,
  marca_tarjeta VARCHAR(30),
  monto DECIMAL(14, 2) NOT NULL CHECK (monto > 0),
  grupo_pago VARCHAR(36),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos_caja (
  id INT AUTO_INCREMENT PRIMARY KEY,
  CHECK (tipo IN ('INGRESO','EGRESO')),
  tipo VARCHAR(30) NOT NULL,
  descripcion TEXT,
  monto DECIMAL(14, 2) NOT NULL CHECK (monto >= 0),
  metodo_pago VARCHAR(50),
  referencia VARCHAR(100) UNIQUE,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS auditoria_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  accion VARCHAR(80) NOT NULL,
  entidad VARCHAR(80) NOT NULL,
  entidad_id INT,
  detalle JSON,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS proveedores_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(180) NOT NULL,
  telefono VARCHAR(60),
  email VARCHAR(180),
  direccion TEXT,
  activo BOOLEAN DEFAULT TRUE,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS compras_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  proveedor_id INT NOT NULL, FOREIGN KEY (proveedor_id) REFERENCES proveedores_app(id),
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  total DECIMAL(14, 2) NOT NULL CHECK (total >= 0),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS detalle_compras_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  compra_id INT NOT NULL, FOREIGN KEY (compra_id) REFERENCES compras_app(id),
  producto_id INT NOT NULL, FOREIGN KEY (producto_id) REFERENCES productos(id),
  cantidad INT NOT NULL CHECK (cantidad > 0),
  costo_unitario DECIMAL(14, 2) NOT NULL CHECK (costo_unitario >= 0),
  subtotal DECIMAL(14, 2) NOT NULL CHECK (subtotal >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos_stock_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  producto_id INT NOT NULL, FOREIGN KEY (producto_id) REFERENCES productos(id),
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  tipo VARCHAR(40) NOT NULL,
  cantidad INT NOT NULL,
  stock_anterior INT NOT NULL,
  stock_nuevo INT NOT NULL CHECK (stock_nuevo >= 0),
  referencia VARCHAR(100),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS caja_sesiones_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  CHECK (estado IN ('ABIERTA','CERRADA')),
  abierta_unica INT GENERATED ALWAYS AS (CASE WHEN estado = 'ABIERTA' THEN 1 ELSE NULL END) STORED UNIQUE,
  usuario_apertura_id INT NOT NULL, FOREIGN KEY (usuario_apertura_id) REFERENCES usuarios(id),
  usuario_cierre_id INT, FOREIGN KEY (usuario_cierre_id) REFERENCES usuarios(id),
  saldo_inicial DECIMAL(14, 2) NOT NULL CHECK (saldo_inicial >= 0),
  saldo_esperado DECIMAL(14, 2),
  saldo_contado DECIMAL(14, 2),
  diferencia DECIMAL(14, 2),
  fecha_apertura TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_cierre TIMESTAMP,
  estado VARCHAR(20) DEFAULT 'ABIERTA'
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS presupuestos_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  cliente_id INT NOT NULL, FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  total DECIMAL(14, 2) NOT NULL CHECK (total >= 0),
  estado VARCHAR(30) DEFAULT 'PENDIENTE',
  valido_hasta DATE,
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS planillas_clientes_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(180) NOT NULL,
  cliente_id INT, FOREIGN KEY (cliente_id) REFERENCES clientes(id),
  usuario_id INT NOT NULL, FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
  contenido JSON NOT NULL,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  fecha_actualizacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS detalle_presupuestos_app (
  id INT AUTO_INCREMENT PRIMARY KEY,
  presupuesto_id INT NOT NULL, FOREIGN KEY (presupuesto_id) REFERENCES presupuestos_app(id),
  producto_id INT NOT NULL, FOREIGN KEY (producto_id) REFERENCES productos(id),
  cantidad INT NOT NULL CHECK (cantidad > 0),
  precio_unitario DECIMAL(14, 2) NOT NULL CHECK (precio_unitario >= 0),
  subtotal DECIMAL(14, 2) NOT NULL CHECK (subtotal >= 0)
) ENGINE=InnoDB;
