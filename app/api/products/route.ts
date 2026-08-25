import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/products
 *
 * Query params:
 *   q               texto libre sobre nombre del producto
 *   category_id, age_group_id, season_id, gender_id
 *   unclassified    'true'  → algún campo de clasificación vacío
 *   has_photo       'true' | 'false'
 *   exportable      'whatsapp' | 'instagram' | 'facebook' | 'web'
 *   sort            'name_asc' (default) | 'name_desc' | 'price_asc' | 'price_desc' | 'stock_desc'
 *   limit           default 52, max 53 (53 = hay más)
 *   offset          default 0
 *
 * Devuelve: campos del producto + variant_count + stock_count
 */
export async function GET(req: Request) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { searchParams } = new URL(req.url)
  const q               = searchParams.get('q')?.trim() ?? ''
  const categoryId      = searchParams.get('category_id')
  const ageGroupId      = searchParams.get('age_group_id')
  const seasonId        = searchParams.get('season_id')
  const genderId        = searchParams.get('gender_id')
  const unclassified    = searchParams.get('unclassified') === 'true'
  const hasPhoto        = searchParams.get('has_photo')
  const exportable      = searchParams.get('exportable')
  const sort            = searchParams.get('sort') ?? 'name_asc'
  const limit           = Math.min(parseInt(searchParams.get('limit') ?? '52'), 2000)
  const offset          = parseInt(searchParams.get('offset') ?? '0')

  const conditions: string[] = []
  const params: (string | number)[] = []
  let p = 1

  // Always filter by business
  conditions.push(`p.business_id = $${p++}`)
  params.push(businessId)

  if (q) {
    conditions.push(`p.name ILIKE $${p++}`)
    params.push(`%${q}%`)
  }
  if (categoryId)   { conditions.push(`p.category_id  = $${p++}`); params.push(parseInt(categoryId))  }
  if (ageGroupId)   { conditions.push(`p.age_group_id = $${p++}`); params.push(parseInt(ageGroupId))  }
  if (seasonId)     { conditions.push(`p.season_id    = $${p++}`); params.push(parseInt(seasonId))    }
  if (genderId)     { conditions.push(`p.gender_id    = $${p++}`); params.push(parseInt(genderId))    }
  if (unclassified) {
    conditions.push(
      `(p.category_id IS NULL OR p.age_group_id IS NULL OR p.season_id IS NULL OR p.gender_id IS NULL)`
    )
  }
  if (hasPhoto === 'true')  conditions.push(`p.photo_url IS NOT NULL`)
  if (hasPhoto === 'false') conditions.push(`p.photo_url IS NULL`)
  if (exportable === 'whatsapp')  conditions.push(`p.exportable_whatsapp  = true`)
  if (exportable === 'instagram') conditions.push(`p.exportable_instagram = true`)
  if (exportable === 'facebook')  conditions.push(`p.exportable_facebook  = true`)
  if (exportable === 'web')       conditions.push(`p.exportable_web       = true`)

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  const ORDER = {
    name_asc:   'p.name ASC',
    name_desc:  'p.name DESC',
    price_asc:  'p.base_price ASC, p.name ASC',
    price_desc: 'p.base_price DESC, p.name ASC',
    stock_desc: 'stock_count DESC, p.name ASC',
  }[sort] ?? 'p.name ASC'

  params.push(limit, offset)

  const { rows } = await pool.query(`
    SELECT
      p.id,
      p.name,
      p.description,
      p.base_price::float,
      p.cuotas,
      p.photo_url,
      p.exportable_whatsapp,
      p.exportable_instagram,
      p.exportable_facebook,
      p.exportable_web,
      p.category_id,   c.name  AS category_name,
      p.age_group_id,  ag.name AS age_group_name,
      p.season_id,     s.name  AS season_name,
      p.gender_id,     g.name  AS gender_name,
      COUNT(DISTINCT pv.id)::int  AS variant_count,
      COUNT(DISTINCT bi.id)::int  AS stock_count
    FROM products p
    LEFT JOIN categories  c  ON c.id  = p.category_id
    LEFT JOIN age_groups  ag ON ag.id = p.age_group_id
    LEFT JOIN seasons     s  ON s.id  = p.season_id
    LEFT JOIN genders     g  ON g.id  = p.gender_id
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    LEFT JOIN branch_inventory bi ON bi.product_variant_id = pv.id
    ${where}
    GROUP BY p.id, c.name, ag.name, s.name, g.name
    ORDER BY ${ORDER}
    LIMIT $${p++} OFFSET $${p}
  `, params)

  return NextResponse.json(rows)
}

/** POST /api/products – crea un nuevo producto */
export async function POST(req: Request) {
  try {
    const authResult = await requireBusinessId()
    if (authResult instanceof NextResponse) return authResult
    const { businessId } = authResult

    const { name, description, base_price } = await req.json()
    if (!name?.trim())
      return NextResponse.json({ error: 'El nombre es obligatorio' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO products (name, description, base_price, business_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, description, base_price::float,
                 category_id, age_group_id, season_id, gender_id`,
      [name.trim(), description?.trim() || null, parseFloat(base_price) || 0, businessId]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    console.error('[POST /api/products]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
