-- Agrega los campos type y budget a expense_types para el cálculo del Punto de Equilibrio.
-- type:   'fijo' = costo fijo mensual (alquiler, sueldos, etc.)
--         'variable' = costo que varía con las ventas (comisiones, packaging, etc.)
-- budget: importe estimado mensual en pesos

ALTER TABLE expense_types
  ADD COLUMN IF NOT EXISTS type    VARCHAR(10)    NOT NULL DEFAULT 'fijo'
    CHECK (type IN ('fijo', 'variable')),
  ADD COLUMN IF NOT EXISTS budget  NUMERIC(12, 2) NOT NULL DEFAULT 0;
