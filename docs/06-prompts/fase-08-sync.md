# Fase 8 — Sincronización robusta

```
Leé docs/01-ARQUITECTURA.md sección 3 completa.

La arquitectura offline existe desde la fase 0. Esta fase la endurece y la hace
observable. Al terminar, el kiosco puede pasar un día entero sin internet y no
perder una sola venta.

TAREAS

1. Worker de sincronización:
   - Se dispara al recuperar conexión (evento online), al abrir la app, cada 60 s
     si hay pendientes, y a mano desde el indicador de estado
   - Procesa el outbox en orden de creación
   - Backoff exponencial: 1s, 2s, 4s, 8s… tope 5 min, 10 intentos
   - Un item que falla no bloquea a los siguientes que no dependen de él
   - Cancela el ciclo si se pierde la conexión, sin dejar items colgados en
     estado "enviando"

2. Idempotencia verificada de punta a punta: todos los RPC de sync usan
   on conflict (id) do nothing y devuelven el estado resultante. Escribir un test
   que envíe la misma venta 10 veces en paralelo y verifique que hay una sola fila.

3. Pull incremental: traer de Supabase solo lo que cambió desde el último
   actualizado_en conocido, por tabla, guardando la marca en la tabla local meta.
   Reconciliar el stock local con el del servidor después de cada push.

4. Pantalla "Ventas sin sincronizar" (accesible desde el indicador de estado):
   - Lista de items del outbox con estado, intentos y el último error
   - Botón de reintentar por item y de reintentar todo
   - Detalle expandible del payload
   - NUNCA se descarta un item en silencio. Si algo falla definitivamente, tiene
     que quedar visible y recuperable.

5. Manejo de errores del servidor por tipo:
   - Error de red o timeout: reintentar
   - 401 / token vencido: refrescar sesión y reintentar
   - 409 / conflicto de datos: marcar para revisión manual, no reintentar en loop
   - 4xx de validación: marcar como error con el detalle, no reintentar

6. Indicador <EstadoSync> completo, con los tres estados y el conteo real de
   pendientes. Al tocarlo, abre la pantalla de diagnóstico.

7. Manejo del almacenamiento: avisar si IndexedDB se acerca al límite de cuota
   (navigator.storage.estimate). Purgar ventas ya sincronizadas de más de 30 días
   de la base local, nunca las pendientes.

8. Reloj: guardar creado_en con el reloj del dispositivo y sincronizado_en con el
   del servidor. Si la diferencia supera 5 minutos, avisar que el dispositivo tiene
   la hora mal — afecta reportes y cierres de caja.

PRUEBAS OBLIGATORIAS (documentarlas en docs/TESTING-OFFLINE.md)
1. Modo avión, 20 ventas variadas (efectivo, mixto, peso, fiado, servicio),
   volver online, verificar que llegan las 20 exactamente una vez y que el stock
   del servidor coincide con el esperado
2. Cortar la conexión EN MEDIO de una sincronización y verificar que no se
   duplica ni se pierde nada
3. Cerrar la app con items pendientes, reabrirla y verificar que se procesan
4. Reenviar manualmente un item ya sincronizado: no debe duplicar
5. Dos dispositivos offline vendiendo el mismo producto: al sincronizar, el stock
   final tiene que ser el inicial menos la suma de ambas ventas
6. Token vencido durante la sincronización: se refresca y continúa

CRITERIOS DE ACEPTACIÓN
- Las 6 pruebas de arriba pasan
- Ningún item del outbox se pierde en ningún escenario
- El indicador de estado siempre refleja la realidad
- Un día entero de ventas sin conexión sincroniza sin intervención manual
```
