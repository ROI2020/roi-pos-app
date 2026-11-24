-- ============================================================
-- Multi-tenant por dominio — ROIPOS / ROISOL
-- Fecha: 2026-07-01
--
-- business.id es serial4 (INTEGER), no UUID.
--
-- ORDEN DE EJECUCIÓN:
--   1. Ejecutar el bloque "PASO 1 — Estructura"
--   2. Editar y ejecutar el bloque "PASO 2 — Datos"
--   3. Ejecutar el bloque "PASO 3 — NOT NULL"
-- ============================================================

-- ── PASO 1: Estructura ────────────────────────────────────────

-- Dominios por negocio (múltiples dominios por cliente)
CREATE TABLE IF NOT EXISTS business_domains (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id INTEGER NOT NULL REFERENCES business(id) ON DELETE CASCADE,
  domain      VARCHAR(253) NOT NULL UNIQUE,
  is_primary  BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Garantiza que haya como máximo un dominio primario por negocio
CREATE UNIQUE INDEX IF NOT EXISTS idx_business_domains_primary
  ON business_domains(business_id)
  WHERE is_primary = true;

CREATE INDEX IF NOT EXISTS idx_business_domains_domain
  ON business_domains(domain);

-- Vincular usuarios con su negocio
ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES business(id);

-- Vincular facturacion_config con el negocio emisor
-- (no cambia el lookup del motor, que sigue siendo por CUIT — esto es solo para el panel ROISOL)
ALTER TABLE facturacion_config
  ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES business(id);

CREATE INDEX IF NOT EXISTS idx_facturacion_config_business
  ON facturacion_config(business_id);

-- ── PASO 2: Migración de datos ────────────────────────────────
-- EDITAR: reemplazar <ID_DEL_NEGOCIO> con el id real (INTEGER) de business
-- Obtenerlo con: SELECT id, name FROM business;

-- UPDATE app_users
--   SET business_id = <ID_DEL_NEGOCIO>
--   WHERE business_id IS NULL;

-- UPDATE facturacion_config
--   SET business_id = <ID_DEL_NEGOCIO>
--   WHERE business_id IS NULL;

-- Dominio inicial (EDITAR slug e id antes de correr)
-- INSERT INTO business_domains (business_id, domain, is_primary)
--   VALUES (<ID_DEL_NEGOCIO>, 'malema.roisol.com.ar', true)
--   ON CONFLICT DO NOTHING;

-- ── PASO 3: NOT NULL (solo después del PASO 2) ────────────────
-- ALTER TABLE app_users
--   ALTER COLUMN business_id SET NOT NULL;

-- ALTER TABLE facturacion_config
--   ALTER COLUMN business_id SET NOT NULL;
