-- Migración: columna roulette_only en promotions
-- Fecha: 2026-08-07
-- Propósito: Permite marcar una promoción como "exclusiva de la ruleta".
--            Estas promos no aparecen en el POS (auto-aplicación) ni en la Tienda.

ALTER TABLE promotions
  ADD COLUMN IF NOT EXISTS roulette_only BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN promotions.roulette_only IS
  'true = la promo solo se usa en la ruleta (no aplica en POS ni Tienda automáticamente)';
