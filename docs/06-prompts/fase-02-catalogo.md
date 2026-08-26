# Fase 2 — Catálogo de productos

```
Leé docs/03-modulos/04-inventario.md (secciones de alta de productos) y
docs/02-MODELO-DATOS.md.

Objetivo: que un kiosco tenga su catálogo cargado en 10 minutos. Este es EL riesgo
de adopción del producto: si cargar productos es tedioso, el sistema se abandona
en el día 2.

TAREAS

1. CRUD de categorías: nombre, color de una paleta de 12, emoji, orden con
   drag & drop. Categorías por defecto al crear un comercio: Bebidas, Cigarrillos,
   Golosinas, Snacks, Fiambres, Panificados, Lácteos, Limpieza, Kiosco, Varios.

2. CRUD de proveedores: nombre, teléfono (para WhatsApp), contacto, días de visita,
   notas.

3. CRUD de productos, con formulario dividido en secciones para no abrumar:
   - Básicos: nombre, categoría, alias (chips), emoji o color
   - Precio: tipo_venta (UNIDAD / PESO). Si es UNIDAD pide precio_venta; si es
     PESO pide precio_por_kg. Campo de costo visible SOLO para el dueño.
     Mostrar el margen calculado en vivo.
   - Stock: controla_stock, stock_actual, stock_minimo, factor_compra,
     unidad_compra. Mostrar en texto la equivalencia: "1 Caja x24 = 24 unidades".
   - Extras: proveedor, código de barras, vencimiento, visible en vidriera, foto
     (OPCIONAL, nunca obligatoria)
   - Si tipo_producto = SERVICIO: comisión en % o fija, y controla_stock apagado

4. CATÁLOGO SEMILLA — la tarea más importante de la fase.
   Poblar supabase/catalogo-base.sql con ~400 productos reales de kiosco argentino,
   con marca y presentación, distribuidos por categoría. Por ejemplo:
   Coca-Cola 500 ml / 1,5 L / 2,25 L, Sprite, Fanta, Manaos, Pepsi, Quilmes 1 L,
   Brahma, Stella, Fernet Branca, Gancia, Marlboro Box, Philip Morris, Lucky
   Strike, Chesterfield, Alfajor Jorgito / Guaymallén / Milka / Terrabusi,
   Rocklets, Sugus, Mogul, Tita, Rhodesia, Papas Lays, Doritos, Palitos Pehuamar,
   Pan de mesa, Facturas, Leche La Serenísima, Yogur, Mate cocido, Yerba Playadito
   / Rosamonte / Taragüi, Azúcar Ledesma, Jamón cocido (PESO), Queso cremoso
   (PESO), Salame (PESO), Mortadela (PESO), Hielo, Carbón, Preservativos, Pilas,
   Encendedores, Papel de armar, Recarga SUBE (SERVICIO), Recarga celular
   (SERVICIO)...
   Cada uno con: nombre, marca, presentación, categoria_sugerida, tipo_venta,
   alias útiles y popularidad (1-100) para el orden.

   Pantalla de importación: buscador, filtro por categoría, checkboxes, carga
   masiva de precios en una grilla tipo planilla, y "Importar N productos".
   RPC importar_catalogo_base(ids, precios).

5. Import CSV/Excel: columnas nombre, categoria, precio, costo, stock,
   stock_minimo, codigo_barras. Vista previa con detección de duplicados y
   validación fila por fila antes de aplicar.

6. Listado de productos: virtualizado, búsqueda con trigram sobre nombre_norm,
   filtros por categoría / proveedor / sin stock / sin precio, edición inline del
   precio, acciones masivas (activar, desactivar, cambiar categoría).

7. Configurador de teclas rápidas: elegir de 8 a 12 productos, ordenar con
   drag & drop.

8. Sincronizar productos, categorías y teclas rápidas a Dexie (pull incremental
   por actualizado_en). Índice local por nombre normalizado y por alias.

CRITERIOS DE ACEPTACIÓN
- Importar 200 productos del catálogo semilla con sus precios toma menos de 10 min
- Un producto de peso no se puede guardar sin precio por kilo (lo impide el
  constraint de base, y la UI lo explica antes)
- La búsqueda local en Dexie responde en menos de 50 ms con 1.000 productos
- La foto nunca es obligatoria en ningún camino de alta
- El campo de costo no viaja al cliente cuando el usuario es empleado
```
