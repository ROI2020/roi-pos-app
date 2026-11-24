-- Agrega constraint UNIQUE (business_id, cj_pid) a products.
-- Permite hacer ON CONFLICT DO UPDATE en el import de CJ, evitando duplicados.
--
-- Antes solo había un índice simple (idx_products_cj_pid) que no evitaba duplicados.
-- Este índice único lo reemplaza funcionalmente (UNIQUE implica un índice).

-- Primero eliminar posibles duplicados: conservar el más reciente (mayor id).
-- En producción limpiar manualmente si hay duplicados antes de correr esto.
DELETE FROM products p1
WHERE cj_pid IS NOT NULL
  AND id < (
    SELECT MAX(p2.id)
    FROM products p2
    WHERE p2.cj_pid = p1.cj_pid
      AND p2.business_id = p1.business_id
  );

-- Eliminar el índice simple anterior (reemplazado por el UNIQUE index de abajo)
DROP INDEX IF EXISTS idx_products_cj_pid;

-- Constraint UNIQUE: un negocio no puede tener dos productos con el mismo cj_pid
CREATE UNIQUE INDEX IF NOT EXISTS products_business_cj_pid_uidx
  ON products (business_id, cj_pid)
  WHERE cj_pid IS NOT NULL;
