# Fase 7 — Cuentas corrientes (fiados)

```
Leé docs/03-modulos/06-cuentas-corrientes.md completo.

Objetivo: que el cuaderno de fiados deje de existir, y que la deuda se COBRE, que
es donde el cuaderno falla.

TAREAS

1. CRUD de clientes: nombre, teléfono, dirección, límite de crédito, notas.
   Estados visuales por saldo contra límite: al día (verde), con deuda (gris),
   cerca del límite ≥80% (ámbar), al límite (rojo).
   Solo el dueño puede crear clientes y fijar límites.

2. Botón FIADO en la pantalla de cobro: selector de cliente con buscador (trigram
   sobre el nombre). La tarjeta del cliente muestra SIEMPRE tres números:
   debe, límite y disponible, con barra de progreso.

3. Venta fiada: crea ventas con cliente_id, un ventas_pagos con medio FIADO y un
   cuenta_corriente_movimientos de tipo CARGO — todo en la misma transacción del
   RPC sync_venta que ya existe.

4. Bloqueo por límite: si la venta supera el disponible, pantalla de bloqueo con
   tres salidas: cobrar de otra forma, registrar un pago primero, o autorizar
   igual con PIN del dueño (queda en auditoria con quién autorizó y por cuánto).

5. Registrar cobro, desde la ficha o desde la lista de deudores:
   monto con botón PAGA TODO, medio de pago, RPC registrar_cobro_cc en una
   transacción:
   - inserta el movimiento PAGO
   - el trigger baja clientes.saldo_centavos
   - SI EL MEDIO ES EFECTIVO Y HAY CAJA ABIERTA, inserta un caja_movimientos de
     tipo INGRESO. Sin este paso el arqueo cierra mal, y es el error más común de
     los sistemas que tienen fiados.
   Al saldar: "Gastón quedó al día ✓".

6. Botón "Recordar por WhatsApp": genera el mensaje con el detalle de los últimos
   movimientos y el saldo, según el formato de la sección 4 de la spec.
   Configurable: incluir detalle o no, cuántos movimientos, tono del mensaje.

7. Lista de deudores: ordenable por monto, antigüedad y proximidad al límite.
   Total fiado del negocio bien visible. Filtros: al día / con deuda / al límite /
   sin movimiento hace más de 30 días.
   Sugerencia proactiva: "3 clientes deben hace más de 30 días [Mandar
   recordatorio]".

8. Ficha del cliente: saldo, límite, historial completo de movimientos con el
   saldo acumulado, y las ventas asociadas.

9. Offline: validar contra el último saldo conocido en Dexie. Badge
   "⚠ saldo de hace 3 h". Si los datos tienen más de 15 minutos, el bloqueo por
   límite pasa de bloqueo duro a ADVERTENCIA (para no impedir una venta legítima
   por un dato viejo). Al sincronizar, si el saldo real superó el límite, mostrarlo
   en el panel del dueño como "Excedido durante una venta offline".

CRITERIOS DE ACEPTACIÓN
- Cliente con límite $100.000 y deuda $95.000: una venta de $10.000 se bloquea
- El override con PIN del dueño la permite y queda en auditoria
- Un cobro en efectivo genera un INGRESO de caja y el arqueo sigue cerrando
  (probarlo end to end: fiar, cobrar, cerrar caja, verificar el esperado)
- saldo_centavos siempre iguala la suma de sus movimientos
- El mensaje de WhatsApp abre con el detalle correcto y bien codificado
- Un pago mayor a la deuda deja saldo a favor y se descuenta en la compra siguiente
```
