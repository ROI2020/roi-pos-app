-- Agrega columna slug a products para URLs individuales de producto.
-- Slug generado a partir del name: lowercase, sin acentos (via unaccent),
-- solo alfanumérico + guiones.
--
-- Colisiones: el primer producto (menor id) conserva el slug limpio;
-- los duplicados reciben -<id> al final.
--
-- Índice: UNIQUE (business_id, slug) — permite ON CONFLICT en upserts futuros.

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE products ADD COLUMN IF NOT EXISTS slug VARCHAR(200) DEFAULT NULL;

-- Paso 1: generar slug base desde el name
UPDATE products
SET slug = LOWER(
  TRIM(BOTH '-' FROM
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        unaccent(name),
        '[^a-zA-Z0-9\s]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  )
)
WHERE slug IS NULL AND name IS NOT NULL;

-- Paso 2: resolver colisiones — duplicados dentro del mismo business reciben -<id>
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY business_id, slug ORDER BY id) AS rn
  FROM products
  WHERE slug IS NOT NULL
)
UPDATE products p
SET slug = p.slug || '-' || p.id::text
FROM ranked r
WHERE r.id = p.id AND r.rn > 1;

-- Paso 3: índice único
CREATE UNIQUE INDEX IF NOT EXISTS products_business_slug_uidx
  ON products (business_id, slug)
  WHERE slug IS NOT NULL;
