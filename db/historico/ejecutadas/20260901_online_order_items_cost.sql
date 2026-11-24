-- Snapshot del costo proveedor al momento del checkout.
-- Mismo patrón que transactions: (unit_cost, cost_currency).
--
-- unit_cost:      precio del proveedor, en la moneda indicada por cost_currency.
--                 Para CJ: valor de products.cj_cost_usd en USD.
--                 Para físicos: NULL (su costo viene de sale_details → purchase_details).
--
-- cost_currency:  ISO 4217 — 'USD' para CJ, NULL para productos físicos.
--
-- Al tener la moneda explícita, el campo sirve para cualquier proveedor futuro
-- (ARS, EUR, etc.) sin cambios de schema.

ALTER TABLE online_order_items
  ADD COLUMN IF NOT EXISTS unit_cost     NUMERIC(10,4) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cost_currency CHAR(3)       DEFAULT NULL;

COMMENT ON COLUMN online_order_items.unit_cost IS
  'Costo unitario del proveedor al momento del checkout. Moneda en cost_currency.';
COMMENT ON COLUMN online_order_items.cost_currency IS
  'ISO 4217 — moneda del unit_cost. NULL si no hay costo disponible.';
