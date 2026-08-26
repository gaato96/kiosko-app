"use client";

/**
 * <AltaExpress> — crear un producto sin salir del cobro.
 *
 * Si el buscador no encuentra nada, la alternativa real no es "cargalo después
 * desde el admin": es que el empleado lo anote en un papel y el sistema empiece
 * a mentir. Por eso esto son dos campos y sigue vendiendo.
 *
 * Se escribe primero en Dexie. El upsert al servidor va cuando haya red.
 */

import { useState } from "react";
import { uuidv7 } from "uuidv7";
import { Boton } from "@/components/ui/boton";
import { Campo, Input, Select } from "@/components/ui/campo";
import { db } from "@/lib/db/schema";
import { refrescarIndice } from "@/lib/pos/buscar";
import { parsearPesos } from "@/lib/money";
import type { Categoria, Producto, TipoVenta } from "@/lib/tipos";

export function AltaExpress({
  nombreInicial,
  comercioId,
  categorias,
  onCreado,
  onCancelar,
}: {
  nombreInicial: string;
  comercioId: string;
  categorias: Categoria[];
  onCreado: (p: Producto) => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [precio, setPrecio] = useState("");
  const [tipoVenta, setTipoVenta] = useState<TipoVenta>("UNIDAD");
  const [categoriaId, setCategoriaId] = useState<string>(categorias[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    const centavos = parsearPesos(precio);

    if (!nombre.trim()) return setError("Poné un nombre.");
    if (centavos === null || centavos <= 0) return setError("Poné el precio.");

    const producto: Producto = {
      id: uuidv7(),
      comercio_id: comercioId,
      categoria_id: categoriaId || null,
      proveedor_id: null,
      nombre: nombre.trim(),
      nombre_norm: nombre
        .trim()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase(),
      alias: [],
      descripcion: null,
      codigo_barras: null,
      tipo_producto: "FISICO",
      tipo_venta: tipoVenta,
      precio_venta_centavos: tipoVenta === "UNIDAD" ? centavos : null,
      precio_por_kg_centavos: tipoVenta === "PESO" ? centavos : null,
      precio_oferta_centavos: null,
      oferta_hasta: null,
      precio_costo_centavos: null,
      // Un producto creado al vuelo no controla stock: nadie hizo el conteo.
      // El dueño lo activa después desde el admin, cuando tenga el dato real.
      controla_stock: false,
      stock_actual: 0,
      stock_minimo: 0,
      factor_compra: 1,
      unidad_compra: "Unidad",
      vence: false,
      fecha_vencimiento: null,
      comision_pct: null,
      comision_fija_centavos: null,
      visible_en_vidriera: false,
      color: null,
      emoji: null,
      imagen_url: null,
      activo: true,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    };

    await db().productos.put(producto);
    await refrescarIndice();
    onCreado(producto);

    // El servidor puede esperar: el mostrador no.
    // Import dinámico para no meter el cliente de Supabase en el bundle del POS.
    if (navigator.onLine) {
      void import("@/lib/supabase/browser").then(({ supabaseBrowser }) =>
        supabaseBrowser().from("productos").insert({
          id: producto.id,
          comercio_id: comercioId,
          categoria_id: producto.categoria_id,
          nombre: producto.nombre,
          tipo_venta: producto.tipo_venta,
          precio_venta_centavos: producto.precio_venta_centavos,
          precio_por_kg_centavos: producto.precio_por_kg_centavos,
          controla_stock: false,
          visible_en_vidriera: false,
        }),
      );
    }
  }

  return (
    <form onSubmit={crear} className="flex flex-col gap-4 p-4">
      <p className="text-text-muted">
        Se crea con lo mínimo para poder cobrarlo. El resto lo completás después.
      </p>

      <Campo etiqueta="Nombre">
        <Input value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus required />
      </Campo>

      <Campo etiqueta={tipoVenta === "PESO" ? "Precio por kilo" : "Precio"}>
        <Input
          inputMode="numeric"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          placeholder="1200"
          required
        />
      </Campo>

      <Campo etiqueta="Cómo se vende">
        <Select value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value as TipoVenta)}>
          <option value="UNIDAD">Por unidad</option>
          <option value="PESO">Por peso</option>
        </Select>
      </Campo>

      {categorias.length > 0 ? (
        <Campo etiqueta="Categoría">
          <Select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)}>
            <option value="">Sin categoría</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Campo>
      ) : null}

      {error ? <p className="text-sm text-danger">{error}</p> : null}

      <div className="flex gap-2">
        <Boton variante="fantasma" ancho="completo" type="button" onClick={onCancelar}>
          Cancelar
        </Boton>
        <Boton variante="primario" tamano="grande" ancho="completo" type="submit">
          Crear y agregar
        </Boton>
      </div>
    </form>
  );
}
