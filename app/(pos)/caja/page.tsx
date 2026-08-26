import { Suspense } from "react";
import { PantallaCaja } from "./pantalla";

export const metadata = { title: "Caja" };

/**
 * `Suspense` porque la pantalla lee `?hacer=` para abrir la hoja del atajo, y
 * `useSearchParams` obliga a un límite de suspensión en el App Router.
 */
export default function Caja() {
  return (
    <Suspense fallback={null}>
      <PantallaCaja />
    </Suspense>
  );
}
