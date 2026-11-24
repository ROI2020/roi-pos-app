-- ─────────────────────────────────────────────────────────────────────────────
-- Configuración de sucursal para ventas online
--
-- Las ventas generadas al confirmar un pedido online se registran en la
-- sucursal indicada por este setting (con su propio CUIT para facturación).
--
-- PASOS:
--   1. Crear la sucursal "Tienda Online" desde el panel de administración
--      (o con el INSERT de abajo si aún no existe).
--   2. Ejecutar el UPDATE de settings con el ID real de esa sucursal.
--
-- Mientras este setting no exista, el confirm usa la primera sucursal
-- disponible del negocio (comportamiento anterior).
-- ─────────────────────────────────────────────────────────────────────────────

-- Paso 1 (opcional): crear la sucursal "Tienda Online" si no existe todavía.
-- Reemplazá el CUIT y los datos con los reales antes de ejecutar.
-- INSERT INTO branches (business_id, name, address, cuit)
-- VALUES (1, 'Tienda Online', 'Venta por internet', '20-XXXXXXXX-X')
-- RETURNING id;  -- anotá el id que devuelve y usalo abajo

-- Paso 2: registrar el setting con el id de la sucursal online.
-- Reemplazá '2' por el id real de la sucursal.
INSERT INTO settings (business_id, key, value)
VALUES (1, 'online_branch_id', '2')
ON CONFLICT (business_id, key) DO UPDATE SET value = EXCLUDED.value;
