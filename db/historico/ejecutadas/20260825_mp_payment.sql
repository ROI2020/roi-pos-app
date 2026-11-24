-- ─────────────────────────────────────────────────────────────────────────────
-- MercadoPago — Checkout Pro
-- ─────────────────────────────────────────────────────────────────────────────

-- Columna para el costo de envío dentro de la venta (separa producto de logística)
ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS shipping_amount numeric(12,2) NOT NULL DEFAULT 0;

-- Referencia a la Preference de MP creada en el checkout
ALTER TABLE online_orders
  ADD COLUMN IF NOT EXISTS mp_preference_id varchar(100),
  ADD COLUMN IF NOT EXISTS mp_payment_id    varchar(100);

-- Estado nuevo: 'awaiting_payment' — pedido creado, esperando pago de MP
-- (los estados completos: awaiting_payment → pending → confirmed → preparing → shipped → delivered | cancelled)
COMMENT ON COLUMN online_orders.status IS
  'awaiting_payment | pending | confirmed | preparing | shipped | delivered | cancelled';
