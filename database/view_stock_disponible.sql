-- ============================================================
--  VISTA: v_stock_disponible
--  Stock disponible detallado para análisis con tabla dinámica.
--
--  Unidad de medida: cada fila = 1 combinación única de
--  (proveedor, categoría, edad, temporada, género, producto,
--   color, talle) con su cantidad disponible.
--
--  "Disponible" = está asignado a una sucursal (branch_inventory)
--  y NO fue vendido (sin entrada en sale_details).
--
--  Para ejecutar en Supabase SQL Editor o psql:
--    \i database/view_stock_disponible.sql
-- ============================================================

CREATE OR REPLACE VIEW public.v_stock_disponible AS
SELECT
    COALESCE(sup.company_name, '— Sin proveedor —')  AS proveedor,
    COALESCE(cat.name,         '— Sin categoría —')  AS categoria,
    COALESCE(ag.name,          '— Sin edad —')        AS edad,
    COALESCE(sea.name,         '— Sin temporada —')   AS temporada,
    COALESCE(gen.name,         '— Sin género —')      AS genero,
    p.name                                            AS producto,
    pv.color                                          AS color,
    pv.size                                           AS talle,
    COUNT(bi.id)                                      AS cantidad
FROM public.branch_inventory bi
JOIN public.product_variants  pv  ON pv.id  = bi.product_variant_id
JOIN public.products           p  ON p.id   = pv.product_id
LEFT JOIN public.categories   cat ON cat.id = p.category_id
LEFT JOIN public.age_groups    ag ON ag.id  = p.age_group_id
LEFT JOIN public.seasons       sea ON sea.id = p.season_id
LEFT JOIN public.genders       gen ON gen.id = p.gender_id
LEFT JOIN public.purchase_details pd  ON pd.id  = pv.purchase_detail_id
LEFT JOIN public.purchases        pu  ON pu.id  = pd.purchase_id
LEFT JOIN public.suppliers        sup ON sup.id = pu.supplier_id
WHERE
    -- Excluir unidades ya vendidas
    NOT EXISTS (
        SELECT 1
        FROM public.sale_details sd
        WHERE sd.product_variant_id = pv.id
    )
    -- Excluir unidades entregadas como canje (nuevo artículo en cambio)
    AND NOT EXISTS (
        SELECT 1
        FROM public.exchanges ex
        WHERE ex.new_variant_id = pv.id
    )
GROUP BY
    sup.company_name,
    cat.name,
    ag.name,
    sea.name,
    gen.name,
    p.name,
    pv.color,
    pv.size
ORDER BY
    sup.company_name  NULLS LAST,
    cat.name          NULLS LAST,
    p.name,
    pv.color,
    pv.size;


-- ============================================================
--  QUERY DE EXPORTACIÓN (copiar resultado a Excel / CSV)
--
--  En psql:
--    \COPY (SELECT * FROM v_stock_disponible) TO 'stock.csv' CSV HEADER
--
--  En Supabase SQL Editor:
--    Ejecutar el SELECT, luego botón "Download CSV"
-- ============================================================

-- SELECT * FROM v_stock_disponible;


-- ============================================================
--  VARIANTE: stock por sucursal (si querés ver dónde está
--  cada unidad además del total)
-- ============================================================

CREATE OR REPLACE VIEW public.v_stock_por_sucursal AS
SELECT
    br.name                                           AS sucursal,
    COALESCE(sup.company_name, '— Sin proveedor —')  AS proveedor,
    COALESCE(cat.name,         '— Sin categoría —')  AS categoria,
    COALESCE(ag.name,          '— Sin edad —')        AS edad,
    COALESCE(sea.name,         '— Sin temporada —')   AS temporada,
    COALESCE(gen.name,         '— Sin género —')      AS genero,
    p.name                                            AS producto,
    pv.color                                          AS color,
    pv.size                                           AS talle,
    COUNT(bi.id)                                      AS cantidad
FROM public.branch_inventory bi
JOIN public.branches           br  ON br.id  = bi.branch_id
JOIN public.product_variants  pv  ON pv.id  = bi.product_variant_id
JOIN public.products           p  ON p.id   = pv.product_id
LEFT JOIN public.categories   cat ON cat.id = p.category_id
LEFT JOIN public.age_groups    ag ON ag.id  = p.age_group_id
LEFT JOIN public.seasons       sea ON sea.id = p.season_id
LEFT JOIN public.genders       gen ON gen.id = p.gender_id
LEFT JOIN public.purchase_details pd  ON pd.id  = pv.purchase_detail_id
LEFT JOIN public.purchases        pu  ON pu.id  = pd.purchase_id
LEFT JOIN public.suppliers        sup ON sup.id = pu.supplier_id
WHERE
    NOT EXISTS (
        SELECT 1 FROM public.sale_details sd WHERE sd.product_variant_id = pv.id
    )
    AND NOT EXISTS (
        SELECT 1 FROM public.exchanges ex WHERE ex.new_variant_id = pv.id
    )
GROUP BY
    br.name,
    sup.company_name,
    cat.name,
    ag.name,
    sea.name,
    gen.name,
    p.name,
    pv.color,
    pv.size
ORDER BY
    br.name,
    sup.company_name  NULLS LAST,
    cat.name          NULLS LAST,
    p.name,
    pv.color,
    pv.size;
