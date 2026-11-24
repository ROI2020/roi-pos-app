-- Agrega long_name a products para guardar el nombre completo de CJ.
-- long_name: nombre crudo de CJ (puede ser largo, hasta 300 chars).
-- name:      nombre curado por el admin (corto, legible en tienda).
--
-- Reglas:
--   - import/sync CJ → actualiza long_name, NUNCA toca name.
--   - El admin puede editar name libremente en el panel.
--   - Si long_name == name o long_name IS NULL → no se muestra por separado en tienda.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS long_name VARCHAR(300) DEFAULT NULL;

-- Poblar long_name con el nombre actual para los productos CJ existentes
-- (así tienen un punto de partida y el admin puede editarlo después).
UPDATE products
SET long_name = name
WHERE cj_pid IS NOT NULL
  AND long_name IS NULL;
