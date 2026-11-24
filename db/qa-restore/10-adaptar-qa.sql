-- 10-adaptar-qa.sql — Adaptar una copia de PROD para QA
-- Se corre automáticamente desde restaurar-qa.ps1 después del pg_restore.
-- Idempotente: se puede correr más de una vez sin error.

BEGIN;

-- ── 1. Dominios: agregar sufijo .qa-off ─────────────────────────────────────
-- domain es UNIQUE; el sufijo los desactiva para que QA no resuelva
-- a los dominios reales de PROD.
UPDATE business_domains
   SET domain = domain || '.qa-off'
 WHERE domain NOT LIKE '%.qa-off';

-- ── 2. Secretos: vaciar todo lo que tenga is_secret = true ──────────────────
-- En ROIPOS los secretos están en texto plano (no cifrados).
-- Vaciar primero por is_secret, después por nombre de clave para cubrir
-- credenciales que podrían no tener is_secret = true.
UPDATE settings
   SET value = ''
 WHERE is_secret = true
   AND COALESCE(value, '') <> '';

-- ── 3. Credenciales por nombre de clave (aunque no sean is_secret) ──────────
-- Incluye todas las listadas en S32 del doc.
UPDATE settings
   SET value = ''
 WHERE key IN (
    -- Mercado Pago
    'mp_access_token', 'mp_public_key',
    -- PayPal
    'paypal_client_id', 'paypal_client_secret',
    -- CJ Dropshipping
    'cj_api_key', 'cj_api_email',
    -- Mercado Libre
    'ml_access_token', 'ml_refresh_token', 'ml_app_secret',
    'ml_app_id', 'ml_user_id', 'ml_token_expires',
    -- Email SMTP
    'email_smtp_user', 'email_smtp_pass',
    -- Correo Argentino
    'correo_argentino',
    -- Catálogo público (no son secretos pero apuntan a PROD)
    'catalog_base_url', 'catalog_ga4_measurement_id',
    'catalog_pinterest_verify'
  )
  AND COALESCE(value, '') <> '';

-- Regenerar catalog_token (token público para cacheo, no es un secreto de API)
UPDATE settings
   SET value = encode(gen_random_bytes(16), 'hex')
 WHERE key = 'catalog_token';

-- ── 4. Flags de seguridad ───────────────────────────────────────────────────
-- Forzar modos seguros para QA
UPDATE settings SET value = 'sandbox'  WHERE key = 'paypal_mode';
UPDATE settings SET value = 'false'    WHERE key = 'cj_auto_fulfill';
UPDATE settings SET value = 'false'    WHERE key = 'ml_enabled';
UPDATE settings SET value = 'false'    WHERE key = 'email_enabled';

-- ── 5. Tokens ARCA ──────────────────────────────────────────────────────────
-- wsaa_tokens guarda tokens firmados para ARCA; no deben quedar de PROD.
DELETE FROM wsaa_tokens;

-- ── 6. Credenciales sueltas por patrón de nombre ────────────────────────────
-- Captura cualquier clave futura que contenga token/secret/key/pass en el nombre
-- y no haya sido vaciada ya.
UPDATE settings
   SET value = ''
 WHERE COALESCE(value, '') <> ''
   AND (
     lower(key) LIKE '%token%'
     OR lower(key) LIKE '%secret%'
     OR lower(key) LIKE '%_key'
     OR lower(key) LIKE '%_pass'
     OR lower(key) LIKE '%password%'
   )
   AND key NOT IN (
     -- Excepciones: no son credenciales externas
     'catalog_token'
   );

-- ── 7. Control final ────────────────────────────────────────────────────────
-- Dominios: todos con .qa-off
SELECT 'dominios' AS check,
       count(*) AS total,
       count(*) FILTER (WHERE domain LIKE '%.qa-off') AS con_sufijo
  FROM business_domains;

-- Volumen de datos
SELECT 'negocios' AS entidad, count(*) AS total FROM business
 UNION ALL
SELECT 'productos', count(*) FROM products
 UNION ALL
SELECT 'ventas', count(*) FROM orders;

-- Credenciales residuales: debe dar 0 filas
SELECT 'ALERTA: credencial no vacía' AS check, business_id, key, left(value, 4) || '***' AS preview
  FROM settings
 WHERE is_secret = true
   AND COALESCE(value, '') <> '';

COMMIT;
