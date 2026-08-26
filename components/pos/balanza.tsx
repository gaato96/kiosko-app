"use client";

/**
 * <ModoBalanza> — la balanza pesa, el sistema calcula.
 *
 * Dos modos:
 *   A) GRAMOS  → importe. El habitual: "250 de jamón".
 *   B) IMPORTE → gramos, EN DOS PASOS. El que falta en todos lados.
 *
 * El paso 2 del modo B es la clave del módulo: sin él, el sistema cobra $2.000
 * por 152 g que valen $2.052, y esa diferencia, veinte veces por día, es plata
 * que se regala. Sale precargado con el peso sugerido, así que si el corte salió
 * exacto es un solo toque.
 */

import { useState } from "react";
import { ArrowLeft, Scale } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { MontoGrande } from "@/components/ui/monto-grande";
import { Numpad } from "./numpad";
import { formatearPesos } from "@/lib/money";
import {
  PESOS_FRECUENTES,
  PESO_SOSPECHOSO_G,
  formatearPeso,
  gramosDesdeImporte,
  importeDesdeGramos,
} from "@/lib/peso";
import type { Producto } from "@/lib/tipos";
import { cn, haptico } from "@/lib/utils";

type Modo = "GRAMOS" | "IMPORTE";
type Paso = "TIPEAR" | "CONFIRMAR_PESO";

export function ModoBalanza({
  producto,
  redondeoCentavos,
  onAgregar,
  onVolver,
}: {
  producto: Producto;
  redondeoCentavos: number;
  onAgregar: (gramos: number, totalCentavos: number) => void;
  onVolver: () => void;
}) {
  const precioKg = producto.precio_por_kg_centavos ?? 0;

  const [modo, setModo] = useState<Modo>("GRAMOS");
  const [paso, setPaso] = useState<Paso>("TIPEAR");
  const [tipeado, setTipeado] = useState("");
  const [pesoReal, setPesoReal] = useState("");

  if (precioKg <= 0) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <Scale size={36} className="text-warning" />
        <p className="text-lg font-semibold">Falta cargar el precio por kilo</p>
        <p className="max-w-sm text-text-muted">
          {producto.nombre} se vende por peso pero todavía no tiene precio por kilo. Cargalo desde
          Productos y volvé.
        </p>
        <Boton onClick={onVolver}>Volver</Boton>
      </div>
    );
  }

  const gramosTipeados = Number(tipeado || 0);
  const importeTipeado = Number(tipeado || 0) * 100;

  const sugeridos = modo === "IMPORTE" ? gramosDesdeImporte(importeTipeado, precioKg) : 0;
  const gramosFinales =
    paso === "CONFIRMAR_PESO" ? Number(pesoReal || 0) : modo === "GRAMOS" ? gramosTipeados : sugeridos;

  const importeFinal = importeDesdeGramos(gramosFinales, precioKg, redondeoCentavos);
  const sospechoso = gramosFinales > PESO_SOSPECHOSO_G;
  const puedeAgregar = gramosFinales > 0;

  function agregar() {
    if (!puedeAgregar) return;
    if (sospechoso && !confirm(`¿${formatearPeso(gramosFinales)}? Confirmá que el peso está bien.`)) {
      return;
    }
    haptico(20);
    onAgregar(gramosFinales, importeFinal);
  }

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex items-center gap-3 border-b border-border p-3">
        <Boton variante="fantasma" onClick={onVolver} aria-label="Volver">
          <ArrowLeft size={22} />
        </Boton>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{producto.nombre}</p>
          {/* El precio por kilo siempre a la vista: el operador lo canta. */}
          <p className="num text-sm text-text-muted">{formatearPesos(precioKg)} /kg</p>
        </div>
      </header>

      {paso === "TIPEAR" ? (
        <div className="flex border-b border-border">
          {(["GRAMOS", "IMPORTE"] as const).map((m) => (
            <button
              key={m}
              onClick={() => {
                setModo(m);
                setTipeado("");
              }}
              className={cn(
                "min-h-14 flex-1 font-semibold",
                modo === m ? "border-b-2 border-primary text-text" : "text-text-muted",
              )}
            >
              {m === "GRAMOS" ? "GRAMOS" : "IMPORTE"}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        {paso === "TIPEAR" && modo === "GRAMOS" ? (
          <>
            <div className="text-center">
              <p className="num text-6xl font-bold leading-none">{gramosTipeados} g</p>
            </div>
            <MontoGrande centavos={importeFinal} tamano="balanza" className="items-center text-center" />
          </>
        ) : null}

        {paso === "TIPEAR" && modo === "IMPORTE" ? (
          <>
            <div className="text-center">
              <p className="num text-5xl font-bold leading-none">{formatearPesos(importeTipeado)}</p>
            </div>
            <p className="text-center text-2xl font-semibold text-info">
              Pesá aprox. <span className="num">{formatearPeso(sugeridos)}</span>
            </p>
          </>
        ) : null}

        {paso === "CONFIRMAR_PESO" ? (
          <>
            <p className="text-center text-text-muted">¿Cuánto pesó?</p>
            <p className="num text-center text-6xl font-bold leading-none">
              {Number(pesoReal || 0)} g
            </p>
            <MontoGrande
              etiqueta="Precio real"
              centavos={importeFinal}
              tamano="grande"
              className="items-center text-center"
            />
          </>
        ) : null}

        <Numpad
          valor={paso === "CONFIRMAR_PESO" ? pesoReal : tipeado}
          onCambio={paso === "CONFIRMAR_PESO" ? setPesoReal : setTipeado}
          maxDigitos={6}
          atajos={
            paso === "TIPEAR" && modo === "GRAMOS" ? (
              <>
                {PESOS_FRECUENTES.map((g) => (
                  <Boton key={g} className="min-h-18" onClick={() => setTipeado(String(g))}>
                    {formatearPeso(g)}
                  </Boton>
                ))}
              </>
            ) : undefined
          }
        />
      </div>

      <footer className="border-t border-border p-3">
        {paso === "TIPEAR" && modo === "IMPORTE" ? (
          <Boton
            variante="primario"
            tamano="grande"
            ancho="completo"
            disabled={sugeridos <= 0 || importeTipeado <= 0}
            onClick={() => {
              // El paso 2 arranca precargado con el peso sugerido: si el corte
              // salió exacto, aceptar es un solo toque.
              setPesoReal(String(sugeridos));
              setPaso("CONFIRMAR_PESO");
            }}
          >
            PESAR
          </Boton>
        ) : (
          <Boton
            variante="primario"
            tamano="grande"
            ancho="completo"
            disabled={!puedeAgregar}
            onClick={agregar}
          >
            AGREGAR {formatearPesos(importeFinal)}
          </Boton>
        )}
      </footer>
    </div>
  );
}
