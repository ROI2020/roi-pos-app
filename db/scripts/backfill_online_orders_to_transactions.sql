-- =============================================================
-- backfill_online_orders_to_transactions.sql
--
-- Carga en transactions todos los online_orders con status='approved'
-- que todavía no tienen fila en transactions (type='online').
--
-- Idempotente: se puede correr más de una vez sin duplicar filas.
-- Prerequisito: migración 20260901_transactions_type_online.sql ejecutada.
-- Prerequisito: paypal_fop_id configurado en el panel de Pagos.
-- =============================================================

DO $$
DECLARE
  v_business_id int;
  v_fop_id      int;
  v_inserted    int;
BEGIN

  -- ── Obtener paypal_fop_id desde settings ───────────────────
  -- Si hay múltiples negocios, ajustar el WHERE con el business_id correcto.
  SELECT business_id, value::int
  INTO   v_business_id, v_fop_id
  FROM   settings
  WHERE  key = 'paypal_fop_id'
    AND  value IS NOT NULL
  LIMIT  1;

  IF v_fop_id IS NULL THEN
    RAISE EXCEPTION
      'paypal_fop_id no configurado. '
      'Ir a Configuración → Pagos → PayPal → "Forma de pago en el libro" y guardar.';
  END IF;

  RAISE NOTICE 'business_id=%, paypal_fop_id=%', v_business_id, v_fop_id;

  -- ── Preview: ¿qué se va a insertar? ────────────────────────
  RAISE NOTICE '--- Pedidos a importar ---';
  FOR rec IN
    SELECT o.id, o.total, o.paypal_captured_amount, o.paypal_captured_currency, o.updated_at
    FROM   online_orders o
    WHERE  o.status      = 'approved'
      AND  o.business_id = v_business_id
      AND  NOT EXISTS (
             SELECT 1 FROM transactions t
             WHERE  t.type    = 'online'
               AND  t.type_id = o.id
           )
    ORDER BY o.id
  LOOP
    RAISE NOTICE '  online_order id=% | amount=% % | fecha=%',
      rec.id,
      COALESCE(rec.paypal_captured_amount, rec.total),
      COALESCE(rec.paypal_captured_currency, 'USD'),
      rec.updated_at;
  END LOOP;

  -- ── Insertar ────────────────────────────────────────────────
  INSERT INTO transactions
    (business_id, branch_id, fop_id, type, type_id, currency, amount, created_at)
  SELECT
    o.business_id,
    NULL,                                             -- sin sucursal (tienda online)
    v_fop_id,
    'online',
    o.id,
    COALESCE(o.paypal_captured_currency, 'USD'),      -- moneda real capturada por PayPal
    COALESCE(o.paypal_captured_amount,   o.total),    -- monto real; fallback al total del pedido
    COALESCE(o.updated_at, o.created_at)              -- fecha de aprobación del pago
  FROM online_orders o
  WHERE o.status      = 'approved'
    AND o.business_id = v_business_id
    AND NOT EXISTS (
          SELECT 1 FROM transactions t
          WHERE  t.type    = 'online'
            AND  t.type_id = o.id
        )
  ORDER BY o.id;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE '✓ Insertadas % transacciones.', v_inserted;

END $$;

-- ── Verificación post-ejecución ────────────────────────────────
SELECT
  t.id,
  t.type_id        AS online_order_id,
  o.status         AS order_status,
  t.currency,
  t.amount,
  t.created_at     AS tx_fecha
FROM transactions t
JOIN online_orders o ON o.id = t.type_id
WHERE t.type = 'online'
ORDER BY t.id;
