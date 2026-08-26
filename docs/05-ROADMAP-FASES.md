# 05 · Roadmap de construcción

Cada fase tiene un prompt ejecutable en [`06-prompts/`](06-prompts/).
**Cada fase termina con algo que se puede mostrar y probar.** Nada de tres semanas
de infraestructura sin pantalla.

## MVP — lo que se puede vender

| Fase | Qué se construye | Est. | Se puede demostrar |
|:--:|---|:--:|---|
| **0** | Setup: Next 15, TS, Tailwind, shadcn, Supabase, PWA, Dexie, capa offline, `lib/money.ts`, `lib/peso.ts` | 2-3 d | La app instala como PWA y abre sin red |
| **1** | Multi-tenant, auth, RBAC, RLS, hook del JWT, PIN, selector de operador | 3-4 d | Dueño y empleado ven cosas distintas |
| **2** | Categorías, productos, **catálogo semilla (~400)**, import CSV, alta express | 4-5 d | Catálogo cargado en 10 minutos |
| **3** | POS core local-first: grilla, buscador, teclas rápidas, ticket, pagos, vuelto, pago mixto | 6-8 d | **Se cobra una venta real** |
| **4** | Modo Balanza (gramos↔importe con confirmación de peso) | 2-3 d | Se vende 250 g de jamón |
| **5** | Caja: apertura, movimientos, arqueo ciego, auditoría | 3-4 d | Cierre de caja con diferencia |
| **6** | Inventario: libro mayor, mínimos, reposición por proveedor, WhatsApp, compras, merma | 5-6 d | Pedido a proveedor por WhatsApp |
| **7** | Cuentas corrientes: límites, bloqueo, cobros, recordatorio | 3-4 d | Fiado bloqueado por límite |
| **8** | Sync robusto: conflictos, reintentos, pantalla de diagnóstico, pruebas offline | 3-4 d | 20 ventas en modo avión que sincronizan |

**Subtotal MVP: ~6-7 semanas.**

## Fase 2 — el upsell

| Fase | Qué se construye | Est. |
|:--:|---|:--:|
| **9** | Vidriera pública, checkout, bandeja de pedidos, realtime, QR | 5-6 d |
| **10** | Reportes, panel, actualización masiva de precios, gastos, combos | 4-5 d |
| **11** | Pulido: performance, Lighthouse, onboarding, testing, estados vacíos | 3-4 d |

**Total: 10-13 semanas** de un desarrollador con asistencia de IA.

## Orden de dependencias

```
0 ──> 1 ──> 2 ──> 3 ──> 4
                  │     │
                  ├─────┴──> 5 ──> 8
                  │
                  ├──> 6
                  │
                  └──> 7
                       │
                  2 ───┴──> 9 ──> 11
                  3,5,6,7 ─────> 10 ──> 11
```

- **La 3 es el hito real.** Hasta ahí no hay producto.
- La 8 (sync robusto) se puede solapar: la arquitectura offline nace en la 0, la 8
  es el endurecimiento.
- Las 6 y 7 son independientes entre sí y se pueden reordenar según lo que el
  cliente piloto necesite antes.

## Estrategia de entrega al cliente piloto

| Momento | Qué se entrega |
|---|---|
| Fin de fase 4 | **Piloto en el mostrador.** Ya puede cobrar y pesar. El resto se sigue construyendo mientras lo usa. |
| Fin de fase 5 | Control de caja. Acá empieza a ver el valor real. |
| Fin de fase 8 | MVP completo, se factura el desarrollo. |
| Fin de fase 9 | Vidriera — se activa el argumento del abono mensual. |

> Poner el POS en el mostrador en la semana 3 y no en la 13 cambia el proyecto por
> completo: el feedback de las primeras dos semanas de uso real vale más que
> cualquier reunión de requisitos. Y hay que asumir que va a doler.

## Definición de terminado (aplica a toda fase)

- [ ] Los criterios de aceptación de la spec del módulo pasan.
- [ ] Funciona en tablet **y** en celular.
- [ ] Funciona sin conexión, si el módulo lo requiere.
- [ ] RLS verificada con un token de empleado y con un token de otro comercio.
- [ ] Sin `any`, sin `console.log` olvidados, sin `TODO` sin ticket.
- [ ] Estados de carga, error y vacío resueltos.
- [ ] Copy revisado en español rioplatense.

## Riesgos y mitigación

| Riesgo | Impacto | Mitigación |
|---|---|---|
| **La carga del catálogo mata la adopción** | Alto | Catálogo semilla + import + alta express. Es requisito de MVP, no un extra. |
| La sincronización offline se subestima | Alto | Se diseña en la fase 0 y se prueba en cada fase, no al final. |
| Alcance que crece solo | Medio | El MVP está congelado en las fases 0-8. Todo lo demás va a un backlog visible. |
| El cliente pide facturación ARCA | Medio | Está fuera de alcance por escrito, con precio de addon ya definido. |
| La tablet del kiosco es vieja y lenta | Medio | Presupuesto de bundle estricto y prueba real en un dispositivo de gama baja desde la fase 3. |
| El empleado no lo usa y vuelve al papel | Alto | El POS tiene que ser más rápido que el papel. Por eso las metas están en toques y segundos, no en features. |
