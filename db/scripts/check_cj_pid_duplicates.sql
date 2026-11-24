-- Diagnóstico: productos CJ duplicados (mismo business_id + cj_pid)
-- Correr en Supabase → SQL Editor antes de ejecutar la migración.
-- No modifica nada.

SELECT
  p.business_id,
  p.cj_pid,
  COUNT(*)                                    AS cantidad,
  STRING_AGG(p.id::text, ', ' ORDER BY p.id) AS ids,
  MIN(p.id)                                   AS id_a_eliminar,   -- el más viejo
  MAX(p.id)                                   AS id_a_conservar,  -- el más nuevo
  MAX(p.name)                                 AS nombre,
  MAX(p.created_at)                           AS ultima_creacion
FROM products p
WHERE p.cj_pid IS NOT NULL
GROUP BY p.business_id, p.cj_pid
HAVING COUNT(*) > 1
ORDER BY p.business_id, cantidad DESC, p.cj_pid;

-- Si no devuelve filas: no hay duplicados, podés correr la migración directo.
-- Si hay filas: revisá los ids_a_eliminar antes de proceder.
