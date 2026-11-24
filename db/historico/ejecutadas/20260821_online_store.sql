-- ============================================================
-- Migración: Tienda Online v1
-- Fecha: 2026-08-21
-- Incluye: dimensiones productos/categorías, direcciones de envío,
--          correo_config, shipping_rates, online_orders, shipments,
--          settings por defecto.
-- ============================================================

-- 1. Dimensiones en products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_grams  int4         NULL,
  ADD COLUMN IF NOT EXISTS height_cm     numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS width_cm      numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS depth_cm      numeric(6,2) NULL;

-- 2. Dimensiones en categories (fallback nivel 2)
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS weight_grams  int4         NULL,
  ADD COLUMN IF NOT EXISTS height_cm     numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS width_cm      numeric(6,2) NULL,
  ADD COLUMN IF NOT EXISTS depth_cm      numeric(6,2) NULL;

-- 3. Direcciones de envío
CREATE TABLE IF NOT EXISTS shipping_addresses (
  id             serial4 PRIMARY KEY,
  customer_id    int4 REFERENCES customers(id) ON DELETE SET NULL,
  street_name    varchar(150) NOT NULL,
  street_number  varchar(20)  NOT NULL,
  floor          varchar(20),
  department     varchar(20),
  city_name      varchar(100) NOT NULL,
  state          varchar(1)   NOT NULL,  -- código PAQ.AR (1 letra)
  zip_code       varchar(12)  NOT NULL,
  observation    text,
  created_at     timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Configuración de carriers (api_key va en .env, no aquí)
CREATE TABLE IF NOT EXISTS correo_config (
  id           serial4 PRIMARY KEY,
  business_id  int4 NOT NULL REFERENCES business(id),
  carrier      varchar(30)  NOT NULL,      -- 'correo_argentino' | 'andreani'
  display_name varchar(100) NOT NULL,
  agreement    varchar(30)  NOT NULL DEFAULT '',  -- código de convenio
  environment  varchar(4)   NOT NULL DEFAULT 'test',
  active       bool         NOT NULL DEFAULT false,
  created_at   timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (business_id, carrier)
);

INSERT INTO correo_config (business_id, carrier, display_name, agreement, environment, active)
VALUES (1, 'correo_argentino', 'Correo Argentino', '', 'test', false)
ON CONFLICT (business_id, carrier) DO NOTHING;

-- 5. Tarifas de envío (por carrier y zona)
CREATE TABLE IF NOT EXISTS shipping_rates (
  id                serial4 PRIMARY KEY,
  correo_config_id  int4 NOT NULL REFERENCES correo_config(id),
  zone_name         varchar(80)  NOT NULL,
  state_codes       text[]       NOT NULL,   -- ej: '{C}' o '{K,H,U}'
  delivery_type     varchar(20)  NOT NULL,   -- 'homeDelivery' | 'agency' | 'locker'
  display_label     varchar(100) NOT NULL,
  price             numeric(12,2) NOT NULL,
  active            bool NOT NULL DEFAULT true
);

-- 6. Pedidos online
CREATE TABLE IF NOT EXISTS online_orders (
  id                   serial4 PRIMARY KEY,
  business_id          int4 NOT NULL DEFAULT 1,
  customer_id          int4 REFERENCES customers(id) ON DELETE SET NULL,
  buyer_name           varchar(150) NOT NULL,
  buyer_phone          varchar(30)  NOT NULL,
  buyer_email          varchar(150),
  delivery_type        varchar(20) NOT NULL,
  shipping_address_id  int4 REFERENCES shipping_addresses(id) ON DELETE SET NULL,
  agency_id            varchar(20),
  shipping_rate_id     int4 REFERENCES shipping_rates(id) ON DELETE SET NULL,
  subtotal             numeric(12,2) NOT NULL,
  shipping_cost        numeric(12,2) NOT NULL DEFAULT 0,
  total                numeric(12,2) NOT NULL,
  status               varchar(30) NOT NULL DEFAULT 'pending',
  sale_id              int4 REFERENCES sales(id) ON DELETE SET NULL,
  notes                text,
  created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_online_orders_business_status
  ON online_orders(business_id, status);

CREATE TABLE IF NOT EXISTS online_order_items (
  id                  serial4 PRIMARY KEY,
  online_order_id     int4 NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  product_variant_id  int4 NOT NULL REFERENCES product_variants(id),
  unit_price          numeric(12,2) NOT NULL,
  product_name        varchar(150) NOT NULL,
  variant_sku         varchar(100) NOT NULL,
  variant_color       varchar(50)  NOT NULL,
  variant_size        varchar(50)  NOT NULL
);

-- 7. Envíos (1 por pedido confirmado con carrier)
CREATE TABLE IF NOT EXISTS shipments (
  id                   serial4 PRIMARY KEY,
  online_order_id      int4 NOT NULL REFERENCES online_orders(id),
  business_id          int4 NOT NULL DEFAULT 1,
  correo_config_id     int4 REFERENCES correo_config(id),
  environment          varchar(4)    NOT NULL DEFAULT 'test',
  delivery_type        varchar(20)   NOT NULL,
  agency_id            varchar(20),
  shipping_address_id  int4 REFERENCES shipping_addresses(id),
  tracking_number      varchar(30) UNIQUE,
  weight_grams         int4          NOT NULL,
  height_cm            numeric(6,2)  NOT NULL,
  width_cm             numeric(6,2)  NOT NULL,
  depth_cm             numeric(6,2)  NOT NULL,
  declared_value       numeric(12,2) NOT NULL,
  status               varchar(30) NOT NULL DEFAULT 'created',
  last_tracking_event  jsonb,
  error_detail         text,
  created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 8. Settings de dimensiones por defecto (fallback nivel 3)
INSERT INTO settings (key, value, business_id) VALUES
  ('shipping_default_weight_grams', '500', 1),
  ('shipping_default_height_cm',    '5',   1),
  ('shipping_default_width_cm',     '30',  1),
  ('shipping_default_depth_cm',     '20',  1)
ON CONFLICT (key, business_id) DO NOTHING;
