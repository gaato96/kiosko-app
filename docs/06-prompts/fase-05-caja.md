# Fase 5 — Caja y arqueo ciego

```
Leé docs/03-modulos/05-caja-arqueo.md completo.

Objetivo: saber todos los días si el efectivo que hay coincide con el que debería
haber, y poder atribuir la diferencia a una persona y a un turno.

TAREAS

1. Apertura de caja: modal bloqueante y no descartable al abrir el POS sin caja
   abierta. Campo "¿Con cuánto arrancás?" con numpad y sugerencia del fondo del
   día anterior. RPC abrir_caja(fondo_inicial, dispositivo_id).
   El índice único garantiza una sola caja abierta por dispositivo.

2. Movimientos manuales, accesibles desde el POS en DOS TOQUES:
   - EGRESO: pago a proveedor, retiro del dueño, gasto, otro
   - INGRESO: aporte de efectivo, otro
   Monto, motivo de una lista más texto libre, usuario.
   Si registrarlo es un trámite, el empleado no lo hace y la caja nunca cierra.

3. RPC cerrar_caja(sesion_id, declarado, desglose), security definer:
   - Calcula el esperado EN EL SERVIDOR:
     fondo_inicial
     + pagos en EFECTIVO de ventas no anuladas
     + INGRESOS manuales
     + cobros de cuenta corriente en efectivo
     - EGRESOS manuales
   - Inserta en arqueos
   - Cierra la sesión
   - Devuelve esperado y diferencia SOLO si public.es_dueno() es verdadero.
     Para un empleado devuelve únicamente { ok: true, declarado }

4. Pantalla de cierre para EMPLEADO:
   - Desglose de billetes: 20.000 / 10.000 / 5.000 / 2.000 / 1.000 / 500 / monedas
   - Se puede ingresar el total directo en vez del desglose
   - Total contado en vivo mientras carga
   - Al confirmar: "Caja cerrada. Declaraste $X. El dueño va a revisar el cierre."
   - NO ve el esperado, NO ve la diferencia, NO puede volver atrás

5. Pantalla de cierre para DUEÑO: esperado, declarado, diferencia con semáforo
   (verde exacto, ámbar hasta cierto umbral, rojo por encima) y desglose de ventas
   por medio de pago.

6. Historial de arqueos: lista con fecha, usuario, esperado, declarado y
   diferencia. Detalle con todas las ventas y movimientos del turno.
   DIFERENCIA ACUMULADA POR EMPLEADO EN EL MES: esta es la métrica que importa,
   no el día suelto.
   El dueño puede marcar como revisado y dejar una nota (revisado_por,
   nota_revision) — es lo único que se puede agregar después.

7. Bloqueo: sin caja abierta, el POS no permite cobrar. Modal con el botón de
   apertura ahí mismo.

8. Caja olvidada: al abrir el POS, si hay una sesión abierta de un día anterior,
   ofrecer cerrarla con el flujo normal de arqueo.

9. Offline: el cierre se guarda en Dexie y se encola. Mensaje "Cierre guardado, se
   envía cuando vuelva internet". El empleado igual no ve nada, así que el flujo
   es idéntico.

CRITERIOS DE ACEPTACIÓN (verificar llamando a la API, no mirando la UI)
- Un empleado autenticado que consulta arqueos recibe 0 filas
- La respuesta de cerrar_caja para un empleado NO contiene el esperado
- Un UPDATE sobre arqueos.declarado_centavos lanza excepción
- El esperado suma solo pagos en efectivo, e incluye cobros de fiado en efectivo
- El dueño ve la diferencia acumulada por empleado del mes
- Cerrar caja sin conexión funciona y sincroniza después

NOTA IMPORTANTE: el arqueo ciego es un control de fricción y auditoría, no una
caja fuerte. El dispositivo del empleado tiene las ventas locales por ser
offline-first. El control real son las tres cosas de la sección 5 de la spec:
el declarado es inmutable, el esperado no viaja, y queda el historial por persona.
No lo documentes como algo más fuerte de lo que es.
```
