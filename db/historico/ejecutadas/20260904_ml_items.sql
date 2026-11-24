-- ── Migración: Integración MercadoLibre ──────────────────────────────────────
-- Tabla que vincula productos/variantes de ROIPOS con publicaciones de ML.
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.ml_items (
  id                  SERIAL PRIMARY KEY,
  business_id         INTEGER NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  product_id          INTEGER NOT NULL REFERENCES products(id)   ON DELETE CASCADE,
  product_variant_id  INTEGER REFERENCES product_variants(id)    ON DELETE CASCADE,
  ml_item_id          VARCHAR(20)  NOT NULL,   -- ej: MLA1234567890
  ml_variation_id     BIGINT,                  -- ID de variante en ML (null si sin variantes)
  ml_status           VARCHAR(20)  NOT NULL DEFAULT 'active',
                                               -- active | paused | closed | error
  last_sync_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Un producto_variant_id solo puede estar vinculado a una publicación ML por negocio
CREATE UNIQUE INDEX IF NOT EXISTS ml_items_variant_business_uidx
  ON ml_items (product_variant_id, business_id)
  WHERE product_variant_id IS NOT NULL;

-- Para buscar rápido por ml_item_id al recibir webhooks
CREATE INDEX IF NOT EXISTS ml_items_ml_item_id_idx ON ml_items (ml_item_id);
CREATE INDEX IF NOT EXISTS ml_items_business_id_idx ON ml_items (business_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION update_ml_items_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER ml_items_updated_at
  BEFORE UPDATE ON ml_items
  FOR EACH ROW EXECUTE FUNCTION update_ml_items_updated_at();

-- ── Settings que se usan (documentación, no DDL) ──────────────────────────────
-- Los siguientes settings se guardan en la tabla `settings` por negocio:
--
-- PÚBLICOS (is_secret = false):
--   ml_enabled       'true' | 'false'
--   ml_app_id        App ID de la aplicación en developers.mercadolibre.com
--   ml_user_id       ID del vendedor en ML (obtenido en el OAuth inicial)
--   ml_token_expires ISO 8601 — cuándo vence el access_token
--
-- SECRETOS (is_secret = true):
--   ml_app_secret    Secret Key de la aplicación ML
--   ml_access_token  Token de acceso (vence en ~6 horas)
--   ml_refresh_token Token de refresco (vence en ~6 meses)
