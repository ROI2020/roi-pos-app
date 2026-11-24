-- Agrega long_name a categories.
-- Mismo patrón que products.long_name:
--   name      = nombre curado por el admin (visible en admin, no se pisa en syncs)
--   long_name = nombre original/fuente (CJ categoryName, importación, etc.)
--
-- Después de correr esto, long_name queda como copia inicial de name en categorías existentes.
-- El import de CJ que auto-crea categorías asignará long_name = categoryName de CJ.

ALTER TABLE categories ADD COLUMN IF NOT EXISTS long_name VARCHAR(300) DEFAULT NULL;

-- Seed: long_name = name en registros existentes (punto de partida)
UPDATE categories SET long_name = name WHERE long_name IS NULL;
