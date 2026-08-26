# 06 · Prompts por fase

Un prompt por fase, listo para pegar en Claude Code (o en cualquier IA que trabaje
sobre el repo).

## Cómo usarlos

1. Abrí Claude Code en la carpeta del proyecto. `CLAUDE.md` se carga solo.
2. Pegá el prompt de la fase que toca.
3. Cuando termine, verificá contra los **criterios de aceptación** de la spec del
   módulo antes de pasar a la siguiente.

## Reglas que valen para todas las fases

Estas van implícitas en cada prompt porque están en `CLAUDE.md`, pero conviene
repetirlas si la sesión se hizo larga:

- Plata en **centavos** (bigint). Peso en **gramos** (bigint). Nunca floats.
- El stock es un **libro mayor** (`movimientos_stock`), nunca un número que el
  cliente sobrescribe.
- El POS **escribe primero en IndexedDB** y no espera a la red.
- Toda tabla de negocio lleva `comercio_id` **y su política RLS**.
- Los permisos se validan en el servidor, no escondiendo la UI.
- Español rioplatense en la interfaz.
- Targets táctiles de 64×64 px mínimo en el POS.

## Orden

```
fase-00-setup.md              Infraestructura y capa offline
fase-01-auth-rbac.md          Multi-tenant, roles, PIN
fase-02-catalogo.md           Productos y catálogo semilla
fase-03-pos.md                ← el hito real
fase-04-balanza.md            Venta por peso
fase-05-caja.md               Arqueo ciego
fase-06-inventario.md         Reposición y compras
fase-07-cuentas-corrientes.md Fiados
fase-08-sync.md               Sincronización robusta
fase-09-vidriera.md           Catálogo público y pedidos
fase-10-reportes.md           Métricas y precios masivos
fase-11-pulido.md             Performance, onboarding, testing
```

## Si algo se rompe

Antes de improvisar, releé la spec del módulo en `docs/03-modulos/`. Casi todos
los casos borde ya están decididos ahí.
