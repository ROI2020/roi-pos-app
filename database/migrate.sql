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


-- ════════════════════════════════════════════════════════════════
-- v8 – Vendedor en ventas (user_id en tabla sales)
-- ════════════════════════════════════════════════════════════════

ALTER TABLE sales ADD COLUMN IF NOT EXISTS user_id INT4 NULL
  REFERENCES app_users(id) ON DELETE SET NULL;


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


-- ── Pago mixto: payment_split en sales ───────────────────────
-- Almacena el desglose cuando una venta se paga con más de un
-- medio. Ej: { "efectivo": 2000, "mp": 3000 }
-- payment_method queda como el medio principal (mayor monto)
-- para backward-compat con las queries de totales existentes.
ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_split JSONB;


-- ── Snapshots de stock por sucursal (se graban al cerrar caja) ───
-- Guardan una foto diaria del estado del inventario para armar
-- los gráficos históricos del Dashboard de Stock.
CREATE TABLE IF NOT EXISTS stock_snapshots (
  id               SERIAL PRIMARY KEY,
  snapshot_date    DATE NOT NULL,
  branch_id        INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  -- Unidades
  stock_units      INTEGER      NOT NULL DEFAULT 0,
  sold_units       INTEGER      NOT NULL DEFAULT 0,
  -- Valores
  stock_cost       NUMERIC(12,2) NOT NULL DEFAULT 0,
  stock_list_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  daily_sales      NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Metadata
  pos_session_id   INTEGER REFERENCES pos_sessions(id) ON DELETE SET NULL,
  created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_snapshot_branch_date UNIQUE (snapshot_date, branch_id)
);


