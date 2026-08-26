# Fase 9 — Vidriera Digital y pedidos

```
Leé docs/03-modulos/08-vidriera-pedidos.md completo.

Objetivo: que el kiosco tenga su propio canal de pedidos a domicilio, con stock y
precios reales, sin pagar 20-30% de comisión a las apps de delivery. Es el único
módulo que le hace GANAR plata al cliente.

TAREAS

1. Ruta pública /t/[slug] — Server Component con ISR (revalidate 60), sin auth.
   Lee de la vista vidriera_productos con la anon key.
   Si el comercio no existe o tiene vidriera_activa = false: 404.

2. Catálogo público, MOBILE-FIRST (el 95% entra desde el celular):
   - Header con logo, nombre y estado de apertura según vidriera_horarios
   - Chips de categoría sticky + buscador
   - Grilla de 2 columnas, tarjetas grandes con más aire que en el POS
   - Sin stock: según config.mostrar_sin_stock, se oculta o se muestra en gris
   - Productos por PESO: opciones de 100 g / 250 g / 500 g / 1 kg con precio
     estimado y la aclaración "el precio final depende del peso exacto"
   - Tema claro/oscuro según el dispositivo del visitante, NO el tema del POS
     (ver docs/04-DESIGN-SYSTEM.md sección 11)

3. Changuito en localStorage, sobrevive a recargar la página. Barra inferior fija
   con cantidad y total.

4. Checkout en UN SOLO PASO: nombre, teléfono, retiro o envío, dirección y zona si
   es envío, notas. Checkbox "Quiero recibir las ofertas del día" SIN TILDAR POR
   DEFECTO (consentimiento explícito).
   Validaciones: monto mínimo por zona con el faltante indicado, teléfono
   argentino, changuito no vacío.

5. Al confirmar, EN ESTE ORDEN:
   a) Se crea el pedido en la base (pedidos_vidriera + pedidos_items).
      EL TOTAL SE RECALCULA EN EL SERVIDOR, nunca se confía en el del cliente.
   b) Recién después se abre wa.me con el mensaje armado.
   Esto es lo que diferencia el módulo de un link de WhatsApp suelto: el pedido
   existe aunque el cliente nunca mande el mensaje.

6. Mensaje de WhatsApp con el formato exacto de la sección 4 de la spec, con
   emojis, saltos de línea y encodeURIComponent. Va al teléfono del dueño.

7. Bandeja de pedidos en (admin):
   - Estados NUEVO / ACEPTADO / PREPARANDO / ENTREGADO / RECHAZADO
   - Realtime de Supabase: aparecen solos, con sonido de campanilla y badge
   - Aceptar ejecuta convertir_pedido_en_venta: crea la venta con origen VIDRIERA,
     descuenta stock, asocia el pedido
   - Si algún producto quedó sin stock entre el pedido y la aceptación, avisar
     antes de convertir, con opción de quitar la línea
   - Rechazar pide motivo y ofrece un mensaje de WhatsApp para avisarle al cliente
   - Botón para llamar o escribir al cliente directo

8. Configuración de la Vidriera: activar/desactivar, título, mensaje, horarios por
   día, zonas de envío con costo y monto mínimo, color de acento, logo, qué
   categorías mostrar.

9. Generador de QR imprimible: hoja A4 con el QR grande, el nombre del kiosco y un
   texto configurable, más una tira de tarjetas chicas para las bolsas.
   El QR apunta a /t/<slug>?src=qr para poder medir el origen después.

10. Seguridad de la ruta pública:
    - La anon key solo lee vidriera_productos y categorias de comercios activos
    - Solo INSERT en pedidos_vidriera y pedidos_items, nada más
    - Rate limit: 5 pedidos por hora por teléfono, 20 por IP
    - Honeypot anti-bot en el formulario

CRITERIOS DE ACEPTACIÓN
- La vidriera carga en menos de 2 s en 4G simulado (Lighthouse mobile)
- vidriera_productos NO expone costo, margen, proveedor ni stock exacto
  (verificarlo consultando la vista con la anon key)
- Un pedido creado aparece en la bandeja del dueño SIN recargar
- Aceptar un pedido crea la venta y descuenta el stock exacto
- El mensaje de WhatsApp llega bien formateado en un teléfono real
- El total del pedido se calcula en el servidor
- El QR generado abre la vidriera correcta
```
