import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/reports/stock-by-category
 *
 * Devuelve una fila por (producto, color, talle) con el stock actual
 * en branch_inventory. Solo aparecen variantes con stock > 0.
 *
 * Query params (todos opcionales):
 *   category_id, age_group_id, season_id, gender_id
 */
export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { searchParams } = new URL(req.url)
  const categoryId = searchParams.get('category_id')
  const ageGroupId = searchParams.get('age_group_id')
  const seasonId   = searchParams.get('season_id')
  const genderId   = searchParams.get('gender_id')

  const conds: string[] = ['p.business_id = $1']
  const params: (string | number)[] = [businessId]
  let p = 2

  if (categoryId) { conds.push(`p.category_id  = $${p++}`); params.push(+categoryId) }
  if (ageGroupId) { conds.push(`p.age_group_id = $${p++}`); params.push(+ageGroupId) }
  if (seasonId)   { conds.push(`p.season_id    = $${p++}`); params.push(+seasonId)   }
  if (genderId)   { conds.push(`p.gender_id    = $${p++}`); params.push(+genderId)   }

  const { rows } = await pool.query(`
    SELECT
      COALESCE(c.name,  'Sin categoría') AS category,
      COALESCE(ag.name, 'Sin edad')      AS age_group,
      COALESCE(s.name,  'Sin temporada') AS season,
      COALESCE(g.name,  'Sin género')    AS gender,
      p.id                               AS product_id,
      p.name                             AS product_name,
      pv.color,
      pv.size,
      COUNT(bi.id)::int                  AS stock
    FROM product_variants pv
    JOIN  products p          ON p.id  = pv.product_id
    LEFT JOIN categories  c  ON c.id  = p.category_id
    LEFT JOIN age_groups  ag ON ag.id = p.age_group_id
    LEFT JOIN seasons     s  ON s.id  = p.season_id
    LEFT JOIN genders     g  ON g.id  = p.gender_id
    JOIN  branch_inventory bi ON bi.product_variant_id = pv.id
    WHERE ${conds.join(' AND ')}
    GROUP BY c.name, ag.name, s.name, g.name, p.id, p.name, pv.color, pv.size
    HAVING COUNT(bi.id) > 0
    ORDER BY
      c.name   NULLS LAST,
      p.name,
      pv.color,
      CASE WHEN pv.size ~ '^[0-9]+$' THEN pv.size::int ELSE 9999 END,
      pv.size
  `, params)

  return NextResponse.json(rows)
}
