-- ============================================================
-- Borrar suscripción de prueba (respeta todas las FKs)
-- Editar: reemplazar el email antes de ejecutar
-- ============================================================

DO $$
DECLARE
  v_email       TEXT    := 'REEMPLAZAR_CON_EMAIL_DE_PRUEBA';  -- ← CAMBIAR ESTO
  v_business_id INTEGER;
BEGIN
  -- 1. Buscar el business_id via el usuario
  SELECT business_id INTO v_business_id
  FROM app_users
  WHERE email = v_email
  LIMIT 1;

  IF v_business_id IS NULL THEN
    RAISE NOTICE 'No se encontró usuario con email: %', v_email;
    RETURN;
  END IF;

  RAISE NOTICE 'Borrando business_id = %', v_business_id;

  -- 2. Romper FK circular: business.active_subscription_id → business_plan.id
  UPDATE business SET active_subscription_id = NULL WHERE id = v_business_id;

  -- 3. Borrar suscripciones
  DELETE FROM business_plan WHERE business_id = v_business_id;

  -- 4. Borrar usuarios del negocio
  DELETE FROM app_users WHERE business_id = v_business_id;

  -- 5. Borrar dominios (o los borra CASCADE automáticamente)
  DELETE FROM business_domains WHERE business_id = v_business_id;

  -- 6. Borrar el negocio
  DELETE FROM business WHERE id = v_business_id;

  RAISE NOTICE 'Listo. Negocio % eliminado correctamente.', v_business_id;
END $$;
