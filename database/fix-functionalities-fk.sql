-- Elimina la FK de min_plan_level → plans(level).
-- La validación de que el nivel exista se hace en el API (PATCH /api/functionalities/[id]).
-- Sin esta FK los clientes GUI pueden editar min_plan_level directamente en la grilla.
ALTER TABLE functionalities
  DROP CONSTRAINT IF EXISTS functionalities_min_plan_level_fkey;
