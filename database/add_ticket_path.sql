-- Agrega columna ticket_path a facturas para cachear el PDF de ticket 80mm
ALTER TABLE facturas
  ADD COLUMN IF NOT EXISTS ticket_path VARCHAR(500);
