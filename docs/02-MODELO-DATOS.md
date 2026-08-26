# 02 · Modelo de datos

> Esquema ejecutable completo en [`supabase/schema.sql`](../supabase/schema.sql).
> Este documento explica **las decisiones**, no repite el SQL.

## 1. Las cuatro decisiones que sostienen todo

### 1.1 Plata en centavos, peso en gramos, siempre enteros

Todos los importes son `bigint` en centavos (`precio_venta_centavos`).
Todo peso es `bigint` en gramos (`stock_g`, `cantidad`).

Motivo: los `float` acumulan error y con inflación argentina los importes tienen
muchos dígitos. Un ticket de $147.850,33 calculado con floats termina cerrando
mal el arqueo, y nadie va a saber por qué.

El formateo a `$ 147.850` vive únicamente en `lib/money.ts`.

### 1.2 Fraccionamiento: dos atributos ortogonales, no padre/hijo

El planteo original mezclaba dos problemas distintos. Separados, la lógica de
stock desaparece casi por completo.

**`tipo_venta`** — cómo se le cobra al cliente:

| Valor | Stock en | Precio en | Ejemplo |
|---|---|---|---|
| `UNIDAD` | unidades | `precio_venta_centavos` | Coca 500 ml, Marlboro Box |
| `PESO` | **gramos** | `precio_por_kg_centavos` | Jamón cocido, queso cremoso, pan |

**`factor_compra`** — cuántas unidades de venta entran en una unidad de compra:

| Producto | `unidad_compra` | `factor_compra` | Comprar 2 suma al stock |
|---|---|---|---|
| Alfajor Jorgito | Caja x24 | 24 | 48 unidades |
| Coca 500 ml | Pack x6 | 6 | 12 unidades |
| Queso cremoso | Horma 4 kg | 4000 | 8000 gramos |

Con esto, **la "horma padre" nunca necesita existir como producto separado**.
Comprás una horma de 4 kg → el stock sube 4000 g. Vendés 250 g → baja 250.
Vendés media horma (2000 g) → baja 2000. No hay relación padre/hijo, no hay
descuento proporcional, no hay tabla intermedia y no hay una clase entera de bugs.

> Regla de interpretación única en todo el sistema: **`cantidad` y `stock_actual`
> se leen en unidades si `tipo_venta = UNIDAD`, y en gramos si `tipo_venta = PESO`.**

### 1.3 El stock es un libro mayor

`movimientos_stock` es append-only. `productos.stock_actual` es un agregado que
mantiene un trigger, no una fuente de verdad.

```
movimientos_stock: producto_id, delta (+/-), motivo, referencia_id, usuario_id
```

Motivos: `VENTA`, `COMPRA`, `AJUSTE`, `MERMA`, `ROTURA`, `VENCIMIENTO`,
`CONSUMO_INTERNO`, `DEVOLUCION`, `CARGA_INICIAL`.

**Por qué importa (dos razones, ambas críticas):**

1. **Sincronización offline.** El cliente envía deltas, no absolutos. Dos
   dispositivos sin conexión nunca se pisan.
2. **La merma existe.** La fiambrería pierde peso todos los días: el recorte, la
   punta que se seca, lo que se vence. Si no hay forma de registrar esa pérdida,
   el stock teórico se despega del real en dos semanas y el dueño deja de creerle
   al sistema — que es exactamente el momento en que lo abandona. Cada ajuste es
   nominativo, con motivo y auditable.

### 1.4 Un pago no es un campo, es una tabla

`ventas_pagos` es 1:N contra `ventas`. En un kiosco, "te doy $5.000 en efectivo y
el resto te lo transfiero" pasa todos los días. Con un campo `medio_pago` en
`ventas`, ese caso no se puede representar y el arqueo cierra mal.

## 2. Tablas

### Núcleo del tenant
| Tabla | Rol |
|---|---|
| `comercios` | El tenant. Nombre, slug para la Vidriera, teléfono de WhatsApp, flags. |
| `config_comercio` | 1:1. Redondeo, moneda, horarios, costo de envío, textos de la Vidriera. |
| `usuarios_comercio` | Espeja `auth.users`. Rol, nombre para mostrar, `pin_hash`. |
| `dispositivos` | Cada instalación de la PWA. Necesario para las sesiones de caja. |

