-- Migration: 20260831_store_pages
-- Páginas de contenido por negocio (Shipping Policy, Terms of Service, FAQ, etc.)
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS store_pages (
  id           SERIAL PRIMARY KEY,
  business_id  INTEGER      NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  slug         TEXT         NOT NULL,          -- 'shipping-policy' | 'terms' | 'faq' | etc.
  title        TEXT         NOT NULL,
  content      TEXT         NOT NULL DEFAULT '',  -- HTML (editado por admin)
  is_published BOOLEAN      NOT NULL DEFAULT true,
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (business_id, slug)
);

-- Índice para búsqueda pública (slug + business_id + published)
CREATE INDEX IF NOT EXISTS idx_store_pages_lookup
  ON store_pages (business_id, slug, is_published);

-- Row Level Security: solo el sistema puede modificar; lectura pública para páginas publicadas
ALTER TABLE store_pages ENABLE ROW LEVEL SECURITY;

-- Política: lectura pública de páginas publicadas (la API pública filtra is_published = true)
CREATE POLICY "store_pages_public_read"
  ON store_pages FOR SELECT
  USING (is_published = true);

-- Política: escritura solo por service_role (API routes con pool de servidor)
CREATE POLICY "store_pages_service_write"
  ON store_pages FOR ALL
  USING (true)
  WITH CHECK (true);
