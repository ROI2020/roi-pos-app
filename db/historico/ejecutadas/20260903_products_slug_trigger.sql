-- ──────────────────────────────────────────────────────────────────────────────
-- Trigger: genera slug automáticamente en cada INSERT de producto.
--
-- CUÁNDO corre: BEFORE INSERT (el nextval ya fue asignado, NEW.id disponible).
-- CONDICIÓN:    solo si NEW.slug IS NULL — nunca sobreescribe un slug ya seteado.
--
-- LÓGICA:
--   1. Slug base = lowercase(unaccent(name)), solo alfanumérico + guiones.
--   2. Si ese slug ya existe en el mismo business → agrega -<id> (único garantizado).
--   3. Si name es NULL/vacío → deja slug = NULL (no fuerza un slug basura).
--
-- COBERTURA:
--   • app/api/products/route.ts         (alta de físico)
--   • app/api/admin/cj/import/route.ts  (import CJ, solo en INSERT nuevos)
--   • app/api/migrate/import/route.ts   (migración histórica)
--   • Cualquier INSERT futuro sin campo slug
-- ──────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE OR REPLACE FUNCTION generate_product_slug()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  base_slug TEXT;
  candidate  TEXT;
BEGIN
  -- No sobreescribir si ya viene un slug explícito
  IF NEW.slug IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Sin nombre no podemos generar un slug útil
  IF NEW.name IS NULL OR TRIM(NEW.name) = '' THEN
    RETURN NEW;
  END IF;

  -- 1. Slug base: sin acentos, lowercase, solo [a-z0-9-]
  base_slug := LOWER(
    TRIM(BOTH '-' FROM
      REGEXP_REPLACE(
        REGEXP_REPLACE(
          unaccent(TRIM(NEW.name)),
          '[^a-zA-Z0-9\s]', '', 'g'   -- eliminar todo salvo alfanumérico y espacio
        ),
        '\s+', '-', 'g'                -- espacios → guión
      )
    )
  );

  -- Fallback si quedó vacío (ej: nombre todo en caracteres especiales)
  IF base_slug = '' THEN
    base_slug := 'producto';
  END IF;

  candidate := base_slug;

  -- 2. Si el slug base colisiona dentro del mismo negocio, usar base-<id>
  --    NEW.id ya está asignado: nextval() se llama antes del BEFORE trigger.
  IF NEW.business_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM products
    WHERE business_id = NEW.business_id
      AND slug = candidate
  ) THEN
    candidate := base_slug || '-' || NEW.id::text;
  END IF;

  NEW.slug := candidate;
  RETURN NEW;
END;
$$;

-- DROP por si ya existía una versión anterior
DROP TRIGGER IF EXISTS trg_products_slug_insert ON products;

CREATE TRIGGER trg_products_slug_insert
  BEFORE INSERT ON products
  FOR EACH ROW
  EXECUTE FUNCTION generate_product_slug();