### Catálogo
| Tabla | Rol |
|---|---|
| `categorias` | Nombre, color, ícono, orden. |
| `proveedores` | Nombre, teléfono (para el pedido por WhatsApp), días de visita. |
| `productos` | El corazón. Ver campos abajo. |
| `precios_historial` | Snapshot en cada cambio de precio o costo. Alimenta "cuánto me aumentó el proveedor". |
| `teclas_rapidas` | Los 8-12 productos fijos del POS, ordenados. |
| `catalogo_base` | **Global, sin `comercio_id`.** Los ~400 productos semilla argentinos. |

### Operación
| Tabla | Rol |
|---|---|
| `ventas` / `ventas_items` / `ventas_pagos` | El ticket. Append-only. |
| `movimientos_stock` | Libro mayor de stock. |
| `compras` / `compras_items` | Reposición y alta de mercadería. |
| `clientes` / `cuenta_corriente_movimientos` | Fiados. |
| `caja_sesiones` / `caja_movimientos` / `arqueos` | Control de caja. |
| `gastos` | Alquiler, luz, sueldos. Sin esto los reportes muestran facturación, no ganancia. |
| `auditoria` | Quién hizo qué. |

### Vidriera
| Tabla | Rol |
|---|---|
| `pedidos_vidriera` / `pedidos_items` | Pedidos entrantes con estado. |
| `zonas_envio` | Zona, costo, monto mínimo. |

## 3. `productos` — campos que importan

| Campo | Tipo | Nota |
|---|---|---|
| `nombre` | text | |
| `nombre_norm` | text generated | `lower(unaccent(nombre))`. Índice trigram para búsqueda instantánea. |
| `alias` | text[] | "coca", "gaseosa chica". El empleado no escribe el nombre completo. |
| `tipo_producto` | enum | `FISICO` / `SERVICIO` / `COMBO` |
| `tipo_venta` | enum | `UNIDAD` / `PESO` |
| `precio_venta_centavos` | bigint | Obligatorio si `UNIDAD` |
| `precio_por_kg_centavos` | bigint | Obligatorio si `PESO` |
| `precio_costo_centavos` | bigint | **Solo visible para el dueño (RLS por columna vía vista).** |
| `stock_actual` | bigint | Unidades o gramos. Mantenido por trigger. |
| `stock_minimo` | bigint | Dispara "Para reponer". |
| `controla_stock` | bool | Los servicios y algunos productos no descuentan. |
| `factor_compra` / `unidad_compra` | int / text | Ver 1.2. |
| `vence` / `dias_alerta_vencimiento` | bool / int | Alertas de vencimiento. |
| `comision_pct` / `comision_fija_centavos` | numeric / bigint | Solo para `SERVICIO`. Ver 4. |
| `visible_en_vidriera` | bool | |
| `codigo_barras` | text | Se guarda desde el día 1 aunque no haya lector. |
| `color` / `emoji` / `imagen_url` | text | La foto es **siempre opcional**. |

**Constraint que evita el bug más común:**
```sql
check (
  (tipo_venta = 'UNIDAD' and precio_venta_centavos  is not null) or
  (tipo_venta = 'PESO'   and precio_por_kg_centavos is not null)
)
```

## 4. Servicios: por qué la comisión no es el monto

Recargas de celular, SUBE, cobro de facturas. El kiosco cobra $10.000 y le entrega
al cliente $10.000 de saldo: **entran $10.000 a la caja, pero la ganancia son
$400 de comisión.**

Si esto se registra como una venta común, el reporte de facturación se infla y el
margen queda irreal por decenas de miles de pesos al mes. Por eso:

- `tipo_producto = SERVICIO`
- No descuenta stock (`controla_stock = false`)
- El movimiento de caja es por el **monto total**
- El margen del reporte es **solo `comision_pct` o `comision_fija_centavos`**

Casi ningún sistema chico lo separa. Es plata real y es un argumento de venta.

## 5. Redondeo