-- ── Retiros a Caja Central ─────────────────────────────────────────
-- Registra retiros de efectivo de una sucursal a la Caja Central.
-- Aparece en Movimientos de Caja como un tipo 'retiro' (negativo en
-- la sucursal, positivo en la Caja Central virtual).
CREATE TABLE IF NOT EXISTS cash_transfers (
  id              SERIAL PRIMARY KEY,
  pos_session_id  INTEGER REFERENCES pos_sessions(id) ON DELETE SET NULL,
  from_branch_id  INTEGER NOT NULL REFERENCES branches(id),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  notes           TEXT,
  user_id         INTEGER REFERENCES app_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


-- ════════════════════════════════════════════════════════════════
-- v9 – Multi-negocio (business) + Cuentas/Fops/Transactions
--
-- FASE 1 (aditiva): solo prepara el terreno, no rompe pantallas.
--   - business_id se agrega NOT NULL DEFAULT 1 en cada tabla de
--     negocio: las inserts actuales (que no conocen la columna)
--     siguen funcionando igual, y las filas viejas quedan
--     automáticamente asignadas al negocio único migrado (id=1).
--   - accounts/fops quedan creadas y cargadas (2 cuentas por
--     sucursal existente + 1 Caja Central a nivel negocio).
--   - transactions queda vacía: el backfill de ventas/gastos/
--     cambios/transfers históricos y la migración de las pantallas
--     (Movimientos de Caja, recibos, etc.) son una fase aparte.
--   - Pendiente para una fase futura (NO en este script):
--     mover business_name/logo/etc. fuera de settings hacia
--     business, corregir branches.is_default para que sea único
--     por business_id (hoy es un singleton global), y endurecer
--     el login (sigue sin tocarse en esta fase).
-- ════════════════════════════════════════════════════════════════

-- ── Negocio ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS business (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR NOT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Negocio único migrado desde el settings.business_name actual.
-- Se fuerza id=1 para poder usarlo como DEFAULT fijo en las
-- columnas business_id de abajo (un DEFAULT no admite subquery).
INSERT INTO business (id, name)
SELECT 1, COALESCE((SELECT value FROM settings WHERE key = 'business_name'), 'Mi Negocio')
WHERE NOT EXISTS (SELECT 1 FROM business WHERE id = 1);

SELECT setval(pg_get_serial_sequence('business', 'id'), GREATEST((SELECT MAX(id) FROM business), 1));

-- ── business_id en las tablas de negocio ───────────────────────
ALTER TABLE settings        ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE app_users       ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE suppliers       ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE purchases       ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE branches        ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE pos_sessions    ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE sales           ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE daily_expenses  ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE exchanges       ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE cash_transfers  ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE products        ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE categories      ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE age_groups      ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE genders         ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE seasons         ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE stock_snapshots ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
ALTER TABLE expense_types   ADD COLUMN IF NOT EXISTS business_id INTEGER NOT NULL DEFAULT 1 REFERENCES business(id);
-- expense_types no estaba en la lista original, pero es una tabla de
-- catálogo igual que categories/age_groups/genders/seasons.

CREATE INDEX IF NOT EXISTS idx_settings_business        ON settings(business_id);
CREATE INDEX IF NOT EXISTS idx_app_users_business        ON app_users(business_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_business        ON suppliers(business_id);
CREATE INDEX IF NOT EXISTS idx_purchases_business        ON purchases(business_id);
CREATE INDEX IF NOT EXISTS idx_branches_business          ON branches(business_id);
CREATE INDEX IF NOT EXISTS idx_pos_sessions_business      ON pos_sessions(business_id);
CREATE INDEX IF NOT EXISTS idx_sales_business             ON sales(business_id);
CREATE INDEX IF NOT EXISTS idx_daily_expenses_business    ON daily_expenses(business_id);
CREATE INDEX IF NOT EXISTS idx_exchanges_business         ON exchanges(business_id);
CREATE INDEX IF NOT EXISTS idx_cash_transfers_business    ON cash_transfers(business_id);
CREATE INDEX IF NOT EXISTS idx_products_business          ON products(business_id);
CREATE INDEX IF NOT EXISTS idx_categories_business        ON categories(business_id);
CREATE INDEX IF NOT EXISTS idx_age_groups_business        ON age_groups(business_id);
CREATE INDEX IF NOT EXISTS idx_genders_business           ON genders(business_id);
CREATE INDEX IF NOT EXISTS idx_seasons_business           ON seasons(business_id);
CREATE INDEX IF NOT EXISTS idx_stock_snapshots_business   ON stock_snapshots(business_id);
CREATE INDEX IF NOT EXISTS idx_expense_types_business     ON expense_types(business_id);


-- ── Cuentas, formas de pago y transacciones ────────────────────
-- El saldo de cada cuenta NO se guarda como columna: se calcula
-- sumando transactions.amount por cuenta (vía fops.account_id),
-- para que nunca pueda desincronizarse de la realidad.
CREATE TABLE IF NOT EXISTS accounts (
  id          SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES business(id),
  branch_id   INTEGER REFERENCES branches(id),  -- NULL = cuenta a nivel negocio (ej. Caja Central)
  name        VARCHAR NOT NULL,
  type        VARCHAR NOT NULL,
  currency    VARCHAR NOT NULL DEFAULT 'ARS',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_accounts_business ON accounts(business_id);
CREATE INDEX IF NOT EXISTS idx_accounts_branch   ON accounts(branch_id);

CREATE TABLE IF NOT EXISTS fops (
  id            SERIAL PRIMARY KEY,
  account_id    INTEGER NOT NULL REFERENCES accounts(id),
  name          VARCHAR NOT NULL,
  use_for_sales BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fops_account ON fops(account_id);

CREATE TABLE IF NOT EXISTS transactions (
  id          SERIAL PRIMARY KEY,
  business_id INTEGER NOT NULL REFERENCES business(id),
  branch_id   INTEGER REFERENCES branches(id),
  fop_id      INTEGER NOT NULL REFERENCES fops(id),
  type        VARCHAR NOT NULL CHECK (type IN ('sale', 'purchase', 'exchange', 'expense', 'transfer')),
  type_id     INTEGER NOT NULL,  -- id de la fila origen en sales/purchases/exchanges/daily_expenses/cash_transfers
  currency    VARCHAR NOT NULL DEFAULT 'ARS',
  amount      NUMERIC(12,2) NOT NULL,  -- positivo = entra a la cuenta, negativo = sale de la cuenta
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_business ON transactions(business_id);
CREATE INDEX IF NOT EXISTS idx_transactions_fop      ON transactions(fop_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type     ON transactions(type, type_id);

-- ── Cuentas migradas: 2 por sucursal existente + 1 Caja Central ──
INSERT INTO accounts (business_id, branch_id, name, type, currency)
SELECT 1, b.id, 'Efectivo Caja Sucursal', 'efectivo', 'ARS'
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.branch_id = b.id AND a.name = 'Efectivo Caja Sucursal'
);

INSERT INTO accounts (business_id, branch_id, name, type, currency)
SELECT 1, b.id, 'Mercado Pago MC', 'mercadopago', 'ARS'
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM accounts a WHERE a.branch_id = b.id AND a.name = 'Mercado Pago MC'
);

INSERT INTO accounts (business_id, branch_id, name, type, currency)
SELECT 1, NULL, 'Efectivo Caja Central', 'efectivo', 'ARS'
WHERE NOT EXISTS (
  SELECT 1 FROM accounts WHERE branch_id IS NULL AND name = 'Efectivo Caja Central'
);

-- ── Fops migrados ───────────────────────────────────────────────
-- Efectivo bajo cada "Efectivo Caja Sucursal"
INSERT INTO fops (account_id, name, use_for_sales)
SELECT a.id, 'Efectivo', true
FROM accounts a
WHERE a.name = 'Efectivo Caja Sucursal'
  AND NOT EXISTS (SELECT 1 FROM fops f WHERE f.account_id = a.id AND f.name = 'Efectivo');

-- Debito / Credito / QR / Transferencia bajo cada "Mercado Pago MC"
-- (histórico de payment_method='mp' se mapea a QR en el backfill)
INSERT INTO fops (account_id, name, use_for_sales)
SELECT a.id, v.name, true
FROM accounts a
CROSS JOIN (VALUES ('Debito'), ('Credito'), ('QR'), ('Transferencia')) AS v(name)
WHERE a.name = 'Mercado Pago MC'
  AND NOT EXISTS (SELECT 1 FROM fops f WHERE f.account_id = a.id AND f.name = v.name);

-- Efectivo bajo "Efectivo Caja Central" (recibe los retiros/transfers)
INSERT INTO fops (account_id, name, use_for_sales)
SELECT a.id, 'Efectivo', false
FROM accounts a
WHERE a.name = 'Efectivo Caja Central'
  AND NOT EXISTS (SELECT 1 FROM fops f WHERE f.account_id = a.id AND f.name = 'Efectivo');

*********************************** hasta aca corrido en Produccion   **************************
-- ════════════════════════════════════════════════════════════════
-- v10 – Backfill histórico de transactions
--
-- Carga en transactions el equivalente de lo que ya existe en
-- sales/daily_expenses/exchanges/cash_transfers/purchases. Sigue
-- siendo aditivo: ninguna pantalla lee todavía de transactions,
-- así que esto no cambia nada visible en la app.
--
-- Mapeo de payment_method/payment_split histórico → fop:
--   efectivo      → Efectivo Caja Sucursal / Efectivo
--   debito        → Mercado Pago MC / Debito
--   credito       → Mercado Pago MC / Credito
--   mp            → Mercado Pago MC / QR        (acordado: el botón
--                    único "Mercado Pago" de hoy se asume QR)
--   transferencia → Mercado Pago MC / Transferencia
--
-- purchases NO tiene branch_id ni payment_method (no hay forma de
-- saber con qué cuenta se pagó cada compra histórica). Por decisión
-- explícita se asume que todas las compras históricas se pagaron
-- desde "Efectivo Caja Central" — es un supuesto, no un hecho
-- registrado, dejarlo documentado acá para poder auditarlo/corregirlo.
-- ════════════════════════════════════════════════════════════════

-- ── Ventas (sin pago dividido) ──────────────────────────────────
-- Excluye las sales que en realidad son el lado "venta" de un
-- exchange (mismo criterio que ya usa el reporte de Movimientos de
-- Caja): esas se cargan más abajo como type='exchange'.
INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
SELECT s.business_id, s.branch_id, f.id, 'sale', s.id, 'ARS', s.total_amount, s.sold_at
FROM sales s
JOIN (VALUES
  ('efectivo', 'Efectivo Caja Sucursal', 'Efectivo'),
  ('debito', 'Mercado Pago MC', 'Debito'),
  ('credito', 'Mercado Pago MC', 'Credito'),
  ('mp', 'Mercado Pago MC', 'QR'),
  ('transferencia', 'Mercado Pago MC', 'Transferencia')
) AS mm(method, account_name, fop_name) ON mm.method = s.payment_method
JOIN accounts a ON a.branch_id = s.branch_id AND a.name = mm.account_name
JOIN fops f ON f.account_id = a.id AND f.name = mm.fop_name
WHERE s.payment_split IS NULL
  AND NOT EXISTS (SELECT 1 FROM exchanges ex WHERE ex.exchange_sale_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.type = 'sale' AND t.type_id = s.id AND t.fop_id = f.id);

-- ── Ventas con pago dividido (payment_split) ────────────────────
INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
SELECT s.business_id, s.branch_id, f.id, 'sale', s.id, 'ARS', (kv.value)::numeric, s.sold_at
FROM sales s
CROSS JOIN LATERAL jsonb_each_text(s.payment_split) AS kv(method, value)
JOIN (VALUES
  ('efectivo', 'Efectivo Caja Sucursal', 'Efectivo'),
  ('debito', 'Mercado Pago MC', 'Debito'),
  ('credito', 'Mercado Pago MC', 'Credito'),
  ('mp', 'Mercado Pago MC', 'QR'),
  ('transferencia', 'Mercado Pago MC', 'Transferencia')
) AS mm(method, account_name, fop_name) ON mm.method = kv.method
JOIN accounts a ON a.branch_id = s.branch_id AND a.name = mm.account_name
JOIN fops f ON f.account_id = a.id AND f.name = mm.fop_name
WHERE s.payment_split IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM exchanges ex WHERE ex.exchange_sale_id = s.id)
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.type = 'sale' AND t.type_id = s.id AND t.fop_id = f.id);

-- ── Gastos diarios ───────────────────────────────────────────────
INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
SELECT de.business_id, de.branch_id, f.id, 'expense', de.id, 'ARS', -de.amount, de.created_at
FROM daily_expenses de
JOIN (VALUES
  ('efectivo', 'Efectivo Caja Sucursal', 'Efectivo'),
  ('debito', 'Mercado Pago MC', 'Debito'),
  ('credito', 'Mercado Pago MC', 'Credito'),
  ('mp', 'Mercado Pago MC', 'QR'),
  ('transferencia', 'Mercado Pago MC', 'Transferencia')
) AS mm(method, account_name, fop_name) ON mm.method = de.payment_method
JOIN accounts a ON a.branch_id = de.branch_id AND a.name = mm.account_name
JOIN fops f ON f.account_id = a.id AND f.name = mm.fop_name
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.type = 'expense' AND t.type_id = de.id AND t.fop_id = f.id);

-- ── Cambios de mercadería (solo si hubo diferencia de plata) ─────
INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
SELECT ex.business_id, ex.branch_id, f.id, 'exchange', ex.id, 'ARS', ex.difference_amount, ex.created_at
FROM exchanges ex
JOIN (VALUES
  ('efectivo', 'Efectivo Caja Sucursal', 'Efectivo'),
  ('debito', 'Mercado Pago MC', 'Debito'),
  ('credito', 'Mercado Pago MC', 'Credito'),
  ('mp', 'Mercado Pago MC', 'QR'),
  ('transferencia', 'Mercado Pago MC', 'Transferencia')
) AS mm(method, account_name, fop_name) ON mm.method = ex.payment_method
JOIN accounts a ON a.branch_id = ex.branch_id AND a.name = mm.account_name
JOIN fops f ON f.account_id = a.id AND f.name = mm.fop_name
WHERE ex.payment_method IS NOT NULL
  AND ex.difference_amount <> 0
  AND NOT EXISTS (SELECT 1 FROM transactions t WHERE t.type = 'exchange' AND t.type_id = ex.id AND t.fop_id = f.id);

-- ── Retiros a Caja Central (2 patas: sale de sucursal, entra a central) ──
INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
SELECT ct.business_id, ct.from_branch_id, f.id, 'transfer', ct.id, 'ARS', -ct.amount, ct.created_at
FROM cash_transfers ct
JOIN accounts a ON a.branch_id = ct.from_branch_id AND a.name = 'Efectivo Caja Sucursal'
JOIN fops f ON f.account_id = a.id AND f.name = 'Efectivo'
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.type = 'transfer' AND t.type_id = ct.id AND t.fop_id = f.id);

INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
SELECT ct.business_id, NULL, f.id, 'transfer', ct.id, 'ARS', ct.amount, ct.created_at
FROM cash_transfers ct
JOIN accounts a ON a.branch_id IS NULL AND a.name = 'Efectivo Caja Central'
JOIN fops f ON f.account_id = a.id AND f.name = 'Efectivo'
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.type = 'transfer' AND t.type_id = ct.id AND t.fop_id = f.id);

