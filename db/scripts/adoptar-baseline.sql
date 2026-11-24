-- adoptar-baseline.sql — Para que ROI corra UNA VEZ en PROD (y en QA si no viene de la copia)
-- Registra la baseline en schema_migrations para que db/migrate.mjs no la vuelva a aplicar.
-- Después de esto, npm run migrate aplica solo las migraciones nuevas.
--
-- Uso:
--   1. Hacer backup de PROD (scripts/backup-prod.ps1)
--   2. Correr este script con psql -v ON_ERROR_STOP=1 -f db/scripts/adoptar-baseline.sql
--   3. Verificar el resultado y hacer COMMIT manualmente

-- ── (a) Diagnóstico ─────────────────────────────────────────────────────────
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'business'
) AS business_existe;

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
   WHERE table_schema = 'public' AND table_name = 'schema_migrations'
) AS schema_migrations_existe;

-- ── (b) Crear tabla y registrar baseline ────────────────────────────────────
BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  version    text        PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version)
  VALUES ('000_baseline_20261124.sql')
  ON CONFLICT DO NOTHING;

-- ── (c) Verificación ────────────────────────────────────────────────────────
SELECT * FROM schema_migrations ORDER BY version;

-- ⚠ NO HAY COMMIT: ROI decide COMMIT o ROLLBACK después de verificar.
-- Para confirmar: COMMIT;
