-- ============================================================
-- Módulo de facturación ARCA — ROIPOS (Modelo B: cert ROISOL)
-- Fecha: 2026-07-01
--
-- Modelo B: ROISOL tiene un único certificado (cargado en env vars).
-- Los clientes delegan el servicio wsfe a ROISOL en el portal ARCA.
-- La tabla facturacion_config NO almacena certificados.
-- ============================================================

-- Configuración por empresa emisora (multi-tenant: un row por CUIT)
CREATE TABLE IF NOT EXISTS facturacion_config (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit          VARCHAR(13) NOT NULL UNIQUE,  -- formato XX-XXXXXXXX-X
  punto_venta   INTEGER NOT NULL,
  razon_social  VARCHAR(200) NOT NULL,
  condicion_iva VARCHAR(30) NOT NULL DEFAULT 'monotributo',
  ambiente      VARCHAR(4) NOT NULL DEFAULT 'homo' CHECK (ambiente IN ('homo','prod')),
  activo        BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cada comprobante emitido
CREATE TABLE IF NOT EXISTS facturas (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id         VARCHAR(200),          -- ID origen (puede ser de cualquier sistema)
  origen_sistema   VARCHAR(30) NOT NULL DEFAULT 'roipos',
  cuit_emisor      VARCHAR(13) NOT NULL,
  punto_venta      INTEGER NOT NULL,
  tipo_cbte        INTEGER NOT NULL DEFAULT 11,  -- 11 = Factura B
  nro_comprobante  INTEGER NOT NULL,
  fecha_cbte       DATE NOT NULL,
  cae              VARCHAR(20),
  cae_vto          DATE,
  importe_total    NUMERIC(12,2) NOT NULL,
  receptor_cuit    VARCHAR(13),
  receptor_nombre  VARCHAR(200),
  estado           VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','emitida','error')),
  error_detalle    TEXT,
  pdf_path         VARCHAR(500),
  raw_request      JSONB,
  raw_response     JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cache del token WSAA (evita autenticar en cada factura)
-- cuit = CUIT del cliente (el titular del servicio delegado, no el de ROISOL)
-- El certificado que firma el TRA es siempre el de ROISOL (env vars)
CREATE TABLE IF NOT EXISTS wsaa_tokens (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cuit             VARCHAR(13) NOT NULL,
  service          VARCHAR(50) NOT NULL DEFAULT 'wsfe',
  token            TEXT NOT NULL,
  sign             TEXT NOT NULL,
  generation_time  TIMESTAMPTZ NOT NULL,
  expiration_time  TIMESTAMPTZ NOT NULL,
  activo           BOOLEAN NOT NULL DEFAULT true,
  UNIQUE(cuit, service)
);

CREATE INDEX IF NOT EXISTS idx_facturas_venta ON facturas(venta_id);
CREATE INDEX IF NOT EXISTS idx_facturas_cuit  ON facturas(cuit_emisor);
CREATE INDEX IF NOT EXISTS idx_wsaa_cuit      ON wsaa_tokens(cuit, service);

-- Vincular cada sucursal con su CUIT emisor ARCA.
-- Join doble: branches.cuit_emisor = facturacion_config.cuit
--             branches.arca_pos_number = facturacion_config.punto_venta
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS cuit_emisor    VARCHAR(13);
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS arca_pos_number INTEGER;
