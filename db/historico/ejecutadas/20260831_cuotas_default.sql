-- Migration: 20260831_cuotas_default
-- Cambia el DEFAULT del campo cuotas en products de 3 a 0.
-- El valor 3 era un default genérico que causaba que productos CJ
-- importados (sin cuotas reales) quedaran con cuotas = 3 incorrectamente.
--
-- Esta migración:
--   1. Cambia el DEFAULT a 0 (sin cuotas) para nuevas inserciones
--   2. Corrige los productos CJ existentes que quedaron con cuotas = 3 por el bug
--
-- Ejecutar en Supabase SQL Editor.

-- 1. Nuevo default para la columna
ALTER TABLE products
  ALTER COLUMN cuotas SET DEFAULT 0;

-- 2. Limpiar productos CJ mal inicializados
--    Solo toca productos con cj_pid (dropshipping) que tengan cuotas = 3,
--    ya que en productos físicos el 3 puede ser intencional.
UPDATE products
SET cuotas = 0
WHERE cj_pid IS NOT NULL
  AND cuotas = 3;
