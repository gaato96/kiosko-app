"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Solo lo monta el admin: el POS no usa TanStack Query (lee de Dexie con
 * useLiveQuery) y tiene un presupuesto de bundle estricto.
 *
 * TanStack Query con valores pensados para un mostrador con red intermitente:
 * no reintenta al infinito y no refetchea al volver a la ventana (eso lo hace
 * el sincronizador, que sabe del outbox).
 */
export function Proveedores({ children }: { children: React.ReactNode }) {
  const [cliente] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 30 * 60_000,
            retry: 1,
            refetchOnWindowFocus: false,
            networkMode: "offlineFirst",
          },
          mutations: { networkMode: "offlineFirst", retry: 0 },
        },
      }),
  );

  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
