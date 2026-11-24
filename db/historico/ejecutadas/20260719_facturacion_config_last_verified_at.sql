-- Agregar columna last_verified_at a facturacion_config
-- Usada por /api/arca/verificar (escritura) y /api/factura-rapida/config (lectura)
-- para mostrar el paso 3 de setup y la fecha de última verificación ARCA.
ALTER TABLE facturacion_config
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;
