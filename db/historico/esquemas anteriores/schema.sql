-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP SEQUENCE public.age_groups_id_seq;

CREATE SEQUENCE public.age_groups_id_seq
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
-- DROP SEQUENCE public.branch_inventory_id_seq;

CREATE SEQUENCE public.branch_inventory_id_seq
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
-- DROP SEQUENCE public.categories_id_seq;

CREATE SEQUENCE public.categories_id_seq
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
-- DROP SEQUENCE public.exchanges_id_seq;

CREATE SEQUENCE public.exchanges_id_seq
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
-- DROP SEQUENCE public.genders_id_seq;

CREATE SEQUENCE public.genders_id_seq
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
-- DROP SEQUENCE public.pos_sessions_id_seq;

CREATE SEQUENCE public.pos_sessions_id_seq
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
-- DROP SEQUENCE public.purchase_details_id_seq;

CREATE SEQUENCE public.purchase_details_id_seq
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
-- DROP SEQUENCE public.sale_details_id_seq;

CREATE SEQUENCE public.sale_details_id_seq
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
-- DROP SEQUENCE public.seasons_id_seq;

CREATE SEQUENCE public.seasons_id_seq
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
-- DROP SEQUENCE public.suppliers_id_seq;

CREATE SEQUENCE public.suppliers_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- public.age_groups definition

-- Drop table

-- DROP TABLE public.age_groups;

CREATE TABLE public.age_groups (
	id serial4 NOT NULL,
	"name" varchar(50) NOT NULL,
	CONSTRAINT age_groups_name_key UNIQUE (name),
	CONSTRAINT age_groups_pkey PRIMARY KEY (id)
);


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
	CONSTRAINT app_users_email_unique UNIQUE (email),
	CONSTRAINT app_users_pkey PRIMARY KEY (id),
	CONSTRAINT app_users_role_check CHECK (((role)::text = ANY ((ARRAY['vendedor'::character varying, 'encargado'::character varying, 'administrador'::character varying])::text[])))
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
	CONSTRAINT branches_pkey PRIMARY KEY (id)
);


-- public.categories definition

-- Drop table

-- DROP TABLE public.categories;

CREATE TABLE public.categories (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT categories_name_key UNIQUE (name),
	CONSTRAINT categories_pkey PRIMARY KEY (id)
);


-- public.expense_types definition

-- Drop table

-- DROP TABLE public.expense_types;

CREATE TABLE public.expense_types (
	id serial4 NOT NULL,
	"name" varchar(100) NOT NULL,
	active bool DEFAULT true NOT NULL,
	CONSTRAINT expense_types_name_unique UNIQUE (name),
	CONSTRAINT expense_types_pkey PRIMARY KEY (id)
);


-- public.genders definition

-- Drop table

-- DROP TABLE public.genders;

CREATE TABLE public.genders (
	id serial4 NOT NULL,
	"name" varchar(50) NOT NULL,
	CONSTRAINT genders_name_key UNIQUE (name),
	CONSTRAINT genders_pkey PRIMARY KEY (id)
);


-- public.seasons definition

-- Drop table

-- DROP TABLE public.seasons;

CREATE TABLE public.seasons (
	id serial4 NOT NULL,
	"name" varchar(50) NOT NULL,
	CONSTRAINT seasons_name_key UNIQUE (name),
	CONSTRAINT seasons_pkey PRIMARY KEY (id)
);


-- public.settings definition

-- Drop table

-- DROP TABLE public.settings;

CREATE TABLE public.settings (
	id serial4 NOT NULL,
	"key" varchar(100) NOT NULL,
	value text NULL,
	CONSTRAINT settings_key_unique UNIQUE (key),
	CONSTRAINT settings_pkey PRIMARY KEY (id)
);


-- public.suppliers definition

-- Drop table

-- DROP TABLE public.suppliers;

