-- Tabla de logs de publicaciones en MercadoLibre
-- Guarda el body enviado y la respuesta (o error) de cada createListing.
-- Útil para depurar nuevas categorías y problemas de atributos.

CREATE TABLE IF NOT EXISTS ml_api_logs (
  id            BIGSERIAL    PRIMARY KEY,
  business_id   INT          NOT NULL,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  action        TEXT         NOT NULL DEFAULT 'createListing',
  request_body  JSONB,
  response_body JSONB,
  error         TEXT,
  ml_item_id    TEXT
);

CREATE INDEX IF NOT EXISTS ml_api_logs_business_created
  ON ml_api_logs (business_id, created_at DESC);
