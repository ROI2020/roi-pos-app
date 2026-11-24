-- ─────────────────────────────────────────────────────────────────────────────
-- PayPal — columnas en online_orders + doc de settings
-- Ejecutar en Supabase ANTES de activar el gateway PayPal en producción.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columna payment_method en online_orders
--    Permite distinguir órdenes MP ('mercadopago') de órdenes PayPal ('paypal').
ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS payment_method varchar(30) NULL;

COMMENT ON COLUMN online_orders.payment_method IS
  'Pasarela de pago: mercadopago | paypal | null (órdenes antiguas)';

-- 2. Columna paypal_capture_id
--    Guarda el ID de la captura de PayPal (CAPTURE COMPLETED).
--    Separada de mp_payment_id para no mezclar identifiers de distintas pasarelas.
ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS paypal_capture_id varchar(100) NULL;

COMMENT ON COLUMN online_orders.paypal_capture_id IS
  'ID de captura de PayPal (purchase_units[0].payments.captures[0].id)';



-- Insertar settings para el negocio US:
INSERT INTO settings (business_id, key, value, is_secret) VALUES
  (<bid>, 'payment_gateway',     'paypal',   false),
  (<bid>, 'paypal_client_id',    'AXxx...',  false),
  (<bid>, 'paypal_mode',         'sandbox',  false),
  (<bid>, 'paypal_client_secret','EHxx...',  true);


-- ─────────────────────────────────────────────────────────────────────────────
-- Settings de negocio para PayPal
-- Insertar en la tabla settings con is_secret según corresponda.
--
-- Claves PÚBLICAS (is_secret = false) — devueltas por /api/tienda/config:
--   payment_gateway  : 'paypal'
--   paypal_client_id : 'AXxx...'   (Client ID de la app PayPal)
--   paypal_mode      : 'sandbox' | 'live'
--
-- Clave SECRETA (is_secret = true) — solo server-side:
--   paypal_client_secret : 'EHxx...'
--
-- Para insertar (reemplazar <business_id> con el ID del negocio US):
-- INSERT INTO settings (business_id, key, value, is_secret)
-- VALUES
--   (<business_id>, 'payment_gateway',     'paypal',   false),
--   (<business_id>, 'paypal_client_id',    'AXxx...',  false),
--   (<business_id>, 'paypal_mode',         'sandbox',  false),
--   (<business_id>, 'paypal_client_secret','EHxx...',  true)
-- ON CONFLICT (business_id, key) DO UPDATE SET value = EXCLUDED.value;
-- ─────────────────────────────────────────────────────────────────────────────
