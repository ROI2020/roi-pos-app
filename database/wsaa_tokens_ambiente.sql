-- Migración: agregar `ambiente` a wsaa_tokens para separar cache homo/prod
-- Ejecutar en producción ANTES de deployar el código que usa ON CONFLICT (cuit, service, ambiente)

-- 1. Agregar columna (safe, idempotente)
ALTER TABLE wsaa_tokens ADD COLUMN IF NOT EXISTS ambiente VARCHAR(4) NOT NULL DEFAULT 'homo';

-- 2. Marcar todos los tokens existentes como inactivos para forzar renovación
--    (no sabemos si eran homo o prod, es más seguro dejar que expiren solos o forzar)
UPDATE wsaa_tokens SET activo = false;

-- 3. Reemplazar el índice único (cuit, service) por (cuit, service, ambiente)
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Buscar y eliminar la constraint existente sobre (cuit, service)
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'wsaa_tokens'::regclass
    AND contype = 'u'
  LIMIT 1;

  IF constraint_name IS NOT NULL THEN
    EXECUTE 'ALTER TABLE wsaa_tokens DROP CONSTRAINT ' || quote_ident(constraint_name);
  END IF;
END $$;

-- 4. Crear el nuevo índice único incluyendo ambiente
CREATE UNIQUE INDEX IF NOT EXISTS wsaa_tokens_cuit_service_ambiente_idx
  ON wsaa_tokens (cuit, service, ambiente);
