-- Órdenes de MercadoLibre capturadas desde el webhook orders_v2
-- Cada fila = un ítem dentro de una orden ML (una orden puede tener varios ítems)

CREATE TABLE IF NOT EXISTS public.ml_orders (
  id                     SERIAL PRIMARY KEY,
  business_id            INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,

  -- Identificadores ML
  ml_order_id            BIGINT  NOT NULL,
  pack_id                BIGINT,              -- pack de ML (puede ser = ml_order_id para órdenes simples)
  ml_item_id             VARCHAR(20),         -- ítem ML comprado (MLA123456)
  ml_variation_id        BIGINT,              -- variante ML si aplica

  -- Comprador
  buyer_id               BIGINT  NOT NULL,
  buyer_nickname         VARCHAR(100),

  -- Estado y montos
  status                 VARCHAR(50) NOT NULL DEFAULT 'paid',
  total_amount           DECIMAL(12,2),
  currency_id            VARCHAR(10)  NOT NULL DEFAULT 'ARS',
  quantity               INTEGER      NOT NULL DEFAULT 1,
  unit_price             DECIMAL(12,2),

  -- Vínculo ROIPOS
  product_variant_id     INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  sale_id                INTEGER,             -- si se creó venta manual en ROIPOS

  -- Estado de mensajes enviados
  msg_confirmation_sent  BOOLEAN NOT NULL DEFAULT FALSE,
  msg_dispatched_sent    BOOLEAN NOT NULL DEFAULT FALSE,

  -- Timestamps
  ml_date_created        TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (ml_order_id, ml_item_id, business_id)
);

CREATE INDEX IF NOT EXISTS ml_orders_business_idx   ON ml_orders (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ml_orders_pack_idx        ON ml_orders (pack_id);
CREATE INDEX IF NOT EXISTS ml_orders_status_idx      ON ml_orders (business_id, status);
