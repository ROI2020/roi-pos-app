-- Renombrar business.active_plan_id → business.active_subscription_id
--
-- MOTIVO: active_plan_id era confuso porque suena como si apuntara a plans.id,
-- pero en realidad apunta a business_plan.id (el REGISTRO de suscripción activa).
-- El nombre correcto refleja que es un FK al registro de suscripción, no al plan.
--
-- Cadena FK correcta:
--   business.active_subscription_id → business_plan.id → plans.id

ALTER TABLE business
  RENAME COLUMN active_plan_id TO active_subscription_id;
