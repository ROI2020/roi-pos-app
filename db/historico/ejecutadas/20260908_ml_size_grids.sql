-- ── Migración: Guías de talles ML por categoría ──────────────────────────────
-- Almacena el SIZE_GRID_ID y el mapeo talle→row_id para cada categoría ML.
-- El descubrimiento se hace leyendo un ítem propio publicado en esa categoría.
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.ml_size_grids (
  id           SERIAL PRIMARY KEY,
  business_id  INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  category_id  VARCHAR(20) NOT NULL,   -- ej: MLA109085
  grid_id      VARCHAR(50) NOT NULL,   -- ej: "7498374"
  -- Mapa talle → row_id completo, ej: {"8":"7498374:3","14":"7498374:6","16":"7498374:7"}
  row_map      JSONB NOT NULL DEFAULT '{}',
  grid_name    VARCHAR(200),           -- nombre descriptivo, ej: "Talle numérico niña argentina"
  discovered_from VARCHAR(20),         -- ml_item_id del ítem usado para el descubrimiento
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, category_id)
);

CREATE INDEX IF NOT EXISTS ml_size_grids_business_cat_idx
  ON ml_size_grids (business_id, category_id);

CREATE OR REPLACE FUNCTION update_ml_size_grids_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER ml_size_grids_updated_at
  BEFORE UPDATE ON ml_size_grids
  FOR EACH ROW EXECUTE FUNCTION update_ml_size_grids_updated_at();

-- Migrar el grid ya conocido para el negocio que lo descubrió
-- (ROI_2012 business_id=1, MLA109085, grid 7498374 con talles 4–16 niña argentina)
INSERT INTO public.ml_size_grids
  (business_id, category_id, grid_id, row_map, grid_name, discovered_from)
VALUES
  (1, 'MLA109085', '7498374',
   '{"4":"7498374:1","6":"7498374:2","8":"7498374:3","10":"7498374:4","12":"7498374:5","14":"7498374:6","16":"7498374:7"}',
   'Talle numérico niña argentina',
   'MLA3928256458')
ON CONFLICT (business_id, category_id) DO NOTHING;
