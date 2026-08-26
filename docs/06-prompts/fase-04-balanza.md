# Fase 4 — Modo Balanza

```
Leé docs/03-modulos/03-balanza-peso.md completo.

Objetivo: eliminar el cálculo mental en el mostrador de fiambrería. La balanza
pesa, el sistema calcula. No hay integración por cable.

TAREAS

1. Pantalla completa <ModoBalanza>, no un modal chico. Se usa con una mano.
   Pestañas arriba: GRAMOS | IMPORTE. El precio por kilo siempre visible.

2. Modo A — Gramos a importe:
   - Numpad de teclas de 72×72
   - Botones de peso frecuente: 100 g, 250 g, 500 g, 1 kg (configurables por
     producto)
   - El importe se calcula EN VIVO con importeDesdeGramos(), aplicando el
     redondeo de config_comercio.redondeo_centavos
   - Resultado en el tamaño más grande de la pantalla, con tabular-nums

3. Modo B — Importe a gramos, EN DOS PASOS (esto es lo que hace al módulo):
   - Paso 1: se ingresa el importe, se muestra "Pesá aprox. NNN g" con
     gramosDesdeImporte() SIN redondear
   - Botón PESAR lleva al paso 2
   - Paso 2: campo de gramos PRECARGADO con el valor sugerido, editable. Al
     cambiarlo se recalcula el precio real. Recién acá está el botón AGREGAR.
   - Si el corte salió exacto, aceptar es un solo toque

4. Integración con el POS:
   - Tocar un producto con tipo_venta = PESO en la grilla abre la balanza directo
   - Botón ⚖ Balanza del POS: primero elige producto, después pesa
   - Cada pesada agrega su PROPIA línea al ticket, aunque sea el mismo producto
   - El item guarda cantidad en gramos y precio_unitario_centavos = precio POR
     KILO del momento

5. Stock: se descuenta el peso REAL ingresado, no el sugerido. Si supera el stock
   disponible, se avisa pero NO se bloquea.

6. Casos borde de la spec: peso 0 o negativo deshabilita el botón; peso mayor a
   10 kg pide confirmación; producto sin precio por kilo muestra un mensaje con
   acceso directo a editarlo; si cambia el precio con la pantalla abierta, se
   recalcula con un toast.

VERIFICACIÓN OBLIGATORIA (calculado a mano, tiene que dar exacto)
- Jamón a $18.400/kg, 250 g  ->  $4.600
- Mismo producto, 237 g, con redondeo a $100  ->  $4.400
- Queso a $13.500/kg, ingreso $2.000  ->  sugiere 148 g
- Corregir a 152 g en el paso 2 recalcula antes de agregar
- El stock_g baja exactamente los gramos vendidos
- Vender un fiambre desde la grilla del POS toma 5 toques o menos
- Ningún cálculo usa punto flotante para dinero
```
