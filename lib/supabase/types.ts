/**
 * lib/supabase/types.ts — el contrato de la base para el cliente tipado.
 *
 * Se mantiene a mano a partir de `supabase/schema.sql` y de `lib/tipos.ts`
 * (los tipos del dominio ya espejan las columnas). Cuando exista el proyecto de
 * Supabase se puede regenerar con:
 *
 *   npx supabase gen types typescript --project-id <ref> > lib/supabase/types.ts
 *
 * mientras tanto esto evita el `any` sin bloquear la construcción.
 */

import type {
  CajaMovimiento,
  CajaSesion,
  Categoria,
  Cliente,
  Comercio,
  ConfigComercio,
  MovimientoStock,
  PedidoItem,
  PedidoVidriera,
  Producto,
  ProductoVidriera,
  Proveedor,
  TeclaRapida,
  UsuarioComercio,
  Venta,
  VentaItem,
  VentaPago,
  ZonaEnvio,
} from "@/lib/tipos";

/** Tabla estándar: lo que se lee, lo que se inserta y lo que se actualiza. */
type Tabla<Row, Requeridos extends keyof Row = never> = {
  Row: Row;
  Insert: Partial<Row> & Pick<Row, Requeridos>;
  Update: Partial<Row>;
  Relationships: [];
};

type Vista<Row> = { Row: Row; Relationships: [] };

export type CatalogoBase = {
  id: string;
  nombre: string;
  marca: string | null;
  presentacion: string | null;
  categoria_sugerida: string;
  tipo_venta: "UNIDAD" | "PESO";
  codigo_barras: string | null;
  alias: string[];
  popularidad: number;
}

export type ProductoAReponer = {
  id: string;
  comercio_id: string;
  nombre: string;
  tipo_venta: "UNIDAD" | "PESO";
  stock_actual: number;
  stock_minimo: number;
  faltante: number;
  factor_compra: number;
  unidad_compra: string | null;
  proveedor_id: string | null;
  proveedor_nombre: string | null;
  proveedor_telefono: string | null;
}

export type Arqueo = {
  id: string;
  comercio_id: string;
  caja_sesion_id: string;
  declarado_centavos: number;
  desglose: Record<string, number> | null;
  esperado_centavos: number;
  diferencia_centavos: number;
  declarado_por: string | null;
  declarado_en: string;
  revisado_por: string | null;
  revisado_en: string | null;
  nota_revision: string | null;
}

export type Gasto = {
  id: string;
  comercio_id: string;
  categoria: string;
  descripcion: string | null;
  monto_centavos: number;
  fecha: string;
  recurrente: boolean;
  usuario_id: string | null;
  creado_en: string;
}

export type CuentaCorrienteMovimiento = {
  id: string;
  comercio_id: string;
  cliente_id: string;
  tipo: "CARGO" | "PAGO" | "AJUSTE";
  monto_centavos: number;
  venta_id: string | null;
  medio: string | null;
  nota: string | null;
  usuario_id: string | null;
  creado_en: string;
}

export type Auditoria = {
  id: string;
  comercio_id: string;
  usuario_id: string | null;
  entidad: string;
  entidad_id: string | null;
  accion: string;
  datos_antes: unknown;
  datos_despues: unknown;
  creado_en: string;
}

export type PrecioHistorial = {
  id: string;
  comercio_id: string;
  producto_id: string;
  precio_anterior_centavos: number | null;
  precio_nuevo_centavos: number | null;
  costo_anterior_centavos: number | null;
  costo_nuevo_centavos: number | null;
  motivo: string | null;
  lote_id: string | null;
  usuario_id: string | null;
  creado_en: string;
}

export type Compra = {
  id: string;
  comercio_id: string;
  proveedor_id: string | null;
  total_centavos: number;
  nota: string | null;
  usuario_id: string | null;
  creado_en: string;
}

export type CompraItem = {
  id: string;
  compra_id: string;
  producto_id: string;
  cantidad_compra: number;
  delta_stock: number;
  costo_unitario_centavos: number;
}

