# M6 · Cuentas corrientes (fiados)

## Objetivo

Que el cuaderno de fiados deje de existir. Saber en un vistazo quién está al día,
quién debe y quién llegó al límite — y **cobrar**, que es donde el cuaderno falla.

## User stories

- Como empleado, le cargo una venta a la cuenta de Gastón sin que me pregunten nada.
- Como empleado, si Gastón llegó a su límite, el sistema no me deja seguir fiándole
  y no tengo que ser yo el que diga que no.
- Como dueño, veo la lista de deudores ordenada por monto.
- Como dueño, le mando a Gastón el detalle de lo que debe por WhatsApp con un toque.
- Como empleado, registro que Gastón pagó $30.000 de los $80.000 que debía.

## 1. Ficha de cliente

| Campo | Nota |
|---|---|
| `nombre` | Obligatorio |
| `telefono` | Necesario para el recordatorio de WhatsApp |
| `direccion` | Opcional |
| `limite_credito_centavos` | 0 = no se le fía |
| `saldo_centavos` | Deuda actual, mantenido por trigger |
| `notas` | "El hijo también puede comprar", "paga los viernes" |

**Estados visuales:**

| Estado | Condición | Color |
|---|---|---|
| Al día | `saldo = 0` | Verde |
| Con deuda | `0 < saldo < 80%` del límite | Gris |
| Cerca del límite | `saldo >= 80%` del límite | Ámbar |
| Al límite | `saldo >= límite` | Rojo — bloquea |

## 2. Vender fiado desde el POS

En la pantalla de cobro, botón `FIADO` → selector de cliente con buscador.
La tarjeta del cliente muestra, siempre, tres números:

```
┌────────────────────────────────┐
│  Gastón Pérez                  │
│  Debe        $85.000           │
│  Límite     $100.000           │
│  Disponible  $15.000    ▓▓▓▓░  │
└────────────────────────────────┘
```

### Si la venta entra
Se confirma. Se crea `ventas` con `cliente_id`, un `ventas_pagos` con
`medio = 'FIADO'`, y un `cuenta_corriente_movimientos` de tipo `CARGO` — todo en
la misma transacción del `sync_venta`.

### Si la venta no entra
```
┌──────────────────────────────────────────┐
│  ⛔ Gastón llegó al límite                │
│  Debe $85.000 de $100.000                │
│  Esta compra es de $22.000               │
│                                          │
│  [ Cobrar de otra forma ]                │
│  [ Registrar un pago primero ]           │
│  [ Autorizar igual (PIN del dueño) ]     │
└──────────────────────────────────────────┘
```

> El bloqueo tiene un valor que no es técnico: **le saca al empleado la
> responsabilidad de decir que no.** No es "no te fío", es "no me deja el
> sistema". Eso es la mitad del producto para un kiosco de barrio.

El override del dueño queda en `auditoria` con quién autorizó y por cuánto.

## 3. Cobrar

Desde la ficha del cliente o desde la lista de deudores:

```
┌────────────────────────────────────┐
│  Registrar pago — Gastón Pérez     │
│  Debe: $85.000                     │
├────────────────────────────────────┤
│  Monto  [ $ 85.000 ]               │
│  [ PAGA TODO ]  [ Pago parcial ]   │
│  Medio: [Efectivo][Transf][Débito] │
│         [ CONFIRMAR ]              │
└────────────────────────────────────┘
```

`registrar_cobro_cc` hace en una transacción:
1. `cuenta_corriente_movimientos` tipo `PAGO`.
2. El trigger baja `clientes.saldo_centavos`.
3. Si el medio es efectivo y hay caja abierta, inserta un `caja_movimientos` de
   tipo `INGRESO`. **Sin este paso el arqueo cierra mal**, y es el error más común
   de los sistemas que tienen fiados.

Al saldar: pantalla de confirmación con "Gastón quedó al día ✓".

## 4. Recordatorio por WhatsApp

El botón que hace que el fiado se cobre. Genera:

```
Hola Gastón! Te paso el detalle de tu cuenta en Kiosco La Esquina:

24/08 — Compra          $12.500
22/08 — Compra          $18.000
20/08 — Compra           $9.500
18/08 — Pago            -$20.000

Saldo actual: $85.000

Cualquier cosa avisame. Gracias!
```

Configurable: incluir o no el detalle, tono del mensaje, cuántos movimientos
mostrar. Abre `wa.me/<telefono>?text=<encoded>`.

Sugerencia proactiva en el panel: "3 clientes con deuda de más de 30 días
[Mandar recordatorio]".

## 5. Lista de deudores

Ordenable por monto, por antigüedad y por proximidad al límite. Muestra el total
fiado del negocio — un número que la mayoría de los kiosqueros no conoce y que
suele sorprender.

Filtros: al día · con deuda · al límite · sin movimiento hace más de 30 días.

## 6. Offline: el riesgo aceptado

Estando sin conexión, la validación del límite se hace contra el **último saldo
conocido** en Dexie. Con dos dispositivos offline, dos ventas simultáneas podrían
pasar el tope.

Mitigaciones implementadas:
- Badge en la tarjeta del cliente: `⚠ saldo de hace 3 h`.
- Con datos de más de 15 minutos, el bloqueo por límite pasa a ser una
  **advertencia** en vez de un bloqueo duro (para no impedir una venta legítima
  por un dato viejo).
- Al sincronizar, si el saldo real superó el límite, aparece en el panel del dueño
  como "Excedido durante una venta offline".

Con un solo dispositivo — el caso de este cliente — el problema no existe.

## Datos

`clientes`, `cuenta_corriente_movimientos`, `ventas` (`cliente_id`),
`ventas_pagos` (`medio = 'FIADO'`), `caja_movimientos`.

## Casos borde

| Caso | Comportamiento |
|---|---|
| Cliente nuevo en medio de una venta | Alta express: nombre + teléfono + límite, sin salir del cobro. |
| Pago mayor a la deuda | Se permite: queda saldo a favor (`saldo` negativo) y se descuenta de la próxima compra. |
| Se anula una venta fiada | Se inserta un `AJUSTE` que revierte el cargo. El saldo vuelve solo. |
| Límite en $0 | El cliente existe pero no se le fía. El botón FIADO no lo ofrece. |
| Cliente con deuda que se desactiva | No se borra nunca con saldo distinto de 0. Se avisa. |
| Fiado sin caja abierta | Se permite: el fiado no mueve efectivo. Solo el cobro necesita caja. |

## Criterios de aceptación

- [ ] Cliente con límite $100.000 y deuda $95.000: una venta de $10.000 se bloquea.
- [ ] El override con PIN del dueño la permite y queda en `auditoria`.
- [ ] Un cobro en efectivo genera un `INGRESO` de caja y el arqueo sigue cerrando.
- [ ] `saldo_centavos` siempre iguala la suma de sus movimientos.
- [ ] El mensaje de WhatsApp se abre con el detalle correcto y bien codificado.
- [ ] Al saldar, el cliente pasa a "Al día ✓".
