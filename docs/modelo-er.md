# Modelo entidad-relación

El esquema completo y ejecutable está en `database/schema.sql`. Las entidades se separan por su responsabilidad; los detalles representan relaciones entre documentos y productos. Los planes de financiamiento y sus cobros no se almacenan dentro de la tabla cliente o producto.

```mermaid
erDiagram
    clientes ||--o{ ventas : compra
    usuarios ||--o{ ventas : registra
    ventas ||--|{ detalle_ventas : contiene
    productos ||--o{ detalle_ventas : integra
    ventas ||--o| ventas_cuotas : financia
    ventas_cuotas ||--|{ cuotas : programa
    cuotas ||--o| cobros_cuotas_app : cobra
    usuarios ||--o{ cobros_cuotas_app : recibe
    ventas ||--o| ventas_cheques_app : documenta
    ventas_cheques_app ||--|{ cheques_app : programa
    cheques_app ||--o| cobros_cheques_app : cobra
    usuarios ||--o{ cobros_cheques_app : recibe
    ventas ||--o| ventas_a_cuenta_app : adeuda
    ventas_a_cuenta_app ||--o{ pagos_a_cuenta_app : recibe
    usuarios ||--o{ pagos_a_cuenta_app : registra
    proveedores_app ||--o{ compras_app : provee
    usuarios ||--o{ compras_app : registra
    compras_app ||--|{ detalle_compras_app : contiene
    productos ||--o{ detalle_compras_app : integra
    productos ||--o{ movimientos_stock_app : registra
    usuarios ||--o{ movimientos_stock_app : realiza
    clientes ||--o{ presupuestos_app : solicita
    usuarios ||--o{ presupuestos_app : crea
    presupuestos_app ||--|{ detalle_presupuestos_app : contiene
    productos ||--o{ detalle_presupuestos_app : integra
    clientes o|--o{ planillas_clientes_app : vincula
    usuarios ||--o{ planillas_clientes_app : crea
    usuarios ||--o{ caja_sesiones_app : abre_cierra
    usuarios o|--o{ auditoria_app : audita
    clientes {
        int id PK
        varchar nombre
        varchar apellido
        varchar email
    }
    productos {
        int id PK
        varchar marca
        varchar nombre
        decimal costo
        decimal precio
        int stock
    }
    usuarios {
        int id PK
        varchar email UK
        varchar password
        varchar rol
        boolean activo
    }
    ventas {
        int id PK
        int cliente_id FK
        int usuario_id FK
        decimal subtotal
        decimal descuento
        decimal total
        varchar metodo_pago
        varchar estado
        timestamp fecha
    }
    detalle_ventas {
        int id PK
        int venta_id FK
        int producto_id FK
        int cantidad
        decimal precio_unitario
        decimal costo_unitario
        decimal subtotal
    }
    recargos_tarjeta_app {
        int id PK
        varchar marca
        int cantidad_cuotas
        decimal porcentaje
    }
    movimientos_caja {
        int id PK
        varchar tipo
        decimal monto
        varchar referencia UK
        timestamp fecha
    }
```

## Integridad y decisiones del modelo

- Cada tabla tiene una clave primaria numérica. Ventas, compras, presupuestos y sus detalles referencian las entidades con claves foráneas; los detalles tienen cantidades positivas y valores monetarios no negativos.
- La relación venta/plan es uno a cero-o-uno: la FK de cada plan es UNIQUE. Los cobros de cuota/cheque también son únicos para impedir duplicados.
- La combinación plan/número de cuota o cheque es única. Una columna calculada única impide abrir dos sesiones de caja simultáneas.
- Los detalles guardan el precio y costo históricos del documento. Cambiar el catálogo no altera la valuación de ventas anteriores. Los totales/subtotales son valores de cierre conservados junto con la operación.
- La marca del producto es un atributo textual simple; no se repiten datos completos del producto en los detalles. Los datos completos de cliente y usuario se consultan por FK.
- Stock y saldo son acumulados mantenidos en transacciones. El procedimiento usa SELECT FOR UPDATE para bloquear los productos y evitar ventas por encima del stock disponible.
- `movimientos_caja.referencia` contiene una referencia única al origen de cada asiento (venta, cuota, cheque, entrega o reversión). Es un registro de caja con distintos tipos de origen; no representa una FK polimórfica validada por MySQL. Los servicios crean los asientos dentro de la misma transacción del documento.
- El JSON de planillas representa una grilla editable de texto, separada de los registros normalizados del negocio. No sustituye las relaciones de ventas, clientes o productos.
- Las anulaciones y archivos son cambios de estado. Se conserva el historial de documentos y comprobantes; las FK restringen las bajas que lo romperían.
