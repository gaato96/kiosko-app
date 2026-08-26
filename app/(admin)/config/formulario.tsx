"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Boton } from "@/components/ui/boton";
import { Campo, Input, Select } from "@/components/ui/campo";
import { ETIQUETAS_REDONDEO, UNIDADES_REDONDEO, formatearPesos, redondear } from "@/lib/money";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Comercio, ConfigComercio, ZonaEnvio } from "@/lib/tipos";

export function FormularioConfig({
  comercio,
  config,
  zonas,
}: {
  comercio: Comercio;
  config: ConfigComercio;
  zonas: ZonaEnvio[];
}) {
  const router = useRouter();

  const [nombre, setNombre] = useState(comercio.nombre);
  const [telefono, setTelefono] = useState(comercio.telefono_whatsapp ?? "");
  const [direccion, setDireccion] = useState(comercio.direccion ?? "");
  const [vidrieraActiva, setVidrieraActiva] = useState(comercio.vidriera_activa);

  const [redondeoCentavos, setRedondeoCentavos] = useState(String(config.redondeo_centavos));
  const [margen, setMargen] = useState(String(config.margen_objetivo_pct));
  const [mensajeVidriera, setMensajeVidriera] = useState(config.vidriera_mensaje ?? "");
  const [mostrarSinStock, setMostrarSinStock] = useState(config.mostrar_sin_stock);

  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  // Ejemplo en vivo del redondeo elegido: es más claro que cualquier explicación.
  const ejemplo = redondear(437, Number(redondeoCentavos)) * 100;

  async function guardar() {
    setGuardando(true);
    setAviso(null);

    const sb = supabaseBrowser();
    const [{ error: e1 }, { error: e2 }] = await Promise.all([
      sb
        .from("comercios")
        .update({
          nombre: nombre.trim(),
          telefono_whatsapp: telefono.replace(/\D/g, "") || null,
          direccion: direccion.trim() || null,
          vidriera_activa: vidrieraActiva,
        })
        .eq("id", comercio.id),
      sb
        .from("config_comercio")
        .update({
          redondeo_centavos: Number(redondeoCentavos),
          margen_objetivo_pct: Number(margen.replace(",", ".")),
          vidriera_mensaje: mensajeVidriera.trim() || null,
          mostrar_sin_stock: mostrarSinStock,
        })
        .eq("comercio_id", comercio.id),
    ]);

    setGuardando(false);
    if (e1 || e2) return setAviso((e1 ?? e2)!.message);
    setAviso("Guardado.");
    router.refresh();
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 tarjeta p-5">
        <h2 className="font-semibold">El kiosco</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo etiqueta="Nombre">
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </Campo>

          <Campo etiqueta="WhatsApp" ayuda="Por acá llegan los pedidos de la Vidriera.">
            <Input
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="11 2233 4455"
            />
          </Campo>

          <Campo etiqueta="Dirección" className="sm:col-span-2">
            <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
          </Campo>
        </div>
      </div>

      <div className="flex flex-col gap-4 tarjeta p-5">
        <h2 className="font-semibold">Plata</h2>

        <div className="grid gap-4 sm:grid-cols-2">
          <Campo
            etiqueta="Redondeo de precios"
            ayuda={`En Argentina las monedas no circulan. Ejemplo: $4,37 queda en ${formatearPesos(ejemplo)}.`}
          >
            <Select value={redondeoCentavos} onChange={(e) => setRedondeoCentavos(e.target.value)}>
              {UNIDADES_REDONDEO.map((u) => (
                <option key={u} value={u}>
                  {ETIQUETAS_REDONDEO[u]}
                </option>
              ))}
            </Select>
          </Campo>

          <Campo
            etiqueta="Margen objetivo (%)"
            ayuda="Se usa para sugerir el precio de venta cuando cargás un costo."
          >
            <Input inputMode="decimal" value={margen} onChange={(e) => setMargen(e.target.value)} />
          </Campo>
        </div>
      </div>

      <div className="flex flex-col gap-4 tarjeta p-5">
        <h2 className="font-semibold">Vidriera</h2>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={vidrieraActiva}
            onChange={(e) => setVidrieraActiva(e.target.checked)}
            className="h-6 w-6 accent-[var(--primary)]"
          />
          <span>
            Vidriera prendida
            <span className="block text-sm text-text-muted">
              Apagada, el link público deja de funcionar.
            </span>
          </span>
        </label>

        <Campo etiqueta="Mensaje de bienvenida">
          <Input
            value={mensajeVidriera}
            onChange={(e) => setMensajeVidriera(e.target.value)}
            placeholder="Pedí por acá y te lo mandamos. Abierto de 7 a 23."
          />
        </Campo>

        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={mostrarSinStock}
            onChange={(e) => setMostrarSinStock(e.target.checked)}
            className="h-6 w-6 accent-[var(--primary)]"
          />
          <span>
            Mostrar productos sin stock
            <span className="block text-sm text-text-muted">
              En gris y sin botón. Sirve para que el cliente sepa que lo tenés habitualmente.
            </span>
          </span>
        </label>

        {zonas.length > 0 ? (
          <div>
            <p className="mb-2 text-sm font-medium">Zonas de envío</p>
            <ul className="flex flex-col gap-1 text-sm">
              {zonas.map((z) => (
                <li key={z.id} className="flex justify-between gap-2">
                  <span>{z.nombre}</span>
                  <span className="num text-text-muted">
                    {formatearPesos(z.costo_centavos)} · mínimo{" "}
                    {formatearPesos(z.monto_minimo_centavos)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {aviso ? (
        <p className="tarjeta p-4">{aviso}</p>
      ) : null}

      <Boton variante="primario" tamano="grande" disabled={guardando} onClick={guardar}>
        <Check size={20} /> Guardar
      </Boton>
    </section>
  );
}
