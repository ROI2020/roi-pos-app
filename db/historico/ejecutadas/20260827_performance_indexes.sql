-- ============================================================
-- Migración: Índices de performance — tienda pública + admin
-- Fecha: 2026-08-27
--
-- PRIORIDADES:
--   P0 — Afectan /api/catalog y /api/checkout en cada request
--   P1 — Vistas admin y queries operacionales frecuentes
--   P2 — Columnas FK sin índice (scans de enforcement + JOINs)
--
-- Todos usan IF NOT EXISTS / CONCURRENTLY para poder ejecutarse
-- en producción sin downtime.
-- ============================================================

-- ┌──────────────────────────────────────────────────────────┐
-- │  P0 — CRÍTICOS: tienda pública                          │
-- └──────────────────────────────────────────────────────────┘

-- 1. product_variants.product_id
--    El join más usado en el sistema: catalog, checkout, stock.
--    Sin este índice cada request hace un seq-scan de toda la tabla.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_variants_product
  ON product_variants(product_id);

-- 2. Índice parcial: productos exportables a la web
--    Reemplaza efectivamente a idx_products_business para el catálogo.
--    Solo indexa filas con exportable_web=true → más chico, más rápido.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_web_catalog
  ON products(business_id)
  WHERE exportable_web = true;

-- 3. promotions — tabla sin ningún índice hasta ahora
--    /api/catalog consulta promos activas en cada request.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotions_business_active
  ON promotions(business_id, active, roulette_only);

-- 4. online_order_items.online_order_id
--    Cada vez que se muestra un pedido (confirmación, admin, webhook)
--    se traen los items por este campo. Sin índice: full-scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_order_items_order
  ON online_order_items(online_order_id);

-- ┌──────────────────────────────────────────────────────────┐
-- │  P1 — Admin + operaciones frecuentes                    │
-- └──────────────────────────────────────────────────────────┘

-- 5. online_orders: reemplazar índice de 2 columnas por uno de 3
--    El admin siempre ordena por created_at DESC. El índice anterior
--    dejaba el ORDER BY sin cubrir (in-memory sort de todos los pedidos).
DROP INDEX CONCURRENTLY IF EXISTS idx_online_orders_business_status;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_orders_biz_status_date
  ON online_orders(business_id, status, created_at DESC);

-- 6. online_orders por customer (historial de cliente)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_orders_customer
  ON online_orders(customer_id);

-- 7. customers por business_id
--    La UNIQUE está en (phone, business_id) con phone como leading →
--    listar todos los clientes del negocio hace full-scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_customers_business
  ON customers(business_id);

-- 8. sale_details por sale_id
--    Tickets, reportes y recibos traen los items de una venta.
--    La UNIQUE existente es sobre product_variant_id, no sirve aquí.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_details_sale
  ON sale_details(sale_id);

-- 9. shipments por online_order (tracking, admin pedidos)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipments_online_order
  ON shipments(online_order_id);

-- 10. branch_inventory por branch_id
--     La UNIQUE (product_variant_id, branch_id) tiene variant como
--     leading → filtrar por sucursal sola hace index-scan degradado.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_branch_inventory_branch
  ON branch_inventory(branch_id);

-- ┌──────────────────────────────────────────────────────────┐
-- │  P2 — Columnas FK sin índice                            │
-- │  PostgreSQL NO crea índices automáticos en FKs.         │
-- │  Afectan enforcement y JOINs donde la FK es el inner.  │
-- └──────────────────────────────────────────────────────────┘

-- product_variants
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_product_variants_purchase_detail
  ON product_variants(purchase_detail_id)
  WHERE purchase_detail_id IS NOT NULL;

-- products → dimensiones (tablas chicas pero usadas en JOINs del catálogo)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_category
  ON products(category_id)   WHERE category_id  IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_age_group
  ON products(age_group_id)  WHERE age_group_id  IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_season
  ON products(season_id)     WHERE season_id     IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_products_gender
  ON products(gender_id)     WHERE gender_id     IS NOT NULL;

-- purchase_details
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_details_purchase
  ON purchase_details(purchase_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_purchase_details_product
  ON purchase_details(product_id);

-- promotions → FK de matching en catálogo (filtra promos por categoría/edad/etc.)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotions_category
  ON promotions(category_id)  WHERE category_id  IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotions_age_group
  ON promotions(age_group_id) WHERE age_group_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotions_season
  ON promotions(season_id)    WHERE season_id    IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_promotions_gender
  ON promotions(gender_id)    WHERE gender_id    IS NOT NULL;

-- discount_codes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discount_codes_business
  ON discount_codes(business_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discount_codes_promotion
  ON discount_codes(promotion_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_discount_codes_customer
  ON discount_codes(customer_id)  WHERE customer_id IS NOT NULL;

-- roulette_spins
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roulette_spins_business
  ON roulette_spins(business_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_roulette_spins_customer
  ON roulette_spins(customer_id);

-- sale_details → FK adicionales
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_details_promotion
  ON sale_details(promotion_id)     WHERE promotion_id    IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sale_details_discount_code
  ON sale_details(discount_code_id) WHERE discount_code_id IS NOT NULL;

-- sales → FK frecuentes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_customer
  ON sales(customer_id)    WHERE customer_id  IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_pos_session
  ON sales(pos_session_id) WHERE pos_session_id IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sales_user
  ON sales(user_id);

-- online_order_items → variant lookup
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_online_order_items_variant
  ON online_order_items(product_variant_id);

-- shipping_addresses
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipping_addresses_customer
  ON shipping_addresses(customer_id) WHERE customer_id IS NOT NULL;

-- shipping_rates → para validar que la tarifa pertenece al negocio (checkout)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipping_rates_correo_config
  ON shipping_rates(correo_config_id);

-- shipments → FK adicionales
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipments_correo_config
  ON shipments(correo_config_id)    WHERE correo_config_id    IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shipments_shipping_address
  ON shipments(shipping_address_id) WHERE shipping_address_id IS NOT NULL;
