-- Migration: 20260831_paypal_audit
-- Mejora el control de pagos PayPal:
--   1. Guarda el PayPal Order ID (para búsqueda en panel PayPal)
--   2. Guarda el monto capturado por PayPal (para reconciliación)
--   3. Guarda la moneda capturada por PayPal
-- Ejecutar en Supabase SQL Editor.

-- PayPal Order ID — el ID de la orden PayPal (distinto al capture ID).
-- Permite buscar la transacción directamente en el panel PayPal:
--   https://www.paypal.com/activity/payment/{paypal_order_id}
ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS paypal_order_id varchar(100) DEFAULT NULL;

-- Monto efectivamente capturado por PayPal (en la moneda del pago).
-- Permite detectar discrepancias con el total calculado por la app.
ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS paypal_captured_amount numeric(12,2) DEFAULT NULL;

-- Moneda confirmada por PayPal (debe coincidir con la moneda configurada).
ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS paypal_captured_currency varchar(3) DEFAULT NULL;

-- Índice para búsquedas por paypal_order_id desde el panel admin
CREATE INDEX IF NOT EXISTS idx_online_orders_paypal_order_id
  ON online_orders(paypal_order_id)
  WHERE paypal_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_online_orders_paypal_capture_id
  ON online_orders(paypal_capture_id)
  WHERE paypal_capture_id IS NOT NULL;
