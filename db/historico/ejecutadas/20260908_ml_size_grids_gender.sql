-- Agrega columna gender a ml_size_grids para soportar múltiples grids por categoría.
-- Ejemplo: MLA109085 tiene grid distinto para Niñas, Niños y Unisex.
-- La fila existente (Niñas, 7498374) queda con gender='Niñas' por el DEFAULT.

ALTER TABLE ml_size_grids
  ADD COLUMN IF NOT EXISTS gender TEXT NOT NULL DEFAULT 'Niñas';

-- Reemplazar el unique constraint (business_id, category_id) por (business_id, category_id, gender)
DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'ml_size_grids'::regclass
    AND contype = 'u'
    AND array_length(conkey, 1) = 2;   -- unique de 2 columnas = el viejo
  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE ml_size_grids DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

ALTER TABLE ml_size_grids
  ADD CONSTRAINT ml_size_grids_business_category_gender_key
  UNIQUE (business_id, category_id, gender);
