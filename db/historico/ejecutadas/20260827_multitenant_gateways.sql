-- ============================================================
-- Migración: Multi-tenant gateways de pago + idioma/moneda
-- Fecha: 2026-08-27
-- Requiere: settings table con columna business_id y UNIQUE(key, business_id)
--
-- Cambios:
--   1. Agrega is_secret a settings (protege tokens de pasarelas)
--   2. Agrega claves locale, currency, payment_gateway por negocio
--   3. Agrega claves de credenciales MP y PayPal (vacías — se completan en admin)
-- ============================================================

-- 1. Nueva columna is_secret en settings
--    Los tokens de pasarelas nunca se devuelven al cliente.
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false;

-- Índice para filtrar rápido por negocio + secreto
CREATE INDEX IF NOT EXISTS idx_settings_business_secret
  ON settings(business_id, is_secret);

-- 2. Settings para negocio 1 — MALEMA (ARG · MercadoPago · es-AR · ARS)
INSERT INTO settings (key, value, business_id, is_secret) VALUES
  ('locale',              'es-AR',        1, false),
  ('currency',            'ARS',          1, false),
  ('payment_gateway',     'mercadopago',  1, false),
  ('mp_public_key',       '',             1, false),   -- APP_USR-xxx (pública, va al browser)
  ('mp_access_token',     '',             1, true),    -- 🔒 APP_USR-yyy (NUNCA al cliente)
  ('paypal_client_id',    '',             1, false),   -- reservado (negocio ARG no usa PayPal aún)
  ('paypal_client_secret','',             1, true)     -- 🔒 reservado
ON CONFLICT (key, business_id) DO NOTHING;

-- NOTA: Para el negocio USA (business_id = 2), ejecutar cuando se cree:
--
-- INSERT INTO settings (key, value, business_id, is_secret) VALUES
--   ('locale',              'en-US',   2, false),
--   ('currency',            'USD',     2, false),
--   ('payment_gateway',     'paypal',  2, false),
--   ('paypal_client_id',    '',        2, false),
--   ('paypal_client_secret','',        2, true),
--   ('mp_public_key',       '',        2, false),
--   ('mp_access_token',     '',        2, true)
-- ON CONFLICT (key, business_id) DO NOTHING;
