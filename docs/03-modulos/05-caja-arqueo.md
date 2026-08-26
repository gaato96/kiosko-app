# M5 · Caja y arqueo ciego

> El segundo diferencial del producto. Los sistemas para kiosco no traen control
> de caja contra el empleado; traen "cierre de caja" que es un resumen que el
> empleado ve antes de contar.

## Objetivo

Saber todos los días si el efectivo que hay coincide con el que debería haber, y
poder atribuir la diferencia a una persona y a un turno.

## Ciclo diario

```
ABRIR CAJA          →  VENDER            →  CERRAR CAJA
fondo inicial          ventas + movs        conteo ciego
$50.000                manuales             → diferencia
```

## 1. Apertura

Al abrir el POS sin caja abierta: modal bloqueante, no descartable.
Campo "¿Con cuánto arrancás?" con numpad y sugerencia del fondo del día anterior.

Crea `caja_sesiones` con `(comercio_id, dispositivo_id, usuario_id,
fondo_inicial_centavos, estado='ABIERTA')`.
El índice único garantiza **una sola caja abierta por dispositivo**.

## 2. Movimientos manuales

Ingresos y egresos que no son ventas. Sin esto, el arqueo nunca cierra.

| Tipo | Motivos típicos |
|---|---|
| `EGRESO` | Pago a proveedor, retiro del dueño, gasto (flete, limpieza), vuelto que faltó |
| `INGRESO` | Aporte de efectivo, cobro de un fiado |

Cada uno: monto, motivo (lista + texto libre), usuario, timestamp.
Acceso desde el POS en dos toques: no puede ser un trámite, porque si lo es, el
empleado no lo registra y la caja no cierra.

## 3. El cálculo del efectivo esperado

```
esperado = fondo_inicial
         + Σ ventas_pagos.monto  donde medio = 'EFECTIVO'  (ventas no anuladas)
         + Σ caja_movimientos    donde tipo  = 'INGRESO'
         + Σ cobros de cuenta corriente en efectivo
         - Σ caja_movimientos    donde tipo  = 'EGRESO'
```

**Solo cuentan los pagos en efectivo.** Transferencias, tarjetas y QR se informan
aparte, como totales por medio de pago, y no entran al conteo físico.

Se calcula **en el servidor**, dentro del RPC `cerrar_caja`.

## 4. Cierre — arqueo ciego

### Como empleado

```
┌──────────────────────────────────────┐
│  CERRAR CAJA                         │
│  Turno de Marce · 08:00 → 20:00      │
├──────────────────────────────────────┤
│  Contá el efectivo y anotá el total. │
│                                      │
│  $20.000  × [ 3 ]      =  $60.000    │
│  $10.000  × [ 5 ]      =  $50.000    │
│   $5.000  × [ 4 ]      =  $20.000    │
│   $2.000  × [ 2 ]      =   $4.000    │
│   $1.000  × [ 7 ]      =   $7.000    │
│   Monedas  [ $ 350  ]                │
│  ──────────────────────────────      │
│  TOTAL CONTADO         $141.350      │
│                                      │
│  [ CONFIRMAR Y CERRAR ]              │
└──────────────────────────────────────┘
```

Después de confirmar:

```
┌──────────────────────────────────────┐
│  ✓ Caja cerrada                      │
│  Declaraste $141.350                 │
│  El dueño va a revisar el cierre.    │
└──────────────────────────────────────┘
```

**No ve el esperado, no ve la diferencia, no puede volver atrás.**

### Como dueño

Ve todo: esperado, declarado, diferencia con semáforo, y el desglose de ventas
por medio de pago.

## 5. Por qué esto es un control real (y qué límite tiene)

Con un POS offline-first, el dispositivo del empleado **necesariamente** tiene las
ventas del día guardadas en IndexedDB. Alguien técnico podría sumarlas. Esconder
el número no es, por sí solo, un control.

**El control real son tres cosas, y las tres están implementadas:**

1. **El declarado es inmutable.** El trigger `trg_arqueo_inmutable` rechaza
   cualquier `UPDATE` sobre `declarado_centavos`, `desglose` y
   `esperado_centavos`. No se puede "corregir" después de ver el resultado.
2. **El esperado nunca viaja.** La política RLS de `arqueos` permite `INSERT` al
   empleado pero **no `SELECT`**. Inspeccionar la red no sirve: el dato no está
   en la respuesta.
3. **Queda el historial por persona.** Una diferencia aislada es un error; el
   mismo signo repetido durante tres semanas es otra cosa. El valor del módulo
   está en la serie, no en el día.

> Esto se documenta así, sin venderlo como algo que no es. Es un control de
> fricción y auditoría, no una caja fuerte.

## 6. Historial y reportes de caja

- Lista de cierres con fecha, usuario, esperado, declarado, diferencia.
- **Diferencia acumulada por empleado** en el mes. La métrica que importa.
- Detalle de un cierre: todas las ventas y movimientos del turno.
- El dueño puede marcar un cierre como revisado y dejar una nota
  (`revisado_por`, `nota_revision`). Es lo único que se puede agregar después.

## 7. Offline

Si no hay conexión al cerrar: el declarado se guarda en Dexie y se encola. Se le
avisa "Cierre guardado, se va a enviar cuando vuelva internet". El esperado y la
diferencia se calculan del lado del servidor cuando llega. El empleado igual no ve
nada, así que el flujo es idéntico.

## Datos

`caja_sesiones`, `caja_movimientos`, `arqueos`, `ventas_pagos`,
`cuenta_corriente_movimientos`.

### RPC `cerrar_caja`

```sql
create or replace function cerrar_caja(
  p_sesion_id uuid, p_declarado bigint, p_desglose jsonb)
returns jsonb
language plpgsql security definer as $fn$
declare v_esperado bigint; v_es_dueno boolean := public.es_dueno();
begin
  -- 1. calcular esperado (fondo + efectivo - egresos + ingresos)
  -- 2. insert into arqueos (...)
  -- 3. update caja_sesiones set estado='CERRADA', cerrada_en=now()
  -- 4. devolver el detalle SOLO si es dueño
  if v_es_dueno then
    return jsonb_build_object('esperado', v_esperado, 'declarado', p_declarado,
                              'diferencia', p_declarado - v_esperado);
  end if;
  return jsonb_build_object('ok', true, 'declarado', p_declarado);
end $fn$;
```

## Casos borde

| Caso | Comportamiento |
|---|---|
| Se olvidó de cerrar la caja ayer | Al abrir el POS: "Tenés una caja abierta desde el 23/08. ¿Cerrarla ahora?" con el flujo de arqueo. |
| Se anula una venta después del cierre | La anulación no toca un arqueo cerrado. Se registra como movimiento de caja del turno actual. |
| Dos dispositivos | Cada uno tiene su caja y su arqueo. El reporte del dueño consolida. |
| Diferencia de $0 exacta y sostenida | Se marca sutilmente: un arqueo perfecto todos los días también es una señal. |
| El empleado cierra y sigue vendiendo | No puede: sin caja abierta el POS bloquea el cobro. |

## Criterios de aceptación

- [ ] Un empleado autenticado que consulta `arqueos` por API recibe **0 filas**.
- [ ] La respuesta de `cerrar_caja` para un empleado **no contiene** el esperado.
- [ ] Un `UPDATE` sobre `declarado_centavos` lanza excepción.
- [ ] `esperado` incluye solo pagos en efectivo, y suma cobros de fiado en efectivo.
- [ ] El dueño ve la diferencia acumulada por empleado del mes.
- [ ] Cerrar caja sin conexión funciona y sincroniza al recuperar la red.
