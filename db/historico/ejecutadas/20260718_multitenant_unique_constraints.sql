-- Migración: ajustar unique constraints para aislamiento multi-tenant
-- Ejecutar después del deploy del código que usa business_id en todos los endpoints.
--
-- Las tablas ya tenían la columna business_id (NOT NULL, DEFAULT 1),
-- pero los constraints únicos eran globales. Ahora se vuelven por (campo, business_id).

-- ── settings ────────────────────────────────────────────────────────────────
-- Cada negocio tiene su propio espacio de claves (key).
-- El constraint anterior era UNIQUE(key); ahora es UNIQUE(key, business_id).
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_key;
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_pkey;  -- por si era PK
CREATE UNIQUE INDEX IF NOT EXISTS settings_key_business_id_idx
  ON settings (key, business_id);

-- ── expense_types ────────────────────────────────────────────────────────────
-- Dos negocios pueden tener tipos de gasto con el mismo nombre.
-- El constraint anterior era UNIQUE(name); ahora es UNIQUE(name, business_id).
ALTER TABLE expense_types DROP CONSTRAINT IF EXISTS expense_types_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS expense_types_name_business_id_idx
  ON expense_types (name, business_id);
