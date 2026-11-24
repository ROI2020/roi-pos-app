-- ═══════════════════════════════════════════════════════════════════════════
-- Migración: Módulos Clientes / Promociones / Ruleta
-- Fecha: 2026-08-06
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. CUSTOMERS ─────────────────────────────────────────────────────────
CREATE TABLE public.customers (
    id                   serial4 NOT NULL,
    business_id          int4 NOT NULL DEFAULT 1,
    name                 varchar(150) NOT NULL,
    phone                varchar(30) NOT NULL,           -- identificador único, con código país
    -- Consentimientos separados
    consent_policies     bool NOT NULL DEFAULT false,   -- obligatorio para ruleta
    consent_news         bool NOT NULL DEFAULT false,   -- opcional
    consent_images       bool NOT NULL DEFAULT false,   -- opcional
    consented_at         timestamp NULL,
    -- Verificación WhatsApp
    verification_code    varchar(20) NULL,
    verification_expires timestamp NULL,
    verified             bool NOT NULL DEFAULT false,
    -- Control participación (mes calendario: 'YYYY-MM')
    last_roulette_month  varchar(7) NULL,
    -- Metadata
    created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT customers_pkey PRIMARY KEY (id),
    CONSTRAINT customers_phone_business_uq UNIQUE (phone, business_id)
);

-- ─── 2. PROMOTIONS ────────────────────────────────────────────────────────
CREATE TABLE public.promotions (
    id                   serial4 NOT NULL,
    business_id          int4 NOT NULL DEFAULT 1,
    name                 varchar(150) NULL,
    summary              text NULL,                     -- ej: "BUZOS 10% OFF"
    detail               text NULL,                     -- letra chica
    discount_type        varchar(20) NOT NULL,           -- 'percentage' | 'fixed_amount'
    value                numeric(10, 2) NOT NULL,
    -- Días activos: '135' = lun,mié,vie | '1234567' = todos
    days_of_week         varchar(7) NOT NULL DEFAULT '1234567',
    -- Filtros sobre productos (null = todos)
    category_id          int4 NULL,
    age_group_id         int4 NULL,
    season_id            int4 NULL,
    gender_id            int4 NULL,
    -- Vigencia
    start_date           date NULL,
    end_date             date NULL,
    -- Ruleta: peso y límite diario de premios
    roulette_weight      int4 NOT NULL DEFAULT 10,      -- menor valor = más difícil de ganar
    roulette_daily_limit int4 NULL,                     -- null = sin límite diario
    -- General
    estimated_savings    numeric(10, 2) NOT NULL DEFAULT 0.00,
    active               bool NOT NULL DEFAULT true,
    created_by           int4 NULL,
    created_at           timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT promotions_pkey PRIMARY KEY (id),
    CONSTRAINT promotions_category_id_fkey  FOREIGN KEY (category_id)  REFERENCES public.categories(id)  ON DELETE SET NULL,
    CONSTRAINT promotions_age_group_id_fkey FOREIGN KEY (age_group_id) REFERENCES public.age_groups(id)  ON DELETE SET NULL,
    CONSTRAINT promotions_season_id_fkey    FOREIGN KEY (season_id)    REFERENCES public.seasons(id)     ON DELETE SET NULL,
    CONSTRAINT promotions_gender_id_fkey    FOREIGN KEY (gender_id)    REFERENCES public.genders(id)     ON DELETE SET NULL,
    CONSTRAINT promotions_created_by_fkey   FOREIGN KEY (created_by)   REFERENCES public.app_users(id)   ON DELETE SET NULL
);

-- ─── 3. DISCOUNT CODES ────────────────────────────────────────────────────
CREATE TABLE public.discount_codes (
    id              serial4 NOT NULL,
    business_id     int4 NOT NULL DEFAULT 1,
    code            varchar(50) NOT NULL,
    promotion_id    int4 NULL,
    customer_id     int4 NULL,
    source          varchar(30) NOT NULL DEFAULT 'manual',  -- 'ruleta' | 'manual'
    discount_type   varchar(20) NOT NULL,
    value           numeric(10, 2) NOT NULL,
    expires_at      timestamp NOT NULL,                     -- created_at + 30 días
    used_at         timestamp NULL,
    sale_id         int4 NULL,
    created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT discount_codes_pkey PRIMARY KEY (id),
    CONSTRAINT discount_codes_code_key UNIQUE (code),
    CONSTRAINT discount_codes_promotion_id_fkey FOREIGN KEY (promotion_id) REFERENCES public.promotions(id)  ON DELETE SET NULL,
    CONSTRAINT discount_codes_customer_id_fkey  FOREIGN KEY (customer_id)  REFERENCES public.customers(id)   ON DELETE SET NULL,
    CONSTRAINT discount_codes_sale_id_fkey      FOREIGN KEY (sale_id)      REFERENCES public.sales(id)       ON DELETE SET NULL
);

-- ─── 4. ROULETTE SPINS (historial de tiros) ──────────────────────────────
CREATE TABLE public.roulette_spins (
    id               serial4 NOT NULL,
    business_id      int4 NOT NULL DEFAULT 1,
    customer_id      int4 NULL,
    promotion_id     int4 NULL,              -- null = sin premio
    discount_code_id int4 NULL,
    result           varchar(20) NOT NULL DEFAULT 'no_prize',  -- 'prize' | 'no_prize'
    spun_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT roulette_spins_pkey PRIMARY KEY (id),
    CONSTRAINT roulette_spins_customer_id_fkey      FOREIGN KEY (customer_id)     REFERENCES public.customers(id)      ON DELETE SET NULL,
    CONSTRAINT roulette_spins_promotion_id_fkey     FOREIGN KEY (promotion_id)    REFERENCES public.promotions(id)     ON DELETE SET NULL,
    CONSTRAINT roulette_spins_discount_code_id_fkey FOREIGN KEY (discount_code_id) REFERENCES public.discount_codes(id) ON DELETE SET NULL
);

-- ─── 5. ALTER sales ───────────────────────────────────────────────────────
-- Asociar una venta a un cliente (opcional)
ALTER TABLE public.sales
    ADD COLUMN IF NOT EXISTS customer_id int4 NULL;

ALTER TABLE public.sales
    ADD CONSTRAINT sales_customer_id_fkey
        FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- ─── 6. ALTER sale_details ────────────────────────────────────────────────
-- promotion_id     → promo detectada automáticamente o aplicada a mano
-- discount_code_id → si se usó un código (ruleta u otro origen)
-- discount_amount  → ahorro calculado en este ítem
-- final_price      → unit_price - discount_amount (guardado para histórico)
ALTER TABLE public.sale_details
    ADD COLUMN IF NOT EXISTS promotion_id     int4 NULL,
    ADD COLUMN IF NOT EXISTS discount_code_id int4 NULL,
    ADD COLUMN IF NOT EXISTS discount_amount  numeric(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS final_price      numeric(12, 2) NULL;

ALTER TABLE public.sale_details
    ADD CONSTRAINT sale_details_promotion_id_fkey
        FOREIGN KEY (promotion_id)     REFERENCES public.promotions(id)     ON DELETE SET NULL,
    ADD CONSTRAINT sale_details_discount_code_id_fkey
        FOREIGN KEY (discount_code_id) REFERENCES public.discount_codes(id) ON DELETE SET NULL;
