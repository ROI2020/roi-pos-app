-- ============================================================
-- ROI-POS — Schema completo para Supabase
-- Idempotente: se puede correr N veces sin error
-- ============================================================

-- Extension uuid (ya viene en Supabase, por las dudas)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── 1. Tablas de lookup ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS categories (
  id         serial4      PRIMARY KEY,
  name       varchar(100) NOT NULL,
  created_at timestamp    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT categories_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id           serial4      PRIMARY KEY,
  company_name varchar(150) NOT NULL,
  cuit         varchar(15)  NULL,
  phone        varchar(50)  NULL,
  created_at   timestamp    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT suppliers_cuit_key UNIQUE (cuit),
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS age_groups (
  id   serial4     PRIMARY KEY,
  name varchar(50) NOT NULL,
  CONSTRAINT age_groups_name_key UNIQUE (name)
);
INSERT INTO age_groups (name) VALUES ('Bebés'), ('Niños')
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS seasons (
  id   serial4     PRIMARY KEY,
  name varchar(50) NOT NULL,
  CONSTRAINT seasons_name_key UNIQUE (name)
);
INSERT INTO seasons (name) VALUES
  ('Verano'), ('Invierno'), ('Todo el año'), ('Escolar'), ('Navidad')
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS genders (
  id   serial4     PRIMARY KEY,
  name varchar(50) NOT NULL,
  CONSTRAINT genders_name_key UNIQUE (name)
);
INSERT INTO genders (name) VALUES ('Varón'), ('Nena'), ('Unisex')
  ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS expense_types (
  id     serial4      PRIMARY KEY,
  name   varchar(100) NOT NULL,
  active boolean      NOT NULL DEFAULT true,
  CONSTRAINT expense_types_name_unique UNIQUE (name)
);
INSERT INTO expense_types (name) VALUES
  ('Mantenimiento'), ('Impuestos'), ('Alquiler'),
  ('Servicios'), ('Limpieza'), ('Sueldos'), ('Otros')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS settings (
  id    serial4      PRIMARY KEY,
  key   varchar(100) NOT NULL,
  value text,
  CONSTRAINT settings_key_unique UNIQUE (key)
);
INSERT INTO settings (key, value) VALUES
  ('business_name', 'ROI POS'),
  ('business_logo', NULL)
ON CONFLICT (key) DO NOTHING;


-- ── 2. Sucursales y usuarios ─────────────────────────────────

CREATE TABLE IF NOT EXISTS branches (
  id                    serial4      PRIMARY KEY,
  name                  varchar(100) NOT NULL,
  address               varchar(255) NULL,
  arca_pos_number       int4         NOT NULL DEFAULT 0,
  mercadopago_store_id  varchar(50)  NULL,
  is_default            boolean      NOT NULL DEFAULT false,
  created_at            timestamp    DEFAULT CURRENT_TIMESTAMP,
  updated_at            timestamp    DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS app_users (
  id         serial4      PRIMARY KEY,
  name       varchar(100) NOT NULL,
  email      varchar(150) NOT NULL,
  role       varchar(20)  NOT NULL DEFAULT 'vendedor'
               CHECK (role IN ('vendedor','encargado','administrador')),
  active     boolean      NOT NULL DEFAULT true,
  created_at timestamp    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT app_users_email_unique UNIQUE (email)
);


-- ── 3. Productos ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                   serial4       PRIMARY KEY,
  category_id          int4          NULL REFERENCES categories(id) ON DELETE RESTRICT,
  age_group_id         int4          NULL REFERENCES age_groups(id) ON DELETE SET NULL,
  season_id            int4          NULL REFERENCES seasons(id)    ON DELETE SET NULL,
  gender_id            int4          NULL REFERENCES genders(id)    ON DELETE SET NULL,
  name                 varchar(150)  NOT NULL,
  description          text          NULL,
  base_price           numeric(12,2) NOT NULL DEFAULT 0.00,
  general_image_url    text          NULL,
  photo_url            text          NULL,
  exportable_whatsapp  boolean       NOT NULL DEFAULT false,
  exportable_instagram boolean       NOT NULL DEFAULT false,
  exportable_facebook  boolean       NOT NULL DEFAULT false,
  exportable_web       boolean       NOT NULL DEFAULT false,
  created_at           timestamp     DEFAULT CURRENT_TIMESTAMP,
  updated_at           timestamp     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id                  serial4      PRIMARY KEY,
  product_id          int4         NULL REFERENCES products(id) ON DELETE CASCADE,
  purchase_detail_id  int4         NULL,
  sku                 varchar(100) NOT NULL,
  color               varchar(50)  NOT NULL,
  size                varchar(50)  NOT NULL,
  barcode             varchar(100) NULL,
  specific_image_url  text         NULL,
  label_printed_at    timestamp    NULL,
  created_at          timestamp    DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamp    DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT product_variants_barcode_key UNIQUE (barcode),
  CONSTRAINT product_variants_sku_key     UNIQUE (sku)
);


-- ── 4. Compras ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS purchases (
  id             serial4       PRIMARY KEY,
  supplier_id    int4          NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
  title          varchar(200)  NULL,
  total_amount   numeric(12,2) NOT NULL,
  invoice_number varchar(50)   NULL,
  purchase_date  timestamp     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS purchase_details (
  id          serial4       PRIMARY KEY,
  purchase_id int4          NULL REFERENCES purchases(id)        ON DELETE CASCADE,
  product_id  int4          NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  unit_cost   numeric(12,2) NOT NULL,
  color       varchar       NULL,
  curva       int4          NULL,
  curva_sizes varchar       NULL,
  quantity    int4          NULL
);

-- FK inversa: variant → purchase_detail
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS purchase_detail_id INT4 NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_variants_purchase_detail_id_fkey'
  ) THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT product_variants_purchase_detail_id_fkey
      FOREIGN KEY (purchase_detail_id) REFERENCES purchase_details(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ── 5. Inventario por sucursal ───────────────────────────────

CREATE TABLE IF NOT EXISTS branch_inventory (
  id                 serial4   PRIMARY KEY,
  product_variant_id int4      NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id          int4      NULL REFERENCES branches(id)         ON DELETE CASCADE,
  updated_at         timestamp DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_variant_per_branch UNIQUE (product_variant_id, branch_id)
);


-- ── 6. POS: sesiones, ventas, cambios, gastos ────────────────

CREATE TABLE IF NOT EXISTS pos_sessions (
  id                  serial4       PRIMARY KEY,
  branch_id           int4          NOT NULL REFERENCES branches(id)   ON DELETE RESTRICT,
  opened_by_user_id   int4          NULL     REFERENCES app_users(id)  ON DELETE SET NULL,
  closed_by_user_id   int4          NULL     REFERENCES app_users(id)  ON DELETE SET NULL,
  opening_balance     numeric(12,2) NOT NULL DEFAULT 0,
  closing_balance     numeric(12,2) NULL,
  opened_at           timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at           timestamp     NULL,
  notes               text          NULL
);

CREATE TABLE IF NOT EXISTS sales (
  id              serial4       PRIMARY KEY,
  branch_id       int4          NOT NULL REFERENCES branches(id)      ON DELETE RESTRICT,
  pos_session_id  int4          NULL     REFERENCES pos_sessions(id)  ON DELETE SET NULL,
  invoice_number  varchar(50)   NULL,
  subtotal        numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount    numeric(12,2) NOT NULL,
  payment_method  varchar(30)   NOT NULL,
  mp_payment_id   varchar(100)  NULL,
  arca_cae        varchar(50)   NULL,
  arca_vto_cae    date          NULL,
  notes           text          NULL,
  sold_at         timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_details (
  id                 serial4       PRIMARY KEY,
  sale_id            int4          NOT NULL REFERENCES sales(id)            ON DELETE CASCADE,
  product_variant_id int4          NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  unit_price         numeric(12,2) NOT NULL,
  created_at         timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sale_details_variant_unique UNIQUE (product_variant_id)
);

CREATE TABLE IF NOT EXISTS daily_expenses (
  id              serial4       PRIMARY KEY,
  pos_session_id  int4          REFERENCES pos_sessions(id)  ON DELETE SET NULL,
  branch_id       int4          NOT NULL REFERENCES branches(id),
  user_id         int4          REFERENCES app_users(id)     ON DELETE SET NULL,
  expense_type_id int4          REFERENCES expense_types(id) ON DELETE SET NULL,
  description     text,
  amount          numeric(12,2) NOT NULL,
  payment_method  varchar(30)   NOT NULL DEFAULT 'efectivo',
  created_at      timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS exchanges (
  id                  serial4       PRIMARY KEY,
  exchange_sale_id    int4          REFERENCES sales(id)            ON DELETE SET NULL,
  branch_id           int4          NOT NULL REFERENCES branches(id),
  pos_session_id      int4          REFERENCES pos_sessions(id)     ON DELETE SET NULL,
  user_id             int4          REFERENCES app_users(id)        ON DELETE SET NULL,
  returned_variant_id int4          NOT NULL REFERENCES product_variants(id),
  new_variant_id      int4          NOT NULL REFERENCES product_variants(id),
  returned_price      numeric(12,2) NOT NULL,
  new_price           numeric(12,2) NOT NULL,
  difference_amount   numeric(12,2) NOT NULL,
  payment_method      varchar(30)   NULL,
  notes               text,
  created_at          timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
