-- ============================================================
-- UNIFICAR DOS PRODUCTOS DUPLICADOS
-- ============================================================
-- Uso: cuando se cargó un producto que ya existía y quedaron
--      dos registros con el mismo nombre en la tabla products.
--
-- Solo dos tablas tienen FK directa a products.id:
--   • product_variants.product_id
--   • purchase_details.product_id
-- Todo lo demás (ventas, stock, etiquetas) referencia
-- product_variant_id y se arrastra automáticamente.
--
-- Reemplazá :keeper_id y :dup_id antes de ejecutar.
-- ============================================================

-- PASO 1 — Encontrar los dos IDs
-- Ejecutar primero para identificar keeper (el más antiguo)
-- y dup (el recién creado por error).
SELECT
  id,
  name,
  created_at,
  base_price,
  (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id) AS variantes,
  (SELECT COUNT(*) FROM purchase_details pd WHERE pd.product_id = p.id) AS compras
FROM products p
WHERE name ILIKE '%nombre del producto%'   -- <-- reemplazar con el nombre real
ORDER BY created_at;


-- ============================================================
-- PASO 2 — Merge (reemplazar KEEPER y DUP con los IDs reales)
-- ============================================================

BEGIN;

-- Reasignar variantes del duplicado al keeper
UPDATE product_variants
SET product_id = KEEPER   -- <-- reemplazar
WHERE product_id = DUP;   -- <-- reemplazar

-- Reasignar líneas de compra del duplicado al keeper
UPDATE purchase_details
SET product_id = KEEPER   -- <-- reemplazar
WHERE product_id = DUP;   -- <-- reemplazar

-- Verificar que no queden referencias al duplicado (deben ser 0+0)
SELECT 'product_variants' AS tabla, COUNT(*) AS refs_restantes
FROM product_variants WHERE product_id = DUP        -- <-- reemplazar
UNION ALL
SELECT 'purchase_details', COUNT(*)
FROM purchase_details WHERE product_id = DUP;       -- <-- reemplazar

-- Si las dos filas muestran 0, continuar con el DELETE
DELETE FROM products WHERE id = DUP;                -- <-- reemplazar

COMMIT;
-- Si algo no se ve bien antes del COMMIT: ROLLBACK;


-- ============================================================
-- PASO 3 — Verificar resultado final
-- ============================================================
SELECT
  p.id,
  p.name,
  p.base_price,
  COUNT(DISTINCT pv.id)  AS total_variantes,
  COUNT(DISTINCT pd.id)  AS lineas_compra,
  COUNT(bi.id)           AS stock_actual,
  COUNT(sd.id)           AS unidades_vendidas
FROM products p
LEFT JOIN product_variants pv ON pv.product_id    = p.id
LEFT JOIN purchase_details pd ON pd.product_id    = p.id
LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
LEFT JOIN sale_details     sd ON sd.product_variant_id = pv.id
WHERE p.id = KEEPER                                -- <-- reemplazar
GROUP BY p.id, p.name, p.base_price;


-- ============================================================
-- OPCIONAL — Corregir base_price si los dos tenían precios distintos
-- ============================================================
-- UPDATE products SET base_price = <precio_correcto> WHERE id = KEEPER;
