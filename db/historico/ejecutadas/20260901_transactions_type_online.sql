-- 20260901_transactions_type_online.sql
--
-- Agrega el tipo 'online' al CHECK constraint de transactions.type
-- para identificar movimientos originados en online_orders (tienda web).
--
-- Mapa de type → tabla fuente:
--   'sale'     → ventas        (ventas POS)
--   'online'   → online_orders (pedidos de la tienda)
--   'purchase' → purchases
--   'exchange' → exchanges
--   'expense'  → expenses
--   'transfer' → transfers

ALTER TABLE public.transactions
  DROP CONSTRAINT transactions_type_check;

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_type_check
    CHECK (type IN ('sale', 'online', 'purchase', 'exchange', 'expense', 'transfer'));
