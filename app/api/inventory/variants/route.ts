import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/inventory/variants
 * Query params:
 *   mode             'asign'    → variantes sin sucursal asignada
 *                   'reassign' → variantes asignadas a current_branch_id
 *   current_branch_id (requerido si mode=reassign)
 *   category_id, age_group_id, season_id, gender_id  (opcionales)
 *   color            texto parcial, case-insensitive  (opcional)
 *
 * Devuelve máximo 201 filas — si el cliente recibe 201 significa "hay más".
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const mode            = searchParams.get('mode') ?? 'asign'
  const currentBranchId = searchParams.get('current_branch_id')
  const categoryId      = searchParams.get('category_id')
  const ageGroupId      = searchParams.get('age_group_id')
  const seasonId        = searchParams.get('season_id')
  const genderId        = searchParams.get('gender_id')
  const color           = searchParams.get('color')

  if (mode === 'reassign' && !currentBranchId) {
    return NextResponse.json(
      { error: 'current_branch_id es requerido para el modo reasignación' },
      { status: 400 }
    )
  }

  // Condiciones dinámicas (empiezan después de las cláusulas de modo)
  const conditions: string[] = []
  const params: (string | number)[] = []
  let p = 1

  // Modo: asign → sin sucursal Y sin vender; reassign → en la sucursal indicada
  let inventoryJoin: string
  if (mode === 'reassign') {
    inventoryJoin = `
      JOIN branch_inventory bi ON bi.product_variant_id = pv.id
      JOIN branches b          ON b.id = bi.branch_id`
    conditions.push(`bi.branch_id = $${p++}`)
    params.push(parseInt(currentBranchId!))
  } else {
    // Asignación: excluye prendas ya vendidas (sale_details) además de las que
    // ya tienen sucursal (branch_inventory). Una prenda vendida no está en
    // branch_inventory pero tampoco debe aparecer como "sin asignar".
    inventoryJoin = `
      LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
      LEFT JOIN branches b          ON b.id = bi.branch_id
      LEFT JOIN sale_details     sd ON sd.product_variant_id = pv.id`
    conditions.push('bi.id IS NULL')
    conditions.push('sd.id IS NULL')
  }

  if (categoryId)  { conditions.push(`p.category_id  = $${p++}`); params.push(parseInt(categoryId))  }
  if (ageGroupId)  { conditions.push(`p.age_group_id = $${p++}`); params.push(parseInt(ageGroupId))  }
  if (seasonId)    { conditions.push(`p.season_id    = $${p++}`); params.push(parseInt(seasonId))    }
  if (genderId)    { conditions.push(`p.gender_id    = $${p++}`); params.push(parseInt(genderId))    }
  if (color?.trim()) {
    conditions.push(`LOWER(pv.color) LIKE LOWER($${p++})`)
    params.push(`%${color.trim()}%`)
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await pool.query(`
    SELECT
      pv.id,
      pv.sku,
      pv.color,
      pv.size,
      p.id   AS product_id,
      p.name AS product_name,
      p.category_id,  c.name  AS category_name,
      p.age_group_id, ag.name AS age_group_name,
      p.season_id,    s.name  AS season_name,
      p.gender_id,    g.name  AS gender_name,
      bi.branch_id    AS current_branch_id,
      b.name          AS current_branch_name
    FROM product_variants pv
    JOIN products p         ON p.id  = pv.product_id
    LEFT JOIN categories  c ON c.id  = p.category_id
    LEFT JOIN age_groups ag ON ag.id = p.age_group_id
    LEFT JOIN seasons     s ON s.id  = p.season_id
    LEFT JOIN genders     g ON g.id  = p.gender_id
    ${inventoryJoin}
    ${whereClause}
    ORDER BY
      p.name,
      pv.color,
      CASE WHEN pv.size ~ '^[0-9]+$' THEN pv.size::int ELSE 9999 END,
      pv.size
    LIMIT 201
  `, params)

  return NextResponse.json(rows)
}
