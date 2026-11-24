-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP SEQUENCE public.accounts_id_seq;

CREATE SEQUENCE public.accounts_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.age_groups_id_seq;

CREATE SEQUENCE public.age_groups_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.age_groups_id_seq1;

CREATE SEQUENCE public.age_groups_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.app_users_id_seq;

CREATE SEQUENCE public.app_users_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.app_users_id_seq1;

CREATE SEQUENCE public.app_users_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.branch_inventory_id_seq;

CREATE SEQUENCE public.branch_inventory_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.branch_inventory_id_seq1;

CREATE SEQUENCE public.branch_inventory_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.branches_id_seq;

CREATE SEQUENCE public.branches_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.branches_id_seq1;

CREATE SEQUENCE public.branches_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.business_id_seq;

CREATE SEQUENCE public.business_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.business_plan_id_seq;

CREATE SEQUENCE public.business_plan_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.cash_transfers_id_seq;

CREATE SEQUENCE public.cash_transfers_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.categories_id_seq;

CREATE SEQUENCE public.categories_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.categories_id_seq1;

CREATE SEQUENCE public.categories_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.daily_expenses_id_seq;

CREATE SEQUENCE public.daily_expenses_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.daily_expenses_id_seq1;

CREATE SEQUENCE public.daily_expenses_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.exchanges_id_seq;

CREATE SEQUENCE public.exchanges_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.exchanges_id_seq1;

CREATE SEQUENCE public.exchanges_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.expense_types_id_seq;

CREATE SEQUENCE public.expense_types_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.expense_types_id_seq1;

CREATE SEQUENCE public.expense_types_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.fops_id_seq;

CREATE SEQUENCE public.fops_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.functionalities_id_seq;

CREATE SEQUENCE public.functionalities_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.genders_id_seq;

CREATE SEQUENCE public.genders_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.genders_id_seq1;

CREATE SEQUENCE public.genders_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.parent_products_id_seq;

CREATE SEQUENCE public.parent_products_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.plans_id_seq;

CREATE SEQUENCE public.plans_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.pos_sessions_id_seq;

CREATE SEQUENCE public.pos_sessions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.pos_sessions_id_seq1;

CREATE SEQUENCE public.pos_sessions_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.product_variants_id_seq;

CREATE SEQUENCE public.product_variants_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.product_variants_id_seq1;

CREATE SEQUENCE public.product_variants_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.products_id_seq;

CREATE SEQUENCE public.products_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.purchase_details_id_seq;

CREATE SEQUENCE public.purchase_details_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.purchase_details_id_seq1;

CREATE SEQUENCE public.purchase_details_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.purchases_id_seq;

CREATE SEQUENCE public.purchases_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.purchases_id_seq1;

CREATE SEQUENCE public.purchases_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sale_details_id_seq;

CREATE SEQUENCE public.sale_details_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sale_details_id_seq1;

CREATE SEQUENCE public.sale_details_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sales_id_seq;

CREATE SEQUENCE public.sales_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.sales_id_seq1;

CREATE SEQUENCE public.sales_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.seasons_id_seq;

CREATE SEQUENCE public.seasons_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.seasons_id_seq1;

CREATE SEQUENCE public.seasons_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.settings_id_seq;

CREATE SEQUENCE public.settings_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.settings_id_seq1;

CREATE SEQUENCE public.settings_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.stock_snapshots_id_seq;

CREATE SEQUENCE public.stock_snapshots_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.suppliers_id_seq;

CREATE SEQUENCE public.suppliers_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.suppliers_id_seq1;

CREATE SEQUENCE public.suppliers_id_seq1
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.transactions_id_seq;

CREATE SEQUENCE public.transactions_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- public.functionalities definition

-- Drop table

-- DROP TABLE public.functionalities;

