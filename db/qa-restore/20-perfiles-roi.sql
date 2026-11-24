-- 20-perfiles-roi.sql — Perfil de ROI en QA
-- Se corre automáticamente desde restaurar-qa.ps1 después de 10-adaptar-qa.sql.
-- Idempotente: se puede correr más de una vez sin error.
-- Sin ids fijos: busca por email.

BEGIN;

-- ── 1. Usuario ROI como roisol_admin ────────────────────────────────────────
-- Si ya existe (copia de PROD), lo promueve a roisol_admin y activa.
-- Si no existe, lo crea apuntando al primer negocio activo.
INSERT INTO app_users (email, name, role, business_id, active)
  SELECT
    'ruben.insfran@gmail.com',
    'Rubén Insfrán',
    'roisol_admin',
    (SELECT id FROM business WHERE active_subscription_id IS NOT NULL ORDER BY id LIMIT 1),
    true
  WHERE NOT EXISTS (SELECT 1 FROM app_users WHERE email = 'ruben.insfran@gmail.com');

UPDATE app_users
   SET role   = 'roisol_admin',
       active = true
 WHERE email = 'ruben.insfran@gmail.com'
   AND role <> 'roisol_admin';

-- ── 2. Verificación ─────────────────────────────────────────────────────────
SELECT u.id, u.email, u.role, u.business_id, u.active, b.name AS business_name
  FROM app_users u
  LEFT JOIN business b ON b.id = u.business_id
 WHERE u.email = 'ruben.insfran@gmail.com';

COMMIT;
