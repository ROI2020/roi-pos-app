-- Fotos adicionales de producto por color
-- Una foto por color (UNIQUE en product_id + color).
-- color NULL = foto general (fallback cuando no hay foto del color seleccionado).

CREATE TABLE IF NOT EXISTS product_images (
  id          SERIAL       PRIMARY KEY,
  product_id  INT          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  color       VARCHAR(100) NULL,       -- NULL = foto general del producto
  sort_order  SMALLINT     NOT NULL DEFAULT 0,
  photo_url   TEXT         NOT NULL,   -- base64 data URL (igual que products.photo_url)
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS product_images_product_id_idx
  ON product_images(product_id);

-- Garantiza 1 foto por color por producto
CREATE UNIQUE INDEX IF NOT EXISTS product_images_product_color_uidx
  ON product_images(product_id, color)
  WHERE color IS NOT NULL;
