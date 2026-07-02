-- ============================================================
-- ROIPOS — Sistema de planes y control de funcionalidades
-- Migración idempotente: se puede ejecutar N veces sin romper nada
-- ============================================================

-- ── 1. Tabla plans ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plans (
  id                   SERIAL PRIMARY KEY,
  name                 VARCHAR(100) NOT NULL,
  level                INTEGER      NOT NULL UNIQUE CHECK (level BETWEEN 1 AND 10),
  monthly_sales_limit  INTEGER      NOT NULL,         -- techo de ventas por mes
  user_quantity        INTEGER      NOT NULL,         -- -1 = ilimitado
  branch_quantity      INTEGER      NOT NULL,         -- -1 = ilimitado
  price                DECIMAL(10,2) NOT NULL DEFAULT 0,
  last_update          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. Tabla functionalities ────────────────────────────────
CREATE TABLE IF NOT EXISTS functionalities (
  id              SERIAL PRIMARY KEY,
  name            VARCHAR(150) NOT NULL,
  function_code   VARCHAR(100) NOT NULL UNIQUE,  -- ej: 'kpi.daily_sales'
  category        VARCHAR(50)  NOT NULL DEFAULT 'general',
  description     TEXT,
  min_plan_level  INTEGER      NOT NULL DEFAULT 1,  -- validado en app, sin FK para permitir edición en GUI
  display_mode    VARCHAR(10)  NOT NULL DEFAULT 'hidden'
                    CHECK (display_mode IN ('hidden', 'locked')),
  is_active       BOOLEAN      NOT NULL DEFAULT true
);

-- ── 3. Tabla business_plan (historial de facturación) ───────
CREATE TABLE IF NOT EXISTS business_plan (
  id                  SERIAL PRIMARY KEY,
  business_id         INTEGER      NOT NULL REFERENCES business(id),
  plan_id             INTEGER      NOT NULL REFERENCES plans(id),
  status              VARCHAR(20)  NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'expired', 'cancelled', 'trial')),
  payment_method      VARCHAR(20)  CHECK (payment_method IN ('transfer', 'mp', 'cash', 'manual')),
  amount_paid         DECIMAL(10,2),
  payment_reference   VARCHAR(255),                 -- nro. transferencia / ID MP
  paid_by_user_id     INTEGER      REFERENCES app_users(id),
  valid_from          DATE         NOT NULL DEFAULT CURRENT_DATE,
  valid_until         DATE         NOT NULL,
  created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Trigger para updated_at automático en business_plan
CREATE OR REPLACE FUNCTION trg_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_business_plan ON business_plan;
CREATE TRIGGER set_updated_at_business_plan
  BEFORE UPDATE ON business_plan
  FOR EACH ROW EXECUTE FUNCTION trg_set_updated_at();

-- ── 4. Agregar active_plan_id a business ────────────────────
ALTER TABLE business ADD COLUMN IF NOT EXISTS
  active_plan_id INTEGER REFERENCES business_plan(id);

-- ── 5. Índices ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_functionalities_code    ON functionalities(function_code);
CREATE INDEX IF NOT EXISTS idx_functionalities_level   ON functionalities(min_plan_level);
CREATE INDEX IF NOT EXISTS idx_business_plan_business  ON business_plan(business_id);
CREATE INDEX IF NOT EXISTS idx_business_plan_status    ON business_plan(status);

-- ============================================================
-- SEED — Planes
-- ON CONFLICT (level) DO UPDATE para que los precios se puedan actualizar
-- ============================================================
INSERT INTO plans (name, level, monthly_sales_limit, user_quantity, branch_quantity, price)
VALUES
  ('Showroom',      1,    50,   1,  1,      0.00),
  ('Boutique',      2,   300,   3,  1,  14900.00),
  ('Tendencia',     3,  1000,  -1,  2,  29900.00),
  ('Tendencia Pro', 4,  5000,  -1,  3,  54900.00)
ON CONFLICT (level) DO UPDATE
  SET name                = EXCLUDED.name,
      monthly_sales_limit = EXCLUDED.monthly_sales_limit,
      user_quantity       = EXCLUDED.user_quantity,
      branch_quantity     = EXCLUDED.branch_quantity,
      price               = EXCLUDED.price,
      last_update         = CURRENT_TIMESTAMP;

