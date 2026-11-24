-- ============================================================
-- Fix: eliminar constraint UNIQUE(key) single-tenant de settings
-- Fecha: 2026-08-28
--
-- Problema: settings_key_unique UNIQUE(key) impide que dos negocios
-- tengan el mismo key (ej: payment_gateway). La migration del 18/7
-- intentó dropear 'settings_key_key' pero el nombre real es
-- 'settings_key_unique'. El índice compuesto correcto
-- (settings_key_business_id_idx) ya existe.
-- ============================================================

-- 1. Eliminar la constraint single-tenant
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_unique;

-- 2. Confirmar que el índice compuesto correcto existe
CREATE UNIQUE INDEX IF NOT EXISTS settings_key_business_id_idx
  ON settings(key, business_id);

-- Verificación (correr manualmente para confirmar):
-- SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'settings';
