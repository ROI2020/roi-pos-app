-- Concepto AFIP por cliente: 1=productos, 2=servicios, 3=productos y servicios
ALTER TABLE facturacion_config
  ADD COLUMN IF NOT EXISTS concepto smallint NOT NULL DEFAULT 1;

-- Actualizar registros ROIFAR existentes a concepto=2
UPDATE facturacion_config fc
SET concepto = 2
FROM business b
JOIN business_plan bp ON bp.id = b.active_subscription_id
JOIN plans p           ON p.id = bp.plan_id
WHERE fc.business_id = b.id
  AND p.product = 'roifar'
  AND fc.concepto = 1;
