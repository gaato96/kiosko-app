/**
 * lib/tipos.ts — el dominio, tipado.
 *
 * Los tipos que espejan la base mantienen los nombres en español y snake_case,
 * como manda CLAUDE.md. Todos los importes en centavos, todos los pesos en gramos.
 */

export type Rol = "dueno" | "empleado";
export type TipoProducto = "FISICO" | "SERVICIO" | "COMBO";
export type TipoVenta = "UNIDAD" | "PESO";

export type MotivoStock =
  | "VENTA"
  | "COMPRA"
  | "AJUSTE"
  | "MERMA"
  | "ROTURA"
  | "VENCIMIENTO"
  | "CONSUMO_INTERNO"
  | "DEVOLUCION"
  | "CARGA_INICIAL"
  | "ANULACION";

export const MOTIVOS_AJUSTE: Array<{ valor: MotivoStock; etiqueta: string; signo: -1 | 1 | 0 }> = [
  { valor: "AJUSTE", etiqueta: "Ajuste de conteo", signo: 0 },
  { valor: "MERMA", etiqueta: "Merma", signo: -1 },
  { valor: "ROTURA", etiqueta: "Rotura", signo: -1 },
  { valor: "VENCIMIENTO", etiqueta: "Vencimiento", signo: -1 },
  { valor: "CONSUMO_INTERNO", etiqueta: "Consumo interno", signo: -1 },
  { valor: "DEVOLUCION", etiqueta: "Devolución", signo: 1 },
  { valor: "CARGA_INICIAL", etiqueta: "Carga inicial", signo: 1 },
];

export type MedioPago = "EFECTIVO" | "TRANSFERENCIA" | "DEBITO" | "CREDITO" | "QR" | "FIADO";

export const MEDIOS_PAGO: Array<{ valor: MedioPago; etiqueta: string }> = [
  { valor: "EFECTIVO", etiqueta: "Efectivo" },
  { valor: "TRANSFERENCIA", etiqueta: "Transferencia" },
  { valor: "DEBITO", etiqueta: "Débito" },
  { valor: "CREDITO", etiqueta: "Crédito" },
  { valor: "QR", etiqueta: "QR" },
  { valor: "FIADO", etiqueta: "Fiado" },
];

export type EstadoVenta = "COMPLETADA" | "ANULADA";
export type OrigenVenta = "POS" | "VIDRIERA";
export type TipoCC = "CARGO" | "PAGO" | "AJUSTE";
export type TipoCajaMov = "INGRESO" | "EGRESO";
export type EstadoCaja = "ABIERTA" | "CERRADA";
export type EstadoPedido = "NUEVO" | "ACEPTADO" | "PREPARANDO" | "ENTREGADO" | "RECHAZADO";
export type TipoEntrega = "RETIRO" | "ENVIO";

export type Comercio = {
  id: string;
  nombre: string;
  slug: string;
  telefono_whatsapp: string | null;
  direccion: string | null;
  logo_url: string | null;
  vidriera_activa: boolean;
  activo: boolean;
}

export type ConfigComercio = {
  comercio_id: string;
  redondeo_centavos: number;
  margen_objetivo_pct: number;
  permite_stock_negativo: boolean;
  dias_alerta_vencimiento: number;
  vidriera_titulo: string | null;
  vidriera_mensaje: string | null;
  vidriera_horarios: Record<string, [string, string]> | null;
  monto_minimo_envio_centavos: number;
  mostrar_sin_stock: boolean;
}

export type UsuarioComercio = {
  id: string;
  comercio_id: string;
  nombre: string;
  rol: Rol;
  activo: boolean;
}

export type Categoria = {
  id: string;
  comercio_id: string;
  nombre: string;
  color: string;
  emoji: string | null;
  orden: number;
  activo: boolean;
  actualizado_en: string;
}

export type Proveedor = {
  id: string;
  comercio_id: string;
  nombre: string;
  telefono: string | null;
  contacto: string | null;
  dias_visita: string[] | null;
  notas: string | null;
  activo: boolean;
  actualizado_en: string;
}