CREATE TABLE public.suppliers (
	id serial4 NOT NULL,
	company_name varchar(150) NOT NULL,
	cuit varchar(15) NULL,
	phone varchar(50) NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT suppliers_cuit_key UNIQUE (cuit),
	CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);


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
	CONSTRAINT pos_sessions_pkey PRIMARY KEY (id),
	CONSTRAINT pos_sessions_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
	CONSTRAINT pos_sessions_closed_by_user_id_fkey FOREIGN KEY (closed_by_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL,
	CONSTRAINT pos_sessions_opened_by_user_id_fkey FOREIGN KEY (opened_by_user_id) REFERENCES public.app_users(id) ON DELETE SET NULL
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
	CONSTRAINT parent_products_pkey PRIMARY KEY (id),
	CONSTRAINT parent_products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT,
	CONSTRAINT products_age_group_id_fkey FOREIGN KEY (age_group_id) REFERENCES public.age_groups(id) ON DELETE SET NULL,
	CONSTRAINT products_gender_id_fkey FOREIGN KEY (gender_id) REFERENCES public.genders(id) ON DELETE SET NULL,
	CONSTRAINT products_season_id_fkey FOREIGN KEY (season_id) REFERENCES public.seasons(id) ON DELETE SET NULL
);


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
	CONSTRAINT purchases_pkey PRIMARY KEY (id),
	CONSTRAINT purchases_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE RESTRICT
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
	user_id int4 NULL,
	sold_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT sales_pkey PRIMARY KEY (id),
	CONSTRAINT sales_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
	CONSTRAINT sales_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL,
	CONSTRAINT sales_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE SET NULL
);


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
	CONSTRAINT daily_expenses_pkey PRIMARY KEY (id),
	CONSTRAINT daily_expenses_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
	CONSTRAINT daily_expenses_expense_type_id_fkey FOREIGN KEY (expense_type_id) REFERENCES public.expense_types(id) ON DELETE SET NULL,
	CONSTRAINT daily_expenses_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL,
	CONSTRAINT daily_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE SET NULL
);


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
	CONSTRAINT purchase_details_pkey PRIMARY KEY (id),
	CONSTRAINT purchase_details_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
	CONSTRAINT purchase_details_purchase_id_fkey FOREIGN KEY (purchase_id) REFERENCES public.purchases(id) ON DELETE CASCADE
);

-- Column comments

COMMENT ON COLUMN public.purchase_details.color IS 'Color del Producto';


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
	CONSTRAINT product_variants_sku_key UNIQUE (sku),
	CONSTRAINT product_variants_parent_product_id_fkey FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
	CONSTRAINT product_variants_purchase_detail_id_fkey FOREIGN KEY (purchase_detail_id) REFERENCES public.purchase_details(id) ON DELETE SET NULL
);


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
	CONSTRAINT sale_details_variant_unique UNIQUE (product_variant_id),
	CONSTRAINT sale_details_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
	CONSTRAINT sale_details_sale_id_fkey FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE
);


-- public.branch_inventory definition

-- Drop table

-- DROP TABLE public.branch_inventory;

CREATE TABLE public.branch_inventory (
	id serial4 NOT NULL,
	product_variant_id int4 NULL,
	branch_id int4 NULL,
	updated_at timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	CONSTRAINT branch_inventory_pkey PRIMARY KEY (id),
	CONSTRAINT unique_variant_per_branch UNIQUE (product_variant_id, branch_id),
	CONSTRAINT branch_inventory_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE,
	CONSTRAINT branch_inventory_product_variant_id_fkey FOREIGN KEY (product_variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE
);


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
	CONSTRAINT exchanges_pkey PRIMARY KEY (id),
	CONSTRAINT exchanges_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES public.branches(id),
	CONSTRAINT exchanges_exchange_sale_id_fkey FOREIGN KEY (exchange_sale_id) REFERENCES public.sales(id) ON DELETE SET NULL,
	CONSTRAINT exchanges_new_variant_id_fkey FOREIGN KEY (new_variant_id) REFERENCES public.product_variants(id),
	CONSTRAINT exchanges_pos_session_id_fkey FOREIGN KEY (pos_session_id) REFERENCES public.pos_sessions(id) ON DELETE SET NULL,
	CONSTRAINT exchanges_returned_variant_id_fkey FOREIGN KEY (returned_variant_id) REFERENCES public.product_variants(id),
	CONSTRAINT exchanges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.app_users(id) ON DELETE SET NULL
);



-- DROP FUNCTION public.uuid_generate_v1();

CREATE OR REPLACE FUNCTION public.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$
;

-- DROP FUNCTION public.uuid_generate_v1mc();

CREATE OR REPLACE FUNCTION public.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$
;

-- DROP FUNCTION public.uuid_generate_v3(uuid, text);

CREATE OR REPLACE FUNCTION public.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$
;

-- DROP FUNCTION public.uuid_generate_v4();

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$
;

-- DROP FUNCTION public.uuid_generate_v5(uuid, text);

CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$
;

-- DROP FUNCTION public.uuid_nil();

CREATE OR REPLACE FUNCTION public.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$
;

-- DROP FUNCTION public.uuid_ns_dns();

CREATE OR REPLACE FUNCTION public.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$
;

-- DROP FUNCTION public.uuid_ns_oid();

CREATE OR REPLACE FUNCTION public.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$
;

-- DROP FUNCTION public.uuid_ns_url();

CREATE OR REPLACE FUNCTION public.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$
;

-- DROP FUNCTION public.uuid_ns_x500();

CREATE OR REPLACE FUNCTION public.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$
;