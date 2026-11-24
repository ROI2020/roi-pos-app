-- Actualiza el precio de venta de todos los productos DS (dropshipping CJ)
-- Fórmula: base_price = CEILING(cj_cost_usd * 2.5 * 10) / 10
-- Ejemplo:  costo = 24,55  →  24,55 × 2,5 = 61,375  →  techo a 1 decimal = 61,4
--
-- También actualiza markup_pct = 150 (factor 2,5 = 150% de markup sobre costo).
-- Solo toca productos con cj_pid IS NOT NULL y cj_cost_usd > 0.
--
-- ① PRIMERO revisar la preview — no modifica nada.
-- ② Luego ejecutar el UPDATE (bloque más abajo).

-- ══════════════════════════════════════════════════════════════════════════════
-- ① PREVIEW: qué va a cambiar
-- ══════════════════════════════════════════════════════════════════════════════
SELECT
  p.id,
  p.name,
  p.cj_cost_usd::numeric(10,4)                           AS costo_usd,
  p.base_price::numeric(10,2)                            AS precio_actual,
  (CEILING(p.cj_cost_usd * 2.5 * 10) / 10)::numeric(10,1) AS precio_nuevo,
  p.markup_pct                                           AS markup_actual,
  150                                                    AS markup_nuevo
FROM products p
WHERE p.cj_pid IS NOT NULL
  AND p.cj_cost_usd IS NOT NULL
  AND p.cj_cost_usd > 0
ORDER BY p.cj_cost_usd DESC;

-- ══════════════════════════════════════════════════════════════════════════════
-- ② UPDATE: ejecutar solo si el preview se ve bien
-- ══════════════════════════════════════════════════════════════════════════════
/*
UPDATE products
SET
  base_price = CEILING(cj_cost_usd * 2.5 * 10) / 10,
  markup_pct = 150
WHERE cj_pid IS NOT NULL
  AND cj_cost_usd IS NOT NULL
  AND cj_cost_usd > 0;
*/

-- Verificación post-update (descomentar después de correr el UPDATE):
/*
SELECT
  id, name,
  cj_cost_usd::numeric(10,4) AS costo_usd,
  base_price::numeric(10,2)  AS precio_venta,
  markup_pct
FROM products
WHERE cj_pid IS NOT NULL
  AND cj_cost_usd IS NOT NULL
ORDER BY cj_cost_usd DESC;
*/