CREATE TABLE public.functionalities (
	id serial4 NOT NULL,
	"name" varchar(150) NOT NULL,
	function_code varchar(100) NOT NULL,
	category varchar(50) DEFAULT 'general'::character varying NOT NULL,
	description text NULL,
	min_plan_level int4 DEFAULT 1 NOT NULL,
	display_mode varchar(10) DEFAULT 'hidden'::character varying NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	CONSTRAINT functionalities_display_mode_check CHECK (((display_mode)::text = ANY ((ARRAY['hidden'::character varying, 'locked'::character varying])::text[]))),
	CONSTRAINT functionalities_function_code_key UNIQUE (function_code),
	CONSTRAINT functionalities_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_functionalities_code ON public.functionalities USING btree (function_code);
CREATE INDEX idx_functionalities_level ON public.functionalities USING btree (min_plan_level);


-- public."plans" definition

-- Drop table

-- DROP TABLE public."plans";

CREATE TABLE public."plans" (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	"level" int4 NOT NULL,
	monthly_sales_limit int4 NOT NULL,
	user_quantity int4 NOT NULL,
	branch_quantity int4 NOT NULL,
	price numeric(10, 2) DEFAULT 0 NOT NULL,
	last_update timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	product varchar(20) DEFAULT 'roipos'::character varying NOT NULL,
	CONSTRAINT plans_level_check CHECK (((level >= 1) AND (level <= 10))),
	CONSTRAINT plans_level_product_key UNIQUE (level, product),
	CONSTRAINT plans_pkey PRIMARY KEY (id)
);


-- public.wsaa_tokens definition

-- Drop table

-- DROP TABLE public.wsaa_tokens;

CREATE TABLE public.wsaa_tokens (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	cuit varchar(13) NOT NULL,
	service varchar(50) DEFAULT 'wsfe'::character varying NOT NULL,
	"token" text NOT NULL,
	sign text NOT NULL,
	generation_time timestamptz NOT NULL,
	expiration_time timestamptz NOT NULL,
	activo bool DEFAULT true NOT NULL,
	ambiente varchar(4) DEFAULT 'homo'::character varying NOT NULL,
	CONSTRAINT wsaa_tokens_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_wsaa_cuit ON public.wsaa_tokens USING btree (cuit, service);
CREATE UNIQUE INDEX wsaa_tokens_cuit_service_ambiente_idx ON public.wsaa_tokens USING btree (cuit, service, ambiente);


-- public.accounts definition

-- Drop table

-- DROP TABLE public.accounts;

CREATE TABLE public.accounts (
	id serial4 NOT NULL,
	business_id int4 NOT NULL,
	branch_id int4 NULL,
	"name" varchar NOT NULL,
	"type" varchar NOT NULL,
	currency varchar DEFAULT 'ARS'::character varying NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT accounts_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_accounts_branch ON public.accounts USING btree (branch_id);
CREATE INDEX idx_accounts_business ON public.accounts USING btree (business_id);


-- public.age_groups definition

-- Drop table

-- DROP TABLE public.age_groups;

CREATE TABLE public.age_groups (
	id serial4 NOT NULL,
	"name" varchar(50) NOT NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT age_groups_name_key UNIQUE (name),
	CONSTRAINT age_groups_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_age_groups_business ON public.age_groups USING btree (business_id);


-- public.app_users definition

-- Drop table

-- DROP TABLE public.app_users;

CREATE TABLE public.app_users (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	email varchar(150) NOT NULL,
	"role" varchar(20) DEFAULT 'vendedor'::character varying NOT NULL,
	active bool DEFAULT true NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	avatar_url text NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT app_users_email_unique UNIQUE (email),
	CONSTRAINT app_users_pkey PRIMARY KEY (id),
	CONSTRAINT app_users_role_check CHECK (((role)::text = ANY (ARRAY['vendedor'::text, 'encargado'::text, 'administrador'::text, 'roisol_admin'::text])))
);
CREATE INDEX idx_app_users_business ON public.app_users USING btree (business_id);


-- public.branch_inventory definition

-- Drop table

-- DROP TABLE public.branch_inventory;

CREATE TABLE public.branch_inventory (
	id serial4 NOT NULL,
	product_variant_id int4 NULL,
	branch_id int4 NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT branch_inventory_pkey PRIMARY KEY (id),
	CONSTRAINT unique_variant_per_branch UNIQUE (product_variant_id, branch_id)
);


-- public.branches definition

-- Drop table

-- DROP TABLE public.branches;

CREATE TABLE public.branches (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	address varchar(255) NULL,
	arca_pos_number int4 NOT NULL,
	mercadopago_store_id varchar(50) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	is_default bool DEFAULT false NOT NULL,
	cuit_emisor varchar(13) NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT branches_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_branches_business ON public.branches USING btree (business_id);


-- public.business definition

-- Drop table

-- DROP TABLE public.business;

CREATE TABLE public.business (
	id serial4 NOT NULL,
	"name" varchar NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	active_subscription_id int4 NULL,
	CONSTRAINT business_pkey PRIMARY KEY (id)
);


-- public.business_domains definition

-- Drop table

-- DROP TABLE public.business_domains;

CREATE TABLE public.business_domains (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	business_id int4 NOT NULL,
	"domain" varchar(253) NOT NULL,
	is_primary bool DEFAULT false NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	CONSTRAINT business_domains_domain_key UNIQUE (domain),
	CONSTRAINT business_domains_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_business_domains_domain ON public.business_domains USING btree (domain);
CREATE UNIQUE INDEX idx_business_domains_primary ON public.business_domains USING btree (business_id) WHERE (is_primary = true);


-- public.business_plan definition

-- Drop table

-- DROP TABLE public.business_plan;

CREATE TABLE public.business_plan (
	id serial4 NOT NULL,
	business_id int4 NOT NULL,
	plan_id int4 NOT NULL,
	status varchar(20) DEFAULT 'active'::character varying NOT NULL,
	payment_method varchar(20) NULL,
	amount_paid numeric(10, 2) NULL,
	payment_reference varchar(255) NULL,
	paid_by_user_id int4 NULL,
	valid_from date DEFAULT CURRENT_DATE NOT NULL,
	valid_until date NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	product varchar(20) DEFAULT 'roipos'::character varying NOT NULL,
	comprobante_url text NULL,
	CONSTRAINT business_plan_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['transfer'::character varying, 'mp'::character varying, 'cash'::character varying, 'manual'::character varying])::text[]))),
	CONSTRAINT business_plan_pkey PRIMARY KEY (id),
	CONSTRAINT business_plan_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'expired'::character varying, 'cancelled'::character varying, 'trial'::character varying])::text[])))
);
CREATE INDEX idx_business_plan_business ON public.business_plan USING btree (business_id);
CREATE INDEX idx_business_plan_product ON public.business_plan USING btree (product);
CREATE INDEX idx_business_plan_status ON public.business_plan USING btree (status);

