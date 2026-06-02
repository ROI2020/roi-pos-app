import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/labels/variants
 *
 * Query params:
 *   q                     → búsqueda libre multi-token (jean gris T14)
 *                           cada token debe aparecer en al menos uno de: nombre,
 *                           color, talle, 'T'+talle, SKU, barcode, categoría,
 *                           grupo edad, temporada, género  (AND entre tokens)
 *   unprinted=true        → solo las que nunca se imprimieron
 *   branch_id             → filtrar por sucursal asignada
 *   category_id, age_group_id, season_id, gender_id
 *   color                 → búsqueda parcial, case-insensitive
 *
 * Devuelve máx. 201 filas (>200 = aviso de overflow).
 * Cada fila incluye: id, sku, barcode, color, size, label_printed_at,
 *   product_name, base_price, category_name, branch_name.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const q          = searchParams.get('q')?.trim() ?? ''
  const unprinted  = searchParams.get('unprinted')  === 'true'
  const branchId   = searchParams.get('branch_id')
  const categoryId = searchParams.get('category_id')
  const ageGroupId = searchParams.get('age_group_id')
  const seasonId   = searchParams.get('season_id')
  const genderId   = searchParams.get('gender_id')
  const color      = searchParams.get('color')

  const conditions: string[] = []
  const params: (string | number)[] = []
  let p = 1

  if (unprinted)   conditions.push('pv.label_printed_at IS NULL')
  if (branchId)  { conditions.push(`bi.branch_id = $${p++}`);               params.push(parseInt(branchId))   }
  if (categoryId){ conditions.push(`p.category_id  = $${p++}`);             params.push(parseInt(categoryId)) }
  if (ageGroupId){ conditions.push(`p.age_group_id = $${p++}`);             params.push(parseInt(ageGroupId)) }
  if (seasonId)  { conditions.push(`p.season_id    = $${p++}`);             params.push(parseInt(seasonId))   }
  if (genderId)  { conditions.push(`p.gender_id    = $${p++}`);             params.push(parseInt(genderId))   }
  if (color?.trim()) {
    conditions.push(`LOWER(pv.color) LIKE LOWER($${p++})`)
    params.push(`%${color.trim()}%`)
  }

  // ── Multi-token libre: "jean gris T14" ───────────────────────────────────────
  if (q) {
    const tokens = q.split(/\s+/).filter(t => t.length > 0)
    for (const token of tokens) {
      params.push(`%${token}%`)
      const pi = p++
      conditions.push(`(
          p.name                    ILIKE $${pi}
       OR pv.color                  ILIKE $${pi}
       OR pv.size                   ILIKE $${pi}
       OR ('T' || pv.size)          ILIKE $${pi}
       OR pv.sku                    ILIKE $${pi}
       OR COALESCE(pv.barcode,  '') ILIKE $${pi}
       OR COALESCE(c.name,      '') ILIKE $${pi}
       OR COALESCE(ag.name,     '') ILIKE $${pi}
       OR COALESCE(s.name,      '') ILIKE $${pi}
       OR COALESCE(g.name,      '') ILIKE $${pi}
      )`)
    }
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const { rows } = await pool.query(`
    SELECT
      pv.id,
      pv.sku,
      COALESCE(pv.barcode, pv.sku) AS barcode,
      pv.color,
      pv.size,
      pv.label_printed_at,
      p.id         AS product_id,
      p.name       AS product_name,
      p.base_price::float,
      c.name       AS category_name,
      ag.name      AS age_group_name,
      s.name       AS season_name,
      g.name       AS gender_name,
      bi.branch_id,
      br.name      AS branch_name
    FROM product_variants pv
    JOIN products p            ON p.id   = pv.product_id
    LEFT JOIN categories  c    ON c.id   = p.category_id
    LEFT JOIN age_groups  ag   ON ag.id  = p.age_group_id
    LEFT JOIN seasons     s    ON s.id   = p.season_id
    LEFT JOIN genders     g    ON g.id   = p.gender_id
    LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
    LEFT JOIN branches    br   ON br.id  = bi.branch_id
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
