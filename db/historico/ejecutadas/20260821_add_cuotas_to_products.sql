-- Migration: add cuotas column to products
-- Default: 3 cuotas sin interés
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS cuotas int NOT NULL DEFAULT 3;