-- Table Triggers

create trigger set_updated_at_business_plan before
update
    on
    public.business_plan for each row execute function trg_set_updated_at();


-- public.cash_transfers definition

-- Drop table

-- DROP TABLE public.cash_transfers;

CREATE TABLE public.cash_transfers (
	id serial4 NOT NULL,
	pos_session_id int4 NULL,
	from_branch_id int4 NOT NULL,
	amount numeric(12, 2) NOT NULL,
	notes text NULL,
	user_id int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT cash_transfers_amount_check CHECK ((amount > (0)::numeric)),
	CONSTRAINT cash_transfers_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_cash_transfers_business ON public.cash_transfers USING btree (business_id);


-- public.categories definition

-- Drop table

-- DROP TABLE public.categories;

CREATE TABLE public.categories (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT categories_name_key UNIQUE (name),
	CONSTRAINT categories_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_categories_business ON public.categories USING btree (business_id);


-- public.daily_expenses definition

-- Drop table

-- DROP TABLE public.daily_expenses;

CREATE TABLE public.daily_expenses (
	id serial4 NOT NULL,
	pos_session_id int4 NULL,
	branch_id int4 NOT NULL,
	user_id int4 NULL,
	expense_type_id int4 NULL,
	description text NULL,
	amount numeric(12, 2) NOT NULL,
	payment_method varchar(30) DEFAULT 'efectivo'::character varying NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT daily_expenses_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_daily_expenses_business ON public.daily_expenses USING btree (business_id);


-- public.exchanges definition

-- Drop table

-- DROP TABLE public.exchanges;

CREATE TABLE public.exchanges (
	id serial4 NOT NULL,
	exchange_sale_id int4 NULL,
	branch_id int4 NOT NULL,
	pos_session_id int4 NULL,
	user_id int4 NULL,
	returned_variant_id int4 NOT NULL,
	new_variant_id int4 NOT NULL,
	returned_price numeric(12, 2) NOT NULL,
	new_price numeric(12, 2) NOT NULL,
	difference_amount numeric(12, 2) NOT NULL,
	payment_method varchar(30) NULL,
	notes text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT exchanges_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_exchanges_business ON public.exchanges USING btree (business_id);


-- public.expense_types definition

-- Drop table

-- DROP TABLE public.expense_types;

CREATE TABLE public.expense_types (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	active bool DEFAULT true NOT NULL,
	"type" varchar(10) DEFAULT 'fijo'::character varying NOT NULL,
	budget numeric(12, 2) DEFAULT 0 NOT NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT expense_types_name_unique UNIQUE (name),
	CONSTRAINT expense_types_pkey PRIMARY KEY (id),
	CONSTRAINT expense_types_type_check CHECK (((type)::text = ANY ((ARRAY['fijo'::character varying, 'variable'::character varying])::text[])))
);
CREATE UNIQUE INDEX expense_types_name_business_id_idx ON public.expense_types USING btree (name, business_id);
CREATE INDEX idx_expense_types_business ON public.expense_types USING btree (business_id);


-- public.facturacion_config definition

-- Drop table

-- DROP TABLE public.facturacion_config;

CREATE TABLE public.facturacion_config (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	cuit varchar(13) NOT NULL,
	punto_venta int4 NOT NULL,
	razon_social varchar(200) NOT NULL,
	condicion_iva varchar(30) DEFAULT 'monotributo'::character varying NOT NULL,
	ambiente varchar(4) DEFAULT 'homo'::character varying NOT NULL,
	activo bool DEFAULT true NOT NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	business_id int4 NOT NULL,
	last_verified_at timestamptz NULL,
	concepto int2 DEFAULT 1 NOT NULL,
	CONSTRAINT facturacion_config_ambiente_check CHECK (((ambiente)::text = ANY ((ARRAY['homo'::character varying, 'prod'::character varying])::text[]))),
	CONSTRAINT facturacion_config_cuit_key UNIQUE (cuit),
	CONSTRAINT facturacion_config_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_facturacion_config_business ON public.facturacion_config USING btree (business_id);


-- public.facturas definition

-- Drop table

-- DROP TABLE public.facturas;

CREATE TABLE public.facturas (
	id uuid DEFAULT gen_random_uuid() NOT NULL,
	venta_id varchar(200) NULL,
	origen_sistema varchar(30) DEFAULT 'roipos'::character varying NOT NULL,
	cuit_emisor varchar(13) NOT NULL,
	punto_venta int4 NOT NULL,
	tipo_cbte int4 DEFAULT 11 NOT NULL,
	nro_comprobante int4 NOT NULL,
	fecha_cbte date NOT NULL,
	cae varchar(20) NULL,
	cae_vto date NULL,
	importe_total numeric(12, 2) NOT NULL,
	receptor_cuit varchar(13) NULL,
	receptor_nombre varchar(200) NULL,
	estado varchar(20) DEFAULT 'pendiente'::character varying NOT NULL,
	error_detalle text NULL,
	pdf_path varchar(500) NULL,
	raw_request jsonb NULL,
	raw_response jsonb NULL,
	created_at timestamptz DEFAULT now() NOT NULL,
	ticket_path varchar(500) NULL,
	business_id int4 NULL,
	CONSTRAINT facturas_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'emitida'::character varying, 'error'::character varying])::text[]))),
	CONSTRAINT facturas_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_facturas_business_created ON public.facturas USING btree (business_id, created_at DESC) WHERE ((estado)::text = 'emitida'::text);
CREATE INDEX idx_facturas_cuit ON public.facturas USING btree (cuit_emisor);
CREATE INDEX idx_facturas_origen_sistema ON public.facturas USING btree (origen_sistema, business_id, created_at DESC);
CREATE INDEX idx_facturas_venta ON public.facturas USING btree (venta_id);


-- public.fops definition

-- Drop table

-- DROP TABLE public.fops;

CREATE TABLE public.fops (
	id serial4 NOT NULL,
	account_id int4 NOT NULL,
	"name" varchar NOT NULL,
	use_for_sales bool DEFAULT true NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT fops_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_fops_account ON public.fops USING btree (account_id);


-- public.genders definition

-- Drop table

-- DROP TABLE public.genders;

CREATE TABLE public.genders (
	id serial4 NOT NULL,
	"name" varchar(50) NOT NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT genders_name_key UNIQUE (name),
	CONSTRAINT genders_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_genders_business ON public.genders USING btree (business_id);


-- public.pos_sessions definition

-- Drop table

-- DROP TABLE public.pos_sessions;

CREATE TABLE public.pos_sessions (
	id serial4 NOT NULL,
	branch_id int4 NOT NULL,
	opening_balance numeric(12, 2) DEFAULT 0 NOT NULL,
	closing_balance numeric(12, 2) NULL,
	opened_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	closed_at timestamp NULL,
	notes text NULL,
	opened_by_user_id int4 NULL,
	closed_by_user_id int4 NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT pos_sessions_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_pos_sessions_business ON public.pos_sessions USING btree (business_id);


-- public.product_variants definition

-- Drop table

-- DROP TABLE public.product_variants;

CREATE TABLE public.product_variants (
	id serial4 NOT NULL,
	product_id int4 NULL,
	sku varchar(100) NOT NULL,
	color varchar(50) NOT NULL,
	"size" varchar(50) NOT NULL,
	barcode varchar(100) NULL,
	specific_image_url text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	purchase_detail_id int4 NULL,
	label_printed_at timestamp NULL,
	CONSTRAINT product_variants_barcode_key UNIQUE (barcode),
	CONSTRAINT product_variants_pkey PRIMARY KEY (id),
	CONSTRAINT product_variants_sku_key UNIQUE (sku)
);


-- public.products definition

-- Drop table

-- DROP TABLE public.products;

CREATE TABLE public.products (
	id serial4 NOT NULL,
	category_id int4 NULL,
	"name" varchar(150) NOT NULL,
	description text NULL,
	base_price numeric(12, 2) DEFAULT 0.00 NOT NULL,
	general_image_url text NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	age_group_id int4 NULL,
	season_id int4 NULL,
	gender_id int4 NULL,
	photo_url text NULL,
	exportable_whatsapp bool DEFAULT false NOT NULL,
	exportable_instagram bool DEFAULT false NOT NULL,
	exportable_facebook bool DEFAULT false NOT NULL,
	exportable_web bool DEFAULT false NOT NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT parent_products_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_products_business ON public.products USING btree (business_id);


-- public.purchase_details definition

-- Drop table

-- DROP TABLE public.purchase_details;

CREATE TABLE public.purchase_details (
	id serial4 NOT NULL,
	purchase_id int4 NULL,
	product_id int4 NULL,
	unit_cost numeric(12, 2) NOT NULL,
	color varchar NULL, -- Color del Producto
	curva int4 NULL,
	curva_sizes varchar NULL,
	quantity int4 NULL,
	CONSTRAINT purchase_details_pkey PRIMARY KEY (id)
);

-- Column comments

COMMENT ON COLUMN public.purchase_details.color IS 'Color del Producto';


-- public.purchases definition

-- Drop table

-- DROP TABLE public.purchases;

CREATE TABLE public.purchases (
	id serial4 NOT NULL,
	supplier_id int4 NULL,
	total_amount numeric(12, 2) NOT NULL,
	invoice_number varchar(50) NULL,
	purchase_date timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	title varchar(200) NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT purchases_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_purchases_business ON public.purchases USING btree (business_id);


-- public.sale_details definition

-- Drop table

-- DROP TABLE public.sale_details;

CREATE TABLE public.sale_details (
	id serial4 NOT NULL,
	sale_id int4 NOT NULL,
	product_variant_id int4 NOT NULL,
	unit_price numeric(12, 2) NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT sale_details_pkey PRIMARY KEY (id),
	CONSTRAINT sale_details_variant_unique UNIQUE (product_variant_id)
);


-- public.sales definition

-- Drop table

-- DROP TABLE public.sales;

CREATE TABLE public.sales (
	id serial4 NOT NULL,
	branch_id int4 NOT NULL,
	pos_session_id int4 NULL,
	invoice_number varchar(50) NULL,
	subtotal numeric(12, 2) NOT NULL,
	discount_amount numeric(12, 2) DEFAULT 0 NOT NULL,
	total_amount numeric(12, 2) NOT NULL,
	payment_method varchar(30) NOT NULL,
	mp_payment_id varchar(100) NULL,
	arca_cae varchar(50) NULL,
	arca_vto_cae date NULL,
	notes text NULL,
	sold_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	user_id int4 NULL,
	payment_split jsonb NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT sales_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_sales_arca_cae ON public.sales USING btree (arca_cae) WHERE (arca_cae IS NOT NULL);
CREATE INDEX idx_sales_branch_sold ON public.sales USING btree (branch_id, sold_at);
CREATE INDEX idx_sales_business ON public.sales USING btree (business_id);


-- public.seasons definition

-- Drop table

-- DROP TABLE public.seasons;

CREATE TABLE public.seasons (
	id serial4 NOT NULL,
	"name" varchar(50) NOT NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT seasons_name_key UNIQUE (name),
	CONSTRAINT seasons_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_seasons_business ON public.seasons USING btree (business_id);


-- public.settings definition

-- Drop table

-- DROP TABLE public.settings;

CREATE TABLE public.settings (
	id serial4 NOT NULL,
	"key" varchar(100) NOT NULL,
	value text NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT settings_key_unique UNIQUE (key)
);
CREATE INDEX idx_settings_business ON public.settings USING btree (business_id);
CREATE UNIQUE INDEX settings_key_business_id_idx ON public.settings USING btree (key, business_id);


-- public.stock_snapshots definition

-- Drop table

-- DROP TABLE public.stock_snapshots;

CREATE TABLE public.stock_snapshots (
	id serial4 NOT NULL,
	snapshot_date date NOT NULL,
	branch_id int4 NOT NULL,
	stock_units int4 DEFAULT 0 NOT NULL,
	sold_units int4 DEFAULT 0 NOT NULL,
	stock_cost numeric(12, 2) DEFAULT 0 NOT NULL,
	stock_list_price numeric(12, 2) DEFAULT 0 NOT NULL,
	daily_sales numeric(12, 2) DEFAULT 0 NOT NULL,
	pos_session_id int4 NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT stock_snapshots_pkey PRIMARY KEY (id),
	CONSTRAINT uq_snapshot_branch_date UNIQUE (snapshot_date, branch_id)
);
CREATE INDEX idx_stock_snapshots_business ON public.stock_snapshots USING btree (business_id);


-- public.suppliers definition

-- Drop table

-- DROP TABLE public.suppliers;

CREATE TABLE public.suppliers (
	id serial4 NOT NULL,
	company_name varchar(150) NOT NULL,
	cuit varchar(15) NULL,
	phone varchar(50) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	business_id int4 DEFAULT 1 NOT NULL,
	CONSTRAINT suppliers_cuit_key UNIQUE (cuit),
	CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);
CREATE INDEX idx_suppliers_business ON public.suppliers USING btree (business_id);


-- public.transactions definition

-- Drop table

-- DROP TABLE public.transactions;

CREATE TABLE public.transactions (
	id serial4 NOT NULL,
	business_id int4 NOT NULL,
	branch_id int4 NULL,
	fop_id int4 NOT NULL,
	"type" varchar NOT NULL,
	type_id int4 NOT NULL,
	currency varchar DEFAULT 'ARS'::character varying NOT NULL,
	amount numeric(12, 2) NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT transactions_pkey PRIMARY KEY (id),
	CONSTRAINT transactions_type_check CHECK (((type)::text = ANY ((ARRAY['sale'::character varying, 'purchase'::character varying, 'exchange'::character varying, 'expense'::character varying, 'transfer'::character varying])::text[])))
);
CREATE INDEX idx_transactions_business ON public.transactions USING btree (business_id);
CREATE INDEX idx_transactions_fop ON public.transactions USING btree (fop_id);
CREATE INDEX idx_transactions_type ON public.transactions USING btree (type, type_id);


-- public.accounts foreign keys

ALTER TABLE public.accounts ADD CONSTRAINT accounts_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.accounts ADD CONSTRAINT accounts_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.age_groups foreign keys

ALTER TABLE public.age_groups ADD CONSTRAINT age_groups_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.app_users foreign keys

ALTER TABLE public.app_users ADD CONSTRAINT app_users_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.branch_inventory foreign keys

ALTER TABLE public.branch_inventory ADD CONSTRAINT branch_inventory_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.branch_inventory ADD CONSTRAINT branch_inventory_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;


-- public.branches foreign keys

ALTER TABLE public.branches ADD CONSTRAINT branches_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.business foreign keys

ALTER TABLE public.business ADD CONSTRAINT business_active_plan_id_fkey FOREIGN KEY (active_subscription_id) REFERENCES public.business_plan(id);


-- public.business_domains foreign keys

ALTER TABLE public.business_domains ADD CONSTRAINT business_domains_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id) ON DELETE CASCADE;


-- public.business_plan foreign keys

ALTER TABLE public.business_plan ADD CONSTRAINT business_plan_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.business_plan ADD CONSTRAINT business_plan_paid_by_user_id_fkey FOREIGN KEY (paid_by_user_id) REFERENCES public.app_users(id);
ALTER TABLE public.business_plan ADD CONSTRAINT business_plan_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public."plans"(id);


-- public.cash_transfers foreign keys

ALTER TABLE public.cash_transfers ADD CONSTRAINT cash_transfers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.cash_transfers ADD CONSTRAINT cash_transfers_from_branch_id_fkey FOREIGN KEY (from_branch_id) REFERENCES public.branches(id);
ALTER TABLE public.cash_transfers ADD CONSTRAINT cash_transfers_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.cash_transfers ADD CONSTRAINT cash_transfers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


-- public.categories foreign keys

ALTER TABLE public.categories ADD CONSTRAINT categories_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.daily_expenses foreign keys

ALTER TABLE public.daily_expenses ADD CONSTRAINT daily_expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.daily_expenses ADD CONSTRAINT daily_expenses_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.daily_expenses ADD CONSTRAINT daily_expenses_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES public.expense_types(id) ON DELETE SET NULL;
ALTER TABLE public.daily_expenses ADD CONSTRAINT daily_expenses_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.daily_expenses ADD CONSTRAINT daily_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


-- public.exchanges foreign keys

ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_exchange_sale_id_fkey FOREIGN KEY (exchange_sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_new_variant_id_fkey FOREIGN KEY (new_variant_id) REFERENCES public.product_variants(id);
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_returned_variant_id_fkey FOREIGN KEY (returned_variant_id) REFERENCES public.product_variants(id);
ALTER TABLE public.exchanges ADD CONSTRAINT exchanges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


-- public.expense_types foreign keys

ALTER TABLE public.expense_types ADD CONSTRAINT expense_types_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.facturacion_config foreign keys

ALTER TABLE public.facturacion_config ADD CONSTRAINT facturacion_config_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.facturas foreign keys

ALTER TABLE public.facturas ADD CONSTRAINT facturas_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.fops foreign keys

ALTER TABLE public.fops ADD CONSTRAINT fops_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);


-- public.genders foreign keys

ALTER TABLE public.genders ADD CONSTRAINT genders_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.pos_sessions foreign keys

ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;
ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_sessions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_sessions_closed_by_user_id_fkey FOREIGN KEY (closed_by_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;
ALTER TABLE public.pos_sessions ADD CONSTRAINT pos_sessions_opened_by_user_id_fkey FOREIGN KEY (opened_by_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL;


-- public.product_variants foreign keys

ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_parent_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;
ALTER TABLE public.product_variants ADD CONSTRAINT product_variants_purchase_detail_id_fkey FOREIGN KEY (purchase_detail_id) REFERENCES public.purchase_details(id) ON DELETE SET NULL;


-- public.products foreign keys

ALTER TABLE public.products ADD CONSTRAINT parent_products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;
ALTER TABLE public.products ADD CONSTRAINT products_age_group_id_fkey FOREIGN KEY (age_group_id) REFERENCES public.age_groups(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.products ADD CONSTRAINT products_gender_id_fkey FOREIGN KEY (gender_id) REFERENCES public.genders(id) ON DELETE SET NULL;
ALTER TABLE public.products ADD CONSTRAINT products_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE SET NULL;


-- public.purchase_details foreign keys

ALTER TABLE public.purchase_details ADD CONSTRAINT purchase_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;
ALTER TABLE public.purchase_details ADD CONSTRAINT purchase_details_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE;


-- public.purchases foreign keys

ALTER TABLE public.purchases ADD CONSTRAINT purchases_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.purchases ADD CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT;


-- public.sale_details foreign keys

ALTER TABLE public.sale_details ADD CONSTRAINT sale_details_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;
ALTER TABLE public.sale_details ADD CONSTRAINT sale_details_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;


-- public.sales foreign keys

ALTER TABLE public.sales ADD CONSTRAINT sales_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;
ALTER TABLE public.sales ADD CONSTRAINT sales_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.sales ADD CONSTRAINT sales_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;
ALTER TABLE public.sales ADD CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id);


-- public.seasons foreign keys

ALTER TABLE public.seasons ADD CONSTRAINT seasons_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.settings foreign keys

ALTER TABLE public.settings ADD CONSTRAINT settings_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.stock_snapshots foreign keys

ALTER TABLE public.stock_snapshots ADD CONSTRAINT stock_snapshots_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;
ALTER TABLE public.stock_snapshots ADD CONSTRAINT stock_snapshots_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.stock_snapshots ADD CONSTRAINT stock_snapshots_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL;


-- public.suppliers foreign keys

ALTER TABLE public.suppliers ADD CONSTRAINT suppliers_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);


-- public.transactions foreign keys

ALTER TABLE public.transactions ADD CONSTRAINT transactions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_business_id_fkey FOREIGN KEY (business_id) REFERENCES public.business(id);
ALTER TABLE public.transactions ADD CONSTRAINT transactions_fop_id_fkey FOREIGN KEY (fop_id) REFERENCES public.fops(id);


-- public.v_stock_disponible source

CREATE OR REPLACE VIEW public.v_stock_disponible
AS SELECT COALESCE(sup.company_name, '— Sin proveedor —'::character varying) AS proveedor,
    COALESCE(cat.name, '— Sin categoría —'::character varying) AS categoria,
    COALESCE(ag.name, '— Sin edad —'::character varying) AS edad,
    COALESCE(sea.name, '— Sin temporada —'::character varying) AS temporada,
    COALESCE(gen.name, '— Sin género —'::character varying) AS genero,
    p.name AS producto,
    pv.color,
    pv.size AS talle,
    count(bi.id) AS cantidad
   FROM branch_inventory bi
     JOIN product_variants pv ON pv.id = bi.product_variant_id
     JOIN products p ON p.id = pv.product_id
     LEFT JOIN categories cat ON cat.id = p.category_id
     LEFT JOIN age_groups ag ON ag.id = p.age_group_id
     LEFT JOIN seasons sea ON sea.id = p.season_id
     LEFT JOIN genders gen ON gen.id = p.gender_id
     LEFT JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
     LEFT JOIN purchases pu ON pu.id = pd.purchase_id
     LEFT JOIN suppliers sup ON sup.id = pu.supplier_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM sale_details sd
          WHERE sd.product_variant_id = pv.id)) AND NOT (EXISTS ( SELECT 1
           FROM exchanges ex
          WHERE ex.new_variant_id = pv.id))
  GROUP BY sup.company_name, cat.name, ag.name, sea.name, gen.name, p.name, pv.color, pv.size
  ORDER BY sup.company_name, cat.name, p.name, pv.color, pv.size;


-- public.v_stock_por_sucursal source

CREATE OR REPLACE VIEW public.v_stock_por_sucursal
AS SELECT br.name AS sucursal,
    COALESCE(sup.company_name, '— Sin proveedor —'::character varying) AS proveedor,
    COALESCE(cat.name, '— Sin categoría —'::character varying) AS categoria,
    COALESCE(ag.name, '— Sin edad —'::character varying) AS edad,
    COALESCE(sea.name, '— Sin temporada —'::character varying) AS temporada,
    COALESCE(gen.name, '— Sin género —'::character varying) AS genero,
    p.name AS producto,
    pv.color,
    pv.size AS talle,
    count(bi.id) AS cantidad
   FROM branch_inventory bi
     JOIN branches br ON br.id = bi.branch_id
     JOIN product_variants pv ON pv.id = bi.product_variant_id
     JOIN products p ON p.id = pv.product_id
     LEFT JOIN categories cat ON cat.id = p.category_id
     LEFT JOIN age_groups ag ON ag.id = p.age_group_id
     LEFT JOIN seasons sea ON sea.id = p.season_id
     LEFT JOIN genders gen ON gen.id = p.gender_id
     LEFT JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
     LEFT JOIN purchases pu ON pu.id = pd.purchase_id
     LEFT JOIN suppliers sup ON sup.id = pu.supplier_id
  WHERE NOT (EXISTS ( SELECT 1
           FROM sale_details sd
          WHERE sd.product_variant_id = pv.id)) AND NOT (EXISTS ( SELECT 1
           FROM exchanges ex
          WHERE ex.new_variant_id = pv.id))
  GROUP BY br.name, sup.company_name, cat.name, ag.name, sea.name, gen.name, p.name, pv.color, pv.size
  ORDER BY br.name, sup.company_name, cat.name, p.name, pv.color, pv.size;



-- DROP FUNCTION public.trg_set_updated_at();

CREATE OR REPLACE FUNCTION public.trg_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$
;