-- ============================================================
-- SEED — Funcionalidades
-- ON CONFLICT (function_code) DO UPDATE: sincroniza con los valores locales
-- Agregar nuevas features es tan simple como agregar una fila acá
-- ============================================================
INSERT INTO functionalities (name, function_code, category, description, min_plan_level, display_mode)
VALUES

  -- POS
  ('Registrar Venta',           'pos.sale',              'pos',          'Pantalla de cobro y registro de venta',                                       1, 'hidden'),
  ('Registrar Cambio',          'pos.exchange',          'pos',          'Devolución e intercambio de productos',                                       1, 'hidden'),
  ('Registrar Compra',          'pos.purchase',          'pos',          'Compras e Ingreso de mercadería a stock',                                     1, 'hidden'),
  ('Imprimir Tickets',          'pos.ticket_print',      'pos',          'Impresión de Tickets',                                                        1, 'hidden'),
  ('Imprimir Etiquetas',        'pos.label_print',       'pos',          'Etiquetas con código de barras',                                              2, 'locked'),

  -- Productos
  ('Gestión de Productos',      'products.manage',       'products',     'CRUD completo de productos',                                                  1, 'hidden'),
  ('Variantes (Talle/Color)',   'products.variants',     'products',     'Productos con talle y color',                                                 1, 'hidden'),
  ('Búsqueda por Código',       'products.barcode',      'products',     'Búsqueda por código de barras',                                               1, 'hidden'),

  -- Stock
  ('Ver Stock',                 'stock.view',            'stock',        'Consulta de inventario actual',                                               1, 'hidden'),
  ('Alerta Stock Bajo',         'stock.low_alert',       'stock',        'Notificación cuando el stock cae del mínimo',                                 4, 'locked'),
  ('Gráfico Stock Temporada',   'stock.season_chart',    'stock',        'Stock agrupado por temporada con gráficos',                                   2, 'locked'),
  ('Auditoría de Stock',        'stock.audit',           'stock',        'Historial de movimientos y ajustes de inventario',                            3, 'locked'),
  ('Análisis por Clasificación','clasification.reports', 'stock',        'Análisis detallado de Stock por su Clasificación',                            4, 'locked'),

  -- KPIs / Dashboard
  ('KPI Ventas del Día',        'kpi.daily_sales',       'kpi',          'Totales de ventas del día en el dashboard',                                   1, 'hidden'),
  ('KPI Ventas del Mes',        'kpi.monthly_sales',     'kpi',          'Totales de ventas del mes en el dashboard',                                   1, 'hidden'),
  ('KPI Rotación en Días',      'kpi.rotation',          'kpi',          'Días promedio de rotación de productos',                                      2, 'locked'),
  ('KPI Rendimiento',           'kpi.performance',       'kpi',          'Comparativa de performance entre períodos',                                   2, 'locked'),

  -- Clientes
  ('Lista de Clientes',         'clients.list',          'clients',      'Ver y buscar clientes registrados',                                           4, 'hidden'),
  ('Historial por Cliente',     'clients.history',       'clients',      'Ver todas las compras de un cliente específico',                              2, 'locked'),
  ('Fidelización',              'clients.loyalty',       'clients',      'Sistema de puntos o beneficios por cliente',                                  4, 'locked'),

  -- Gastos / Finanzas
  ('Gastos Diarios',            'expenses.view',         'finance',      'Registro y consulta de gastos del día',                                       1, 'hidden'),
  ('Control de Egresos',        'expenses.control',      'finance',      'Gestión completa de egresos por categoría',                                   2, 'locked'),
  ('Reporte de Gastos',         'expenses.report',       'finance',      'Informes de gastos por período',                                              2, 'locked'),
  ('Transacciones',             'finance.transactions',  'finance',      'Historial completo de movimientos de dinero',                                 1, 'hidden'),
  ('Reportes Financieros P&L',  'finance.reports',       'finance',      'P&L Dia - Semana - Mes',                                                      3, 'locked'),
  ('KPI Punto de Equilibrio',   'balance.point',         'finance',      'Calculo del Punto de Equilibrio y meta de alcance',                           3, 'locked'),

  -- Usuarios y Roles
  ('Gestión de Usuarios',       'users.manage',          'admin',        'Crear, editar y desactivar usuarios',                                         1, 'hidden'),
  ('Roles y Permisos',          'users.roles',           'admin',        'Asignar roles a cada usuario del negocio',                                    2, 'hidden'),

  -- Sucursales
  ('Multi-Sucursal',            'branch.multi',          'branch',       'Operación con más de una sucursal',                                           3, 'locked'),
  ('Retiros a Caja Central',    'branch.transfers',      'branch',       'Transferencia de fondos entre sucursales',                                    3, 'locked'),
  ('Informes por Sucursal',     'branch.reports',        'branch',       'KPIs y reportes desglosados por sucursal',                                    3, 'locked'),

  -- Integraciones / IA
  ('Asistente IA Descripciones','ai.descriptions',       'ai',           'Generación de descripciones de productos con IA',                             3, 'locked'),
  ('Catálogo por WhatsApp',     'whatsapp.catalog',      'integrations', 'Catálogo de productos enviable por WhatsApp',                                 3, 'locked'),
  ('Facturación ARCA',          'arca.billing',          'integrations', 'Facturación electrónica vía ARCA (AFIP)',                                     2, 'locked'),
  ('Configurar Facturación ARCA','arca.settings',        'setting',      'Configuración, datos, certificados y claves para facturación ARCA',           2, 'locked'),
  ('Sincronización ML',         'ml.sync',               'integrations', 'Sincronización de stock con Mercado Libre',                                   4, 'locked')

ON CONFLICT (function_code) DO UPDATE
  SET name           = EXCLUDED.name,
      description    = EXCLUDED.description,
      min_plan_level = EXCLUDED.min_plan_level,
      display_mode   = EXCLUDED.display_mode,
      is_active      = EXCLUDED.is_active;

-- ============================================================
-- SEED — Plan activo por defecto para el negocio existente (id=1)
-- Solo se ejecuta si business.active_plan_id es NULL
-- ============================================================
DO $$
DECLARE
  v_plan_id   INTEGER;
  v_bp_id     INTEGER;
BEGIN
  SELECT id INTO v_plan_id FROM plans WHERE level = 1;

  IF EXISTS (SELECT 1 FROM business WHERE id = 1 AND active_plan_id IS NULL) THEN
    INSERT INTO business_plan (
      business_id, plan_id, status,
      valid_from, valid_until,
      payment_method, amount_paid
    )
    VALUES (
      1, v_plan_id, 'active',
      CURRENT_DATE, '2099-12-31',
      'manual', 0.00
    )
    RETURNING id INTO v_bp_id;

    UPDATE business SET active_plan_id = v_bp_id WHERE id = 1;
  END IF;
END $$;


-- Elimina la FK de min_plan_level → plans(level).
-- La validación de que el nivel exista se hace en el API (PATCH /api/functionalities/[id]).
-- Sin esta FK los clientes GUI pueden editar min_plan_level directamente en la grilla.
ALTER TABLE functionalities
  DROP CONSTRAINT IF EXISTS functionalities_min_plan_level_fkey;
