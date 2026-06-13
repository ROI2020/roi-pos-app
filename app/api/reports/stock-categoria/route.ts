import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/reports/stock-categoria?category_id=X
 *
 * Devuelve el stock disponible (sin vender, sin canjes) agrupado por
 * edad × talle × género, listo para armar la tabla pivote en el cliente.
 *
 * Formato de respuesta:
 *   {
 *     genders: string[]          // géneros presentes, ordenados
 *     rows: {
 *       edad:   string
 *       talle:  string
 *       [genero: string]: number // cantidad por género
 *     }[]
 *   }
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')

  if (!categoryId) {
    return NextResponse.json({ error: 'category_id es requerido' }, { status: 400 })
  }

  const { rows } = await pool.query<{
    edad: string
    talle: string
    genero: string
    cantidad: string
  }>(
    `SELECT
       COALESCE(ag.name, '— Sin edad —')    AS edad,
       pv.size                              AS talle,
       COALESCE(g.name,  '— Sin género —') AS genero,
       COUNT(bi.id)::int                   AS cantidad
     FROM branch_inventory bi
     JOIN product_variants pv ON pv.id = bi.product_variant_id
     JOIN products p          ON p.id  = pv.product_id
     LEFT JOIN age_groups ag  ON ag.id = p.age_group_id
     LEFT JOIN genders g      ON g.id  = p.gender_id
     WHERE p.category_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM sale_details sd WHERE sd.product_variant_id = pv.id
       )
       AND NOT EXISTS (
         SELECT 1 FROM exchanges ex WHERE ex.new_variant_id = pv.id
       )
     GROUP BY ag.name, pv.size, g.name
     ORDER BY
       ag.name  NULLS LAST,
       CASE WHEN pv.size ~ '^[0-9]+(\\.[0-9]+)?$'
            THEN pv.size::numeric ELSE NULL END NULLS LAST,
       pv.size,
       g.name`,
    [categoryId]
  )

  // Pivot en JS: construir { edad, talle, [genero]: cantidad }
  const genderSet = new Set<string>()
  const rowMap = new Map<string, Record<string, string | number>>()

  for (const r of rows) {
    const key = `${r.edad}||${r.talle}`
    genderSet.add(r.genero)
    if (!rowMap.has(key)) rowMap.set(key, { edad: r.edad, talle: r.talle })
    rowMap.get(key)![r.genero] = parseInt(r.cantidad)
  }

  const genders = Array.from(genderSet).sort()
  const pivotRows = Array.from(rowMap.values())

  // Rellenar 0 para géneros ausentes en alguna fila
  for (const row of pivotRows) {
    for (const g of genders) {
      if (row[g] === undefined) row[g] = 0
    }
  }

  return NextResponse.json({ genders, rows: pivotRows })
}