export type Producto = {
  id: string;
  comercio_id: string;
  categoria_id: string | null;
  proveedor_id: string | null;

  nombre: string;
  nombre_norm: string;
  alias: string[];
  descripcion: string | null;
  codigo_barras: string | null;

  tipo_producto: TipoProducto;
  tipo_venta: TipoVenta;

  /** Solo si tipo_venta = UNIDAD. */
  precio_venta_centavos: number | null;
  /** Solo si tipo_venta = PESO. */
  precio_por_kg_centavos: number | null;
  /** Solo lo ve el dueño. Puede llegar como null si lo filtró la política. */
  precio_costo_centavos: number | null;

  controla_stock: boolean;
  /** Unidades si UNIDAD, gramos si PESO. */
  stock_actual: number;
  stock_minimo: number;

  factor_compra: number;
  unidad_compra: string | null;

  vence: boolean;
  fecha_vencimiento: string | null;

  comision_pct: number | null;
  comision_fija_centavos: number | null;

  visible_en_vidriera: boolean;
  color: string | null;
  emoji: string | null;
  imagen_url: string | null;

  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export type Cliente = {
  id: string;
  comercio_id: string;
  nombre: string;
  telefono: string | null;
  direccion: string | null;
  limite_credito_centavos: number;
  saldo_centavos: number;
  notas: string | null;
  activo: boolean;
  actualizado_en: string;
}

export type VentaItem = {
  id: string;
  venta_id: string;
  producto_id: string | null;
  descripcion: string;
  tipo_venta: TipoVenta;
  /** Unidades o GRAMOS. */
  cantidad: number;
  /** Por unidad o por KILO, congelado al momento de la venta. */
  precio_unitario_centavos: number;
  costo_unitario_centavos: number;
  total_centavos: number;
}

export type VentaPago = {
  id: string;
  venta_id: string;
  medio: MedioPago;
  monto_centavos: number;
  recibido_centavos: number | null;
  vuelto_centavos: number | null;
  referencia: string | null;
}

export type Venta = {
  id: string;
  comercio_id: string;
  numero: number | null;
  usuario_id: string | null;
  dispositivo_id: string | null;
  caja_sesion_id: string | null;
  cliente_id: string | null;

  subtotal_centavos: number;
  descuento_centavos: number;
  total_centavos: number;
  costo_total_centavos: number;

  estado: EstadoVenta;
  origen: OrigenVenta;

  anulada_por: string | null;
  anulada_en: string | null;
  motivo_anulacion: string | null;

  /** Reloj del dispositivo: es cuando se cobró de verdad. */
  creado_en: string;
  /** Cuándo llegó al servidor. Puede ser horas después si se vendió offline. */
  sincronizado_en?: string;
}

/** Venta completa tal como viaja al servidor y como vive en Dexie. */
export type VentaCompleta = Venta & {
  items: VentaItem[];
  pagos: VentaPago[];
}

export type MovimientoStock = {
  id: string;
  comercio_id: string;
  producto_id: string;
  delta: number;
  motivo: MotivoStock;
  referencia_id: string | null;
  nota: string | null;
  usuario_id: string | null;
  creado_en: string;
}

export type CajaSesion = {
  id: string;
  comercio_id: string;
  dispositivo_id: string | null;
  usuario_id: string | null;
  fondo_inicial_centavos: number;
  estado: EstadoCaja;
  abierta_en: string;
  cerrada_en: string | null;
}

export type CajaMovimiento = {
  id: string;
  comercio_id: string;
  caja_sesion_id: string;
  tipo: TipoCajaMov;
  motivo: string;
  monto_centavos: number;
  usuario_id: string | null;
  creado_en: string;
}

export type TeclaRapida = {
  id: string;
  comercio_id: string;
  producto_id: string;
  orden: number;
}

export type ZonaEnvio = {
  id: string;
  comercio_id: string;
  nombre: string;
  costo_centavos: number;
  monto_minimo_centavos: number;
  activo: boolean;
}

export type PedidoItem = {
  id: string;
  pedido_id: string;
  producto_id: string | null;
  descripcion: string;
  tipo_venta: TipoVenta;
  cantidad: number;
  precio_unitario_centavos: number;
  total_centavos: number;
}

export type PedidoVidriera = {
  id: string;
  comercio_id: string;
  numero: number | null;
  nombre_cliente: string;
  telefono: string;
  direccion: string | null;
  tipo_entrega: TipoEntrega;
  zona_id: string | null;
  costo_envio_centavos: number;
  total_centavos: number;
  notas: string | null;
  estado: EstadoPedido;
  venta_id: string | null;
  acepta_promos: boolean;
  creado_en: string;
}

/** Producto tal como lo ve la Vidriera pública: sin costo, sin stock exacto. */
export type ProductoVidriera = {
  id: string;
  comercio_id: string;
  nombre: string;
  descripcion: string | null;
  categoria_id: string | null;
  tipo_venta: TipoVenta;
  precio_venta_centavos: number | null;
  precio_por_kg_centavos: number | null;
  imagen_url: string | null;
  emoji: string | null;
  color: string | null;
  disponible: boolean;
}
