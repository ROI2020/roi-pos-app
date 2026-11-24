-- Migration: 20260831_cj_data
-- Almacena el JSON completo de CJ en products para preservar toda la info:
-- galería de imágenes, shipping, atributos extra, etc.
-- También agrega columnas para mantener el markup sin que el sync lo pise.
-- Ejecutar en Supabase SQL Editor.

-- JSON completo del producto CJ (productImages[], description HTML, etc.)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cj_data JSONB;

-- Costo de envío base en USD calculado por getCJFreight (cheapest option).
-- NULL = no calculado aún. 0 = gratis.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cj_shipping_usd NUMERIC(10,2) DEFAULT NULL;

-- Array de opciones de envío CJ (logisticName, freight, isFree, minDeliveryDays, maxDeliveryDays, logisticAging)
-- Se rellena en el import y en sync. NULL = no calculado aún.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cj_freight_options JSONB DEFAULT NULL;

-- Precio de costo CJ en USD (precio del proveedor, sin markup).
-- Se usa en sync para recalcular: base_price = cj_cost_usd * (1 + markup_pct/100)
-- Si es NULL el sync no recalcula el precio (ej: importado antes de esta migration).
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cj_cost_usd NUMERIC(10,2) DEFAULT NULL;

-- Porcentaje de markup aplicado al importar (0 = sin markup).
-- Persiste para que el sync pueda recalcular base_price correctamente sin pisar el margen.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS markup_pct NUMERIC(5,2) DEFAULT 0;

-- Índice GIN para consultas sobre el JSON (productImages, shipping, etc.)
CREATE INDEX IF NOT EXISTS idx_products_cj_data
  ON products USING GIN (cj_data)
  WHERE cj_data IS NOT NULL;
