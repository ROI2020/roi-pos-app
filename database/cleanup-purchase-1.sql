-- ═══════════════════════════════════════════════════════════════════
--  CLEANUP: Compra de test ID = 1
--  Borra: compra, detalles, variantes, ventas relacionadas, productos
--
--  PASO 1: Ejecutá el PREVIEW para ver qué se va a borrar
--  PASO 2: Ejecutá el DELETE (dentro de una transacción)
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────
-- PASO 1 — PREVIEW (solo lectura, sin riesgo)
-- ───────────────────────────────────────────────────────────────────

WITH
  pd AS (
    SELECT id, product_id
    FROM purchase_details
    WHERE purchase_id = 1
  ),
  varts AS (
    SELECT pv.id, pv.sku, pv.color, pv.size
    FROM product_variants pv
    WHERE pv.purchase_detail_id IN (SELECT id FROM pd)
  ),
  sale_ids AS (
    SELECT DISTINCT sd.sale_id AS id
    FROM sale_details sd
    WHERE sd.product_variant_id IN (SELECT id FROM varts)
  )
SELECT
  'RESUMEN'                                              AS tipo,
  1::text                                                AS purchase_id,
  (SELECT COUNT(*) FROM pd)::text                        AS purchase_details,
  (SELECT COUNT(*) FROM varts)::text                     AS product_variants,
  (SELECT COUNT(*) FROM sale_ids)::text                  AS ventas_afectadas,
  (SELECT COUNT(*) FROM exchanges
   WHERE returned_variant_id IN (SELECT id FROM varts)
      OR new_variant_id       IN (SELECT id FROM varts))::text AS exchanges,
  (SELECT COUNT(DISTINCT product_id) FROM pd)::text      AS productos
;

-- Ver detalle de variantes que se van a borrar:
-- SELECT pv.id, pv.sku, pv.color, pv.size, pv.barcode
-- FROM product_variants pv
-- JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
-- WHERE pd.purchase_id = 1;

-- Ver ventas afectadas:
-- SELECT s.id, s.sold_at, s.total_amount, s.payment_method
-- FROM sales s
-- JOIN sale_details sd ON sd.sale_id = s.id
-- JOIN product_variants pv ON pv.id = sd.product_variant_id
-- JOIN purchase_details pd ON pd.id = pv.purchase_detail_id
-- WHERE pd.purchase_id = 1;


-- ───────────────────────────────────────────────────────────────────
-- PASO 2 — DELETE (dentro de una transacción)
--          Si algo falla o no te convence → ROLLBACK
-- ───────────────────────────────────────────────────────────────────

BEGIN;

-- Recopilar IDs en tablas temporales
CREATE TEMP TABLE _variants AS
  SELECT pv.id
  FROM   product_variants pv
  JOIN   purchase_details pd ON pd.id = pv.purchase_detail_id
  WHERE  pd.purchase_id = 1;

CREATE TEMP TABLE _sales AS
  SELECT DISTINCT sd.sale_id AS id
  FROM   sale_details sd
  WHERE  sd.product_variant_id IN (SELECT id FROM _variants);

CREATE TEMP TABLE _products AS
  SELECT DISTINCT product_id AS id
  FROM   purchase_details
  WHERE  purchase_id = 1;

-- 1. sale_details  (FK RESTRICT sobre product_variants → borrar primero)
DELETE FROM sale_details
WHERE  product_variant_id IN (SELECT id FROM _variants);

-- 2. exchanges  (FK sin ON DELETE = RESTRICT sobre product_variants)
DELETE FROM exchanges
WHERE  returned_variant_id IN (SELECT id FROM _variants)
    OR new_variant_id       IN (SELECT id FROM _variants);

-- 3. sales  (los sale_details ya no las bloquean)
DELETE FROM sales
WHERE  id IN (SELECT id FROM _sales);

-- 4. branch_inventory  (FK CASCADE, pero explícito por claridad)
DELETE FROM branch_inventory
WHERE  product_variant_id IN (SELECT id FROM _variants);

-- 5. product_variants
DELETE FROM product_variants
WHERE  id IN (SELECT id FROM _variants);

-- 6. purchase  → cascadea purchase_details automáticamente
DELETE FROM purchases
WHERE  id = 1;

-- 7. products  → solo los que ya no tienen ninguna variante
DELETE FROM products
WHERE  id IN (SELECT id FROM _products)
  AND  NOT EXISTS (
         SELECT 1 FROM product_variants pv2
         WHERE  pv2.product_id = products.id
       );

-- Limpiar temporales
DROP TABLE _variants, _sales, _products;

-- Si todo se ve bien:
COMMIT;

-- Si querés cancelar todo en cambio:
-- ROLLBACK;
