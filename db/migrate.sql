-- ============================================================
-- Migración ROI-POS  –  idempotente, se puede correr N veces
-- ============================================================

-- ── 0. Limpiar datos de prueba con FK inválida ───────────────
UPDATE purchase_details pd
SET product_id = NULL
WHERE pd.product_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM products p WHERE p.id = pd.product_id);


-- ── 1. Corregir FK purchase_details.product_id → products ────
ALTER TABLE purchase_details
  DROP CONSTRAINT IF EXISTS purchase_details_product_variant_id_fkey;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'purchase_details_product_id_fkey'
      AND conrelid = 'purchase_details'::regclass
  ) THEN
    ALTER TABLE purchase_details
      ADD CONSTRAINT purchase_details_product_id_fkey
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;
  END IF;
END $$;


-- ── 2. purchase_detail_id en product_variants ─────────────────
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS purchase_detail_id INT4 NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'product_variants_purchase_detail_id_fkey'
      AND conrelid = 'product_variants'::regclass
  ) THEN
    ALTER TABLE product_variants
      ADD CONSTRAINT product_variants_purchase_detail_id_fkey
      FOREIGN KEY (purchase_detail_id) REFERENCES purchase_details(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- v2 – Tablas de clasificación de productos
-- ════════════════════════════════════════════════════════════════

-- ── 3. Grupos de edad ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS age_groups (
  id   serial4     PRIMARY KEY,
  name varchar(50) NOT NULL,
  CONSTRAINT age_groups_name_key UNIQUE (name)
);
INSERT INTO age_groups (name) VALUES ('Bebés'), ('Niños')
  ON CONFLICT (name) DO NOTHING;


-- ── 4. Temporadas ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS seasons (
  id   serial4     PRIMARY KEY,
  name varchar(50) NOT NULL,
  CONSTRAINT seasons_name_key UNIQUE (name)
);
INSERT INTO seasons (name) VALUES
  ('Verano'), ('Invierno'), ('Todo el año'), ('Escolar'), ('Navidad')
  ON CONFLICT (name) DO NOTHING;


-- ── 5. Géneros ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS genders (
  id   serial4     PRIMARY KEY,
  name varchar(50) NOT NULL,
  CONSTRAINT genders_name_key UNIQUE (name)
);
INSERT INTO genders (name) VALUES ('Varón'), ('Nena'), ('Unisex')
  ON CONFLICT (name) DO NOTHING;


-- ── 6. Nuevas columnas en products ───────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS age_group_id INT4 NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS season_id    INT4 NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gender_id    INT4 NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_age_group_id_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_age_group_id_fkey
      FOREIGN KEY (age_group_id) REFERENCES age_groups(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_season_id_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_season_id_fkey
      FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='products_gender_id_fkey') THEN
    ALTER TABLE products ADD CONSTRAINT products_gender_id_fkey
      FOREIGN KEY (gender_id) REFERENCES genders(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- v3 – Etiquetas: fecha de impresión en product_variants
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- v4 – Ventas y control de caja
-- ════════════════════════════════════════════════════════════════

-- ── 7. Sesiones de caja (POS) ────────────────────────────────
CREATE TABLE IF NOT EXISTS pos_sessions (
  id               serial4       PRIMARY KEY,
  branch_id        int4          NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  opening_balance  numeric(12,2) NOT NULL DEFAULT 0,
  closing_balance  numeric(12,2) NULL,
  opened_at        timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at        timestamp     NULL,
  notes            text          NULL
);

-- ── 8. Ventas ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales (
  id               serial4       PRIMARY KEY,
  branch_id        int4          NOT NULL REFERENCES branches(id)      ON DELETE RESTRICT,
  pos_session_id   int4          NULL     REFERENCES pos_sessions(id)  ON DELETE SET NULL,
  invoice_number   varchar(50)   NULL,
  subtotal         numeric(12,2) NOT NULL,
  discount_amount  numeric(12,2) NOT NULL DEFAULT 0,
  total_amount     numeric(12,2) NOT NULL,
  payment_method   varchar(30)   NOT NULL,   -- efectivo | debito | credito | mp | transferencia
  mp_payment_id    varchar(100)  NULL,        -- hook futuro MercadoPago
  arca_cae         varchar(50)   NULL,        -- hook futuro ARCA
  arca_vto_cae     date          NULL,
  notes            text          NULL,
  sold_at          timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at       timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── 9. Detalle de venta (una prenda física por fila) ─────────
CREATE TABLE IF NOT EXISTS sale_details (
  id                 serial4       PRIMARY KEY,
  sale_id            int4          NOT NULL REFERENCES sales(id)            ON DELETE CASCADE,
  product_variant_id int4          NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  unit_price         numeric(12,2) NOT NULL,
  created_at         timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sale_details_variant_unique UNIQUE (product_variant_id)
);


-- ── 10. label_printed_at en product_variants ─────────────────
ALTER TABLE product_variants
  ADD COLUMN IF NOT EXISTS label_printed_at TIMESTAMP NULL;


-- ════════════════════════════════════════════════════════════════
-- v5 – Configuración del negocio, usuarios, gastos
-- ════════════════════════════════════════════════════════════════

-- ── 11. Configuración general ─────────────────────────────────
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

-- ── 12. Usuarios de la aplicación ────────────────────────────
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

-- ── 13. Quién abrió / cerró cada caja ────────────────────────
ALTER TABLE pos_sessions
  ADD COLUMN IF NOT EXISTS opened_by_user_id int4
    REFERENCES app_users(id) ON DELETE SET NULL;
ALTER TABLE pos_sessions
  ADD COLUMN IF NOT EXISTS closed_by_user_id int4
    REFERENCES app_users(id) ON DELETE SET NULL;

-- ── 14. Tipos de gasto ────────────────────────────────────────
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

-- ── 15. Gastos diarios ────────────────────────────────────────
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


-- ════════════════════════════════════════════════════════════════
-- v6 – Sucursal favorita
-- ════════════════════════════════════════════════════════════════

ALTER TABLE branches ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false;


-- ════════════════════════════════════════════════════════════════
-- v7 – Título de compra
-- ════════════════════════════════════════════════════════════════

ALTER TABLE purchases ADD COLUMN IF NOT EXISTS title VARCHAR(200) NULL;


-- ════════════════════════════════════════════════════════════════
-- v7 – Productos: foto y flags de exportación
-- ════════════════════════════════════════════════════════════════

ALTER TABLE products ADD COLUMN IF NOT EXISTS photo_url             TEXT    NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS exportable_whatsapp   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS exportable_instagram  BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS exportable_facebook   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS exportable_web        BOOLEAN NOT NULL DEFAULT false;


-- ════════════════════════════════════════════════════════════════
-- v7 – Cambios de mercadería (exchanges)
-- ════════════════════════════════════════════════════════════════

-- ════════════════════════════════════════════════════════════════
-- v7 – Cambios de mercadería (exchanges)
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS exchanges (
  id                  serial4       PRIMARY KEY,
  exchange_sale_id    int4          REFERENCES sales(id)            ON DELETE SET NULL,
  branch_id           int4          NOT NULL REFERENCES branches(id),
  pos_session_id      int4          REFERENCES pos_sessions(id)     ON DELETE SET NULL,
  user_id             int4          REFERENCES app_users(id)        ON DELETE SET NULL,
  returned_variant_id int4          NOT NULL REFERENCES product_variants(id),
  new_variant_id      int4          NOT NULL REFERENCES product_variants(id),
  returned_price      numeric(12,2) NOT NULL,   -- precio que pagó el cliente
  new_price           numeric(12,2) NOT NULL,   -- precio del artículo nuevo
  difference_amount   numeric(12,2) NOT NULL,   -- new_price − returned_price
  payment_method      varchar(30)   NULL,        -- solo si hay diferencia
  notes               text,
  created_at          timestamp     NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ── Resultado acumulado ────────────────────────────────────────
--
--  product_variants
--    purchase_detail_id  → purchase_details(id)  (v1)
--    label_printed_at    TIMESTAMP NULL           (v3)
--
--  products
--    category_id   → categories(id)   (ya existía)
--    age_group_id  → age_groups(id)   (v2)
--    season_id     → seasons(id)      (v2)
--    gender_id     → genders(id)      (v2)
-- ─────────────────────────────────────────────────────────────