export type Dispositivo = {
  id: string;
  comercio_id: string;
  nombre: string;
  ultimo_uso: string | null;
  creado_en: string;
}

export type Database = {
  public: {
    Tables: {
      comercios: Tabla<Comercio, "nombre" | "slug">;
      config_comercio: Tabla<ConfigComercio, "comercio_id">;
      usuarios_comercio: Tabla<UsuarioComercio, "id" | "comercio_id" | "nombre">;
      dispositivos: Tabla<Dispositivo, "id" | "comercio_id">;
      categorias: Tabla<Categoria, "comercio_id" | "nombre">;
      proveedores: Tabla<Proveedor, "comercio_id" | "nombre">;
      productos: Tabla<Producto, "comercio_id" | "nombre">;
      precios_historial: Tabla<PrecioHistorial, "comercio_id" | "producto_id">;
      teclas_rapidas: Tabla<TeclaRapida, "comercio_id" | "producto_id">;
      catalogo_base: Tabla<CatalogoBase, "nombre" | "categoria_sugerida">;
      movimientos_stock: Tabla<MovimientoStock, "comercio_id" | "producto_id" | "delta" | "motivo">;
      compras: Tabla<Compra, "comercio_id">;
      compras_items: Tabla<CompraItem, "compra_id" | "producto_id" | "cantidad_compra" | "delta_stock">;
      clientes: Tabla<Cliente, "comercio_id" | "nombre">;
      ventas: Tabla<Venta, "id" | "comercio_id" | "creado_en">;
      ventas_items: Tabla<VentaItem, "id" | "venta_id" | "descripcion" | "cantidad">;
      ventas_pagos: Tabla<VentaPago, "id" | "venta_id" | "medio" | "monto_centavos">;
      cuenta_corriente_movimientos: Tabla<
        CuentaCorrienteMovimiento,
        "comercio_id" | "cliente_id" | "tipo" | "monto_centavos"
      >;
      caja_sesiones: Tabla<CajaSesion, "comercio_id">;
      caja_movimientos: Tabla<CajaMovimiento, "comercio_id" | "caja_sesion_id" | "tipo" | "motivo" | "monto_centavos">;
      arqueos: Tabla<Arqueo, "comercio_id" | "caja_sesion_id" | "declarado_centavos">;
      gastos: Tabla<Gasto, "comercio_id" | "categoria" | "monto_centavos">;
      zonas_envio: Tabla<ZonaEnvio, "comercio_id" | "nombre">;
      pedidos_vidriera: Tabla<PedidoVidriera, "comercio_id" | "nombre_cliente" | "telefono">;
      pedidos_items: Tabla<PedidoItem, "pedido_id" | "descripcion" | "cantidad">;
      auditoria: Tabla<Auditoria, "comercio_id" | "entidad" | "accion">;
    };
    Views: {
      vidriera_productos: Vista<ProductoVidriera>;
      productos_a_reponer: Vista<ProductoAReponer>;
      /** Costos y comisiones: la vista solo devuelve filas si el rol es dueño. */
      productos_costos: Vista<{
        id: string;
        comercio_id: string;
        precio_costo_centavos: number | null;
        comision_pct: number | null;
        comision_fija_centavos: number | null;
      }>;
      ventas_costos: Vista<{ id: string; comercio_id: string; costo_total_centavos: number }>;
      usuarios_pos: Vista<{
        id: string;
        comercio_id: string;
        nombre: string;
        rol: "dueno" | "empleado";
        activo: boolean;
      }>;
    };
    Functions: {
      /** Todas las RPC del outbox reciben un único `payload jsonb` y son idempotentes por id. */
      sync_venta: { Args: { payload: unknown }; Returns: unknown };
      anular_venta: { Args: { payload: unknown }; Returns: unknown };
      registrar_cobro_cc: { Args: { payload: unknown }; Returns: unknown };
      aplicar_compra: { Args: { payload: unknown }; Returns: unknown };
      registrar_ajuste_stock: { Args: { payload: unknown }; Returns: unknown };
      abrir_caja: { Args: { payload: unknown }; Returns: unknown };
      registrar_movimiento_caja: { Args: { payload: unknown }; Returns: unknown };
      cerrar_caja: { Args: { payload: unknown }; Returns: unknown };

      /** Operaciones que necesitan conexión sí o sí. */
      validar_pin: { Args: { p_usuario_id: string; p_pin: string }; Returns: boolean };
      validar_pin_dueno: { Args: { p_usuario_id: string; p_pin: string }; Returns: boolean };
      autorizar_accion: {
        Args: { p_usuario_id: string; p_pin: string; p_accion: string; p_detalle?: unknown };
        Returns: string;
      };
      definir_pin: { Args: { p_usuario_id: string; p_pin: string }; Returns: boolean };
      /** Solo service_role: se usa en el alta de un comercio nuevo. */
      definir_pin_admin: { Args: { p_usuario_id: string; p_pin: string }; Returns: boolean };
      actualizar_precios_masivo: { Args: { payload: unknown }; Returns: unknown };
      deshacer_lote_precios: { Args: { p_lote_id: string }; Returns: number };
      importar_catalogo_base: { Args: { payload: unknown }; Returns: number };
      crear_pedido_vidriera: { Args: { payload: unknown }; Returns: unknown };
      resumen_dia: { Args: { p_fecha: string }; Returns: unknown };
      ventas_por_hora: { Args: { p_desde: string; p_hasta: string }; Returns: unknown };
      rentabilidad_productos: { Args: { p_desde: string; p_hasta: string; p_limite: number }; Returns: unknown };
      productos_muertos: { Args: { p_dias: number }; Returns: unknown };
      diferencias_por_empleado: { Args: { p_desde: string; p_hasta: string }; Returns: unknown };
      mas_vendidos: {
        Args: { p_comercio: string; p_dias?: number; p_limite?: number };
        Returns: Array<{ producto_id: string; unidades: number }>;
      };
      /** Quién vendió, por operador (el que entró con PIN). Migración 003. */
      ventas_por_operador: {
        Args: { p_desde: string; p_hasta: string };
        Returns: Array<{
          usuario_id: string | null;
          nombre: string;
          rol: string;
          tickets: number;
          total_centavos: number;
          efectivo_centavos: number;
          ticket_promedio_centavos: number;
          anuladas: number;
        }>;
      };
      /** La atiende el mostrador, no solo el dueño. Ver migración 002. */
      cambiar_estado_pedido: {
        Args: { p_pedido_id: string; p_estado: string };
        Returns: { id: string; estado: string; sin_cambios?: boolean };
      };
      convertir_pedido_en_venta: {
        Args: { p_pedido_id: string };
        Returns: { venta_id: string; numero?: number; duplicada?: boolean };
      };
      guardar_producto: {
        Args: { payload: Record<string, unknown> };
        Returns: { id: string; alta: boolean };
      };
      archivar_producto: { Args: { p_id: string }; Returns: null };
      guardar_categoria: { Args: { payload: Record<string, unknown> }; Returns: { id: string } };
      archivar_categoria: {
        Args: { p_id: string };
        Returns: { id: string; productos_sueltos: number };
      };
    };
    Enums: {
      rol_usuario: "dueno" | "empleado";
      tipo_producto: "FISICO" | "SERVICIO" | "COMBO";
      tipo_venta: "UNIDAD" | "PESO";
      medio_pago: "EFECTIVO" | "TRANSFERENCIA" | "DEBITO" | "CREDITO" | "QR" | "FIADO";
      estado_venta: "COMPLETADA" | "ANULADA";
      estado_caja: "ABIERTA" | "CERRADA";
      estado_pedido: "NUEVO" | "ACEPTADO" | "PREPARANDO" | "ENTREGADO" | "RECHAZADO";
      tipo_entrega: "RETIRO" | "ENVIO";
    };
    CompositeTypes: Record<string, never>;
  };
}
