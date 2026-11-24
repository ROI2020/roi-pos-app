-- Tracking de última verificación ARCA exitosa
ALTER TABLE facturacion_config
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- business_id en facturas para historial por tenant
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS business_id INTEGER REFERENCES business(id);

-- Índice para historial de factura rápida
CREATE INDEX IF NOT EXISTS idx_facturas_business_created
  ON facturas(business_id, created_at DESC)
  WHERE estado = 'emitida';

-- Índice para facturas por origen_sistema
CREATE INDEX IF NOT EXISTS idx_facturas_origen_sistema
  ON facturas(origen_sistema, business_id, created_at DESC);

-- Plan Factura Rápida (id 10 — fuera del rango de planes ROIPOS 1-4)
INSERT INTO plans (id, name, level, monthly_sales_limit, user_quantity, branch_quantity, price)
VALUES (10, 'Factura Rápida', 0, -1, 1, 0, 0)
ON CONFLICT (id) DO NOTHING;