`config_comercio.redondeo_centavos` — a $1, $10, $50 o $100.

En Argentina 2026 las monedas no circulan. 250 g de un jamón a $18.400/kg dan
$4.600 exactos, pero 237 g dan $4.360,80: se cobra $4.400 si el redondeo es a $100.

Se aplica en dos lugares y **la regla vive en un único helper** (`lib/money.ts`):
1. El total de una línea calculada por peso.
2. El cálculo del vuelto.

## 6. Numeración de tickets

`ventas.numero` es un correlativo por comercio, **asignado por el servidor al
sincronizar**, no por el cliente. Motivo: dos dispositivos offline generarían el
mismo número. Se asigna dentro del RPC `sync_venta` con un advisory lock por
comercio. El cliente muestra el UUID corto hasta que sincroniza.

## 7. Campos fiscales (preparados, sin usar en v1)

`ventas` incluye `tipo_comprobante`, `punto_venta`, `numero_comprobante`, `cae`,
`cae_vencimiento`, `cuit_receptor`, `condicion_iva_receptor`. Quedan nulos en v1.

Cuando se implemente ARCA: desde el **01/09/2026** `CondicionIVAReceptorId` es un
campo excluyente en WSFEv1 — omitirlo impide autorizar el comprobante. Por eso la
columna ya existe.

## 8. Índices que hay que tener sí o sí

```sql
-- Búsqueda del POS (el más caliente)
create index on productos using gin (nombre_norm gin_trgm_ops);
create index on productos (comercio_id, activo, categoria_id);

-- Reportes por fecha
create index on ventas (comercio_id, creado_en desc);
create index on ventas_items (venta_id);
create index on movimientos_stock (comercio_id, producto_id, creado_en desc);

-- Reposición
create index on productos (comercio_id, proveedor_id)
  where activo and controla_stock;

-- Cuenta corriente
create index on cuenta_corriente_movimientos (comercio_id, cliente_id, creado_en desc);

-- Sync incremental
create index on productos (comercio_id, actualizado_en);
```

## 9. Triggers

| Trigger | Qué hace |
|---|---|
| `trg_stock_actualizar` | `movimientos_stock` → recalcula `productos.stock_actual` |
| `trg_cc_saldo` | `cuenta_corriente_movimientos` → recalcula `clientes.saldo_centavos` |
| `trg_precio_historial` | Cambio de precio o costo → fila en `precios_historial` |
| `trg_arqueo_inmutable` | Bloquea el `UPDATE` de `declarado_centavos`. **Este es el control real del arqueo ciego.** |
| `trg_actualizado_en` | `now()` en cada update, para el sync incremental |
| `trg_auditoria` | Registra anulaciones, cambios de precio y de límite de crédito |

## 10. RPCs (`security definer`)

| Función | Por qué es RPC y no una escritura directa |
|---|---|
| `sync_venta(jsonb)` | Atómica e idempotente: venta + items + pagos + movimientos de stock + movimiento de cuenta corriente + numeración. |
| `anular_venta(venta_id, motivo, pin)` | Revierte stock y cuenta corriente, valida el PIN del dueño, deja auditoría. |
| `cerrar_caja(sesion_id, declarado, desglose)` | Calcula el esperado del lado del servidor. **Devuelve el esperado y la diferencia solo si `auth.rol() = 'dueno'`.** |
| `aplicar_compra(jsonb)` | Suma stock por `factor_compra`, actualiza costos, opcionalmente recalcula precios por margen. |
| `actualizar_precios_masivo(filtros, pct, redondeo)` | Transaccional, con historial, sobre cientos de filas. |
| `registrar_cobro_cc(cliente_id, monto, medio)` | Movimiento de cuenta corriente + movimiento de caja en una sola transacción. |
| `convertir_pedido_en_venta(pedido_id)` | Crea la venta, descuenta stock y marca el pedido. |

## 11. Lo que **no** se modela en v1

- Series/lotes por vencimiento individual (solo fecha de vencimiento por producto).
- Múltiples depósitos o sucursales (el modelo lo tolera, la UI no lo expone).
- Listas de precios por cliente.
- Reservas de stock.
