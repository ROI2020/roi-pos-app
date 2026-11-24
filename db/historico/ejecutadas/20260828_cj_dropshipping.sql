-- ============================================================
-- Migración: CJ Dropshipping — Fase 6
-- Fecha: 2026-08-28
-- ============================================================

-- 1. CJ Dropshipping IDs en productos y variantes
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cj_pid         varchar(50)  NULL,   -- CJ product ID (padre)
  ADD COLUMN IF NOT EXISTS cj_last_sync   timestamp    NULL;   -- último sync de precio/stock

ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS cj_vid         varchar(50)  NULL;   -- CJ variant ID

CREATE INDEX IF NOT EXISTS idx_products_cj_pid
  ON products(cj_pid) WHERE cj_pid IS NOT NULL;

-- 2. Columnas de fulfillment y tracking en online_orders
ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS cj_order_id        varchar(80)  NULL,   -- ID orden en CJ
  ADD COLUMN IF NOT EXISTS cj_order_num       varchar(80)  NULL,   -- número orden en CJ
  ADD COLUMN IF NOT EXISTS cj_tracking_no     varchar(80)  NULL,   -- número de seguimiento
  ADD COLUMN IF NOT EXISTS cj_tracking_url    text         NULL,   -- URL de tracking
  ADD COLUMN IF NOT EXISTS fulfillment_status varchar(30)  NULL;   -- pending|submitted|shipped|delivered

-- 3. Cantidad en ítems de pedidos online (faltaba)
ALTER TABLE online_order_items
  ADD COLUMN IF NOT EXISTS quantity int4 NOT NULL DEFAULT 1;

-- 4. País en direcciones de envío (soporte multi-tenant AR/US)
ALTER TABLE shipping_addresses
  ADD COLUMN IF NOT EXISTS country_code varchar(2) NOT NULL DEFAULT 'AR';

-- Ampliar state para códigos de estado USA (CA, NY, etc.)
ALTER TABLE shipping_addresses
  ALTER COLUMN state TYPE varchar(10);

-- 5. Log de sincronizaciones CJ
CREATE TABLE IF NOT EXISTS cj_sync_log (
  id           serial4 PRIMARY KEY,
  business_id  int4         NOT NULL REFERENCES business(id),
  sync_type    varchar(30)  NOT NULL,   -- 'import'|'price_stock'|'tracking'|'fulfill'
  product_id   int4         REFERENCES products(id) ON DELETE SET NULL,
  order_id     int4         REFERENCES online_orders(id) ON DELETE SET NULL,
  status       varchar(20)  NOT NULL DEFAULT 'ok',   -- 'ok'|'error'
  detail       jsonb,
  created_at   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cj_sync_log_business
  ON cj_sync_log(business_id, created_at DESC);

-- 6. Settings de CJ por negocio (se insertan desde la UI de admin)
-- Claves esperadas en la tabla settings:
--   cj_enabled    = 'true' | 'false'         (is_secret=false)
--   cj_api_email  = 'cuenta@email.com'        (is_secret=false)
--   cj_api_key    = 'xxxxxxxx'                (is_secret=true)
--   cj_auto_fulfill = 'true' | 'false'        (is_secret=false)
-- (Se cargan desde Admin → Configuración → Dropshipping CJ)