-- ── Compras (supuesto: todas pagadas desde Efectivo Caja Central) ──
INSERT INTO transactions (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
SELECT p.business_id, NULL, f.id, 'purchase', p.id, 'ARS', -p.total_amount, p.purchase_date
FROM purchases p
JOIN accounts a ON a.branch_id IS NULL AND a.name = 'Efectivo Caja Central'
JOIN fops f ON f.account_id = a.id AND f.name = 'Efectivo'
WHERE NOT EXISTS (SELECT 1 FROM transactions t WHERE t.type = 'purchase' AND t.type_id = p.id AND t.fop_id = f.id);

-- ════════════════════════════════════════════════════════════════
-- v11 – Corrección de created_at en transactions backfilleadas
--
-- Los INSERT de v10 originalmente no fijaban created_at, así que
-- tomaban CURRENT_TIMESTAMP (el momento de la migración) en vez de
-- la fecha real del evento. Ya corregido en los INSERT de arriba
-- para corridas futuras; este UPDATE resincroniza las filas que ya
-- habían quedado mal fechadas. Idempotente: si ya está bien, no
-- cambia nada.
-- ════════════════════════════════════════════════════════════════

UPDATE transactions t SET created_at = s.sold_at
FROM sales s WHERE t.type = 'sale' AND t.type_id = s.id AND t.created_at <> s.sold_at;

UPDATE transactions t SET created_at = de.created_at
FROM daily_expenses de WHERE t.type = 'expense' AND t.type_id = de.id AND t.created_at <> de.created_at;

UPDATE transactions t SET created_at = ex.created_at
FROM exchanges ex WHERE t.type = 'exchange' AND t.type_id = ex.id AND t.created_at <> ex.created_at;

UPDATE transactions t SET created_at = ct.created_at
FROM cash_transfers ct WHERE t.type = 'transfer' AND t.type_id = ct.id AND t.created_at <> ct.created_at;

UPDATE transactions t SET created_at = p.purchase_date
FROM purchases p WHERE t.type = 'purchase' AND t.type_id = p.id AND t.created_at <> p.purchase_date;
******************************************* falta la parte de arriba correr en Produccion  **************************


-- ════════════════════════════════════════════════════════════════
-- v12 – Logs de generación de descripción con IA
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS ai_description_logs (
  id                  SERIAL PRIMARY KEY,
  created_at          TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  product_id          INT4          NULL REFERENCES products(id) ON DELETE SET NULL,
  product_name        VARCHAR(200)  NULL,
  categoria           VARCHAR(100)  NULL,
  precio              NUMERIC(12,2) NULL,
  modelo              VARCHAR(100)  NOT NULL,
  estilo              VARCHAR(50)   NOT NULL,
  descripcion_generada TEXT         NULL,
  descripcion_anterior TEXT         NULL,
  es_regeneracion     BOOLEAN       NOT NULL DEFAULT false,
  tokens_entrada      INT4          NULL,
  tokens_salida       INT4          NULL,
  duracion_ms         INT4          NULL,
  tuvo_imagen         BOOLEAN       NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_ai_logs_created_at  ON ai_description_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_logs_product_id  ON ai_description_logs(product_id);
**** Tabla pasada a prod - Falta antrophic key y trigger para que se llene product_name, categoria y precio al insertar.***
