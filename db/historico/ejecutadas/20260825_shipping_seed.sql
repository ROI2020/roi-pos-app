-- ─────────────────────────────────────────────────────────────────────────────
-- Seed de tarifas de envío — Correo Argentino (tarifas planas, hasta 1 kg)
--
-- correo_config ya tiene un registro (insertado en la migración base).
-- Solo lo activamos y le ponemos agreement placeholder.
-- Cuando llegue el mail de PAQ.AR: UPDATE correo_config SET agreement = 'TUCODIGO'
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Activar el carrier (environment = 'prod', max 4 chars)
UPDATE correo_config
SET    agreement   = 'PEND',
       environment = 'prod',
       active      = true
WHERE  business_id = 1 AND carrier = 'correo_argentino';

-- 2. Insertar tarifas usando el id del correo_config existente
INSERT INTO shipping_rates
  (correo_config_id, zone_name, state_codes, delivery_type, display_label, price, active)
SELECT
  cc.id,
  v.zone_name,
  v.state_codes,
  v.delivery_type,
  v.display_label,
  v.price::numeric,
  true
FROM correo_config cc
CROSS JOIN (VALUES
  (
    'CABA',
    ARRAY['C'],
    'homeDelivery',
    'Envío a domicilio CABA — 2 a 5 días hábiles',
    9900
  ),
  (
    'GBA',
    ARRAY['B'],
    'homeDelivery',
    'Envío a domicilio GBA — 2 a 5 días hábiles',
    15000
  ),
  (
    'Interior',
    ARRAY['K','X','W','H','U','E','P','Y','L','F','M','N','Q','R','A','J','D','Z','S','G','V','T'],
    'homeDelivery',
    'Envío a domicilio Interior — 2 a 5 días hábiles',
    20000
  ),
  (
    'Express AMBA',
    ARRAY['C','B'],
    'homeDelivery',
    'Envío express AMBA — 1 día hábil',
    29900
  )
) AS v(zone_name, state_codes, delivery_type, display_label, price)
WHERE cc.business_id = 1 AND carrier = 'correo_argentino';
