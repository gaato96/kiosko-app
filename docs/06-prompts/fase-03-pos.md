# Fase 3 — POS (el hito real)

```
Leé docs/03-modulos/02-pos.md completo y docs/04-DESIGN-SYSTEM.md.

Esta es LA fase. Al terminar, el kiosco puede cobrar una venta real sin internet.
Meta medible: 3 productos + efectivo + vuelto en 8 toques o menos, en menos de
15 segundos.

TAREAS

1. Layout del POS en (pos)/page.tsx, según el diagrama de la spec:
   panel izquierdo con buscador + teclas rápidas + grilla por categorías,
   panel derecho con el ticket. En celular vertical, el ticket colapsa a una barra
   inferior con el total.

2. Buscador:
   - Autofocus al abrir
   - Consulta LOCAL a Dexie sobre nombre_norm y alias, con debounce de 80 ms
   - Enter agrega el primer resultado
   - Sin resultados: botón "Crear «texto» y agregar" que abre alta express
     (nombre + precio) y lo agrega al ticket sin salir de la venta

3. Teclas rápidas: grilla fija de 8-12, un toque = al ticket. Si el comercio no
   las configuró, autocompletar con los más vendidos de los últimos 30 días.

4. Grilla de productos: chips de categoría con scroll horizontal, tarjetas
   <ProductoCard> de 96×96 mínimo, virtualizada. La foto es opcional; sin foto se
   muestra color de categoría + emoji o inicial.

5. Store del ticket (Zustand, persistido en Dexie):
   agregarItem, quitarItem, cambiarCantidad, aplicarDescuento, limpiar.
   Un producto agregado dos veces incrementa la cantidad de la línea existente,
   salvo los de PESO, donde cada pesada es su propia línea.
   Los precios se CONGELAN al agregar (precio y costo del momento).

6. Pantalla de cobro (pantalla completa):
   - Total arriba, en el tamaño más grande de la pantalla
   - Seis botones grandes: EFECTIVO, TRANSFERENCIA, DÉBITO, CRÉDITO, QR, FIADO
   - Efectivo: campo "Paga con" + numpad + botones $2.000 / $5.000 / $10.000 /
     $20.000 / JUSTO. El vuelto se calcula EN VIVO mientras tipea, en verde y
     enorme. Si paga con menos que el total, el confirmar queda deshabilitado.
   - Pago mixto: "Agregar otro medio de pago", se van sumando filas; el confirmar
     solo se habilita cuando la suma de pagos iguala el total
   - Confirmar: escritura local instantánea + pantalla de éxito con el vuelto en
     grande por 2 segundos + vuelta al POS con el ticket limpio

7. Persistencia de la venta (esto es lo crítico):
   - Generar uuid v7 en el cliente
   - Escribir venta + items + pagos en Dexie
   - Insertar los deltas de stock locales
   - Encolar en el outbox
   - NUNCA await de red en el camino crítico
   - RPC sync_venta en Postgres: atómico e idempotente (on conflict do nothing),
     que crea venta + items + pagos + movimientos_stock + movimiento de cuenta
     corriente si es fiado, y asigna el número correlativo con advisory lock por
     comercio

8. Anulación de ventas del día: exige motivo y PIN del dueño, revierte stock,
   deja auditoría. Las ventas NO se editan ni se borran nunca.

9. Descuentos por monto o porcentaje sobre el total, con PIN del dueño si el
   operador es empleado. Auditado.

10. Productos SERVICIO: al agregarse piden el monto y no descuentan stock.

11. Atajos de teclado: / enfoca el buscador, Enter agrega, F1-F12 teclas rápidas,
    +/- cantidad, F9 cobrar, Esc cancelar.

12. Feedback: haptic + sonido corto al agregar, sonido de confirmación al cobrar.
    Todo desactivable.

CRITERIOS DE ACEPTACIÓN
- Venta de 3 productos con efectivo y vuelto en 8 toques o menos
- Búsqueda en menos de 50 ms con 1.000 productos
- Con modo avión, 20 ventas seguidas sin un solo error
- Reenviar 10 veces la misma venta produce UNA fila en la base
- Pago mixto efectivo + transferencia genera dos filas en ventas_pagos
- First Load JS de la ruta del POS por debajo de 200 kB (verificar con
  next build)
- Cerrar y reabrir la app con un ticket a medias lo restaura

NO agregues todavía: venta por peso (fase 4), caja (fase 5), fiados (fase 7).
Dejá los botones de BALANZA y FIADO deshabilitados con un tooltip "Próximamente".
```
