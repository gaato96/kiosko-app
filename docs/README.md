# Kiosko App — Documentación

PWA de gestión integral para kioscos y maxikioscos argentinos.
Multi-tenant, offline-first, táctil.

## Por dónde empezar

| Si querés… | Leé |
|---|---|
| Entender qué es y para quién | [00-PRD.md](00-PRD.md) |
| Construirlo | [05-ROADMAP-FASES.md](05-ROADMAP-FASES.md) → [06-prompts/](06-prompts/) |
| Entender una decisión técnica | [01-ARQUITECTURA.md](01-ARQUITECTURA.md) |
| Tocar la base de datos | [02-MODELO-DATOS.md](02-MODELO-DATOS.md) + [`schema.sql`](../supabase/schema.sql) |
| Diseñar una pantalla | [04-DESIGN-SYSTEM.md](04-DESIGN-SYSTEM.md) |
| Ponerle precio y venderlo | [07-NEGOCIO.md](07-NEGOCIO.md) |
| Pegar todo en otra IA | [`PROMPT-MAESTRO.md`](../PROMPT-MAESTRO.md) |

## Índice

```
CLAUDE.md              Reglas permanentes del proyecto (se carga solo en Claude Code)
PROMPT-MAESTRO.md      Toda la spec condensada en un bloque portable

docs/
  00-PRD.md            Problema, usuarios, alcance, criterios de éxito
  01-ARQUITECTURA.md   Stack, multi-tenant, offline-first, PWA, seguridad, costos
  02-MODELO-DATOS.md   Las decisiones del modelo (el SQL está en supabase/)
  03-modulos/          Una spec por módulo, con criterios de aceptación
  04-DESIGN-SYSTEM.md  Color, tipografía, componentes, copy rioplatense
  05-ROADMAP-FASES.md  12 fases, dependencias, riesgos, entrega al piloto
  06-prompts/          Un prompt ejecutable por fase
  07-NEGOCIO.md        Precios, unit economics, propuesta comercial

supabase/
  schema.sql           Esquema + RLS + triggers + vistas
  seed.sql             Datos de demo            (pendiente, fase 1)
  catalogo-base.sql    ~400 productos argentinos (pendiente, fase 2)
```

## Módulos

| # | Módulo | Fase | Spec |
|:--:|---|:--:|---|
| M1 | Auth y RBAC | 1 | [01-auth-rbac.md](03-modulos/01-auth-rbac.md) |
| M2 | POS | 3 | [02-pos.md](03-modulos/02-pos.md) |
| M3 | Modo Balanza | 4 | [03-balanza-peso.md](03-modulos/03-balanza-peso.md) |
| M4 | Inventario y reposición | 6 | [04-inventario.md](03-modulos/04-inventario.md) |
| M5 | Caja y arqueo ciego | 5 | [05-caja-arqueo.md](03-modulos/05-caja-arqueo.md) |
| M6 | Cuentas corrientes | 7 | [06-cuentas-corrientes.md](03-modulos/06-cuentas-corrientes.md) |
| M7 | Precios e inflación | 10 | [07-precios-inflacion.md](03-modulos/07-precios-inflacion.md) |
| M8 | Vidriera Digital | 9 | [08-vidriera-pedidos.md](03-modulos/08-vidriera-pedidos.md) |
| M9 | Reportes y métricas | 10 | [09-reportes-metricas.md](03-modulos/09-reportes-metricas.md) |

## Las cinco cosas que hay que tener presentes siempre

1. **Plata en centavos, peso en gramos, todo entero.** Nunca floats.
2. **El stock es un libro mayor**, no un número que el cliente sobrescribe.
3. **El POS escribe primero en IndexedDB** y nunca espera a la red.
4. **Los permisos se validan en el servidor.** Esconder un botón no es seguridad.
5. **La carga inicial del catálogo es el riesgo número uno del producto.** Por eso
   el catálogo semilla es requisito de MVP, no un extra.
