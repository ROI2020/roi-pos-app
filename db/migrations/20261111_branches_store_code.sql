-- S11: agregar store_code a branches para feed de inventario local de Google Merchant Center
ALTER TABLE branches ADD COLUMN IF NOT EXISTS store_code varchar(64) NULL;

COMMENT ON COLUMN branches.store_code IS 'Código de tienda del Perfil de Empresa de Google (Google Business Profile). Solo se exporta al feed de inventario local si está cargado.';
