-- Agrega 'pending' al CHECK constraint de business_plan.status
--
-- MOTIVO: el formulario de suscripción en roisol.com.ar inserta suscripciones
-- con status='pending' cuando el pago todavía no fue verificado (planes pagos
-- con comprobante de transferencia). El CHECK anterior solo aceptaba:
--   'active' | 'expired' | 'cancelled' | 'trial'
--
-- 'pending' representa: comprobante recibido, pago pendiente de verificación manual.

ALTER TABLE business_plan
  DROP CONSTRAINT IF EXISTS business_plan_status_check;

ALTER TABLE business_plan
  ADD CONSTRAINT business_plan_status_check
  CHECK (status IN ('active', 'expired', 'cancelled', 'trial', 'pending'));
