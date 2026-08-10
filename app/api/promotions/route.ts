import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

export async function GET(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { searchParams } = new URL(req.url)
  const activeOnly = searchParams.get('active') === 'true'

  const conditions = ['p.business_id = $1']
  const params: unknown[] = [businessId]
  if (activeOnly) conditions.push('p.active = true')

  const { rows } = await pool.query(
    `SELECT
       p.*,
       p.value::float            AS value,
       p.estimated_savings::float AS estimated_savings,
       c.name                    AS category_name,
       ag.name                   AS age_group_name,
       s.name                    AS season_name,
       g.name                    AS gender_name,
       u.name                    AS created_by_name
     FROM promotions p
     LEFT JOIN categories  c  ON c.id  = p.category_id
     LEFT JOIN age_groups  ag ON ag.id = p.age_group_id
     LEFT JOIN seasons     s  ON s.id  = p.season_id
     LEFT JOIN genders     g  ON g.id  = p.gender_id
     LEFT JOIN app_users   u  ON u.id  = p.created_by
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.created_at DESC`,
    params
  )
  return NextResponse.json(rows)
}

export async function POST(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  try {
    const {
      name              = null,
      summary           = null,
      detail            = null,
      discount_type,
      value,
      days_of_week      = '1234567',
      category_id       = null,
      age_group_id      = null,
      season_id         = null,
      gender_id         = null,
      start_date        = null,
      end_date          = null,
      roulette_weight   = 10,
      roulette_daily_limit = null,
      roulette_only     = false,
      estimated_savings = 0,
      active            = true,
      created_by        = null,
    } = await req.json()

    if (!discount_type || value == null)
      return NextResponse.json({ error: 'discount_type y value son requeridos' }, { status: 400 })
    if (!['percentage', 'fixed_amount'].includes(discount_type))
      return NextResponse.json({ error: 'discount_type debe ser "percentage" o "fixed_amount"' }, { status: 400 })

    const { rows } = await pool.query(
      `INSERT INTO promotions (
         business_id, name, summary, detail,
         discount_type, value, days_of_week,
         category_id, age_group_id, season_id, gender_id,
         start_date, end_date,
         roulette_weight, roulette_daily_limit, roulette_only,
         estimated_savings, active, created_by
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
       ) RETURNING *`,
      [
        businessId, name, summary, detail,
        discount_type, value, days_of_week,
        category_id, age_group_id, season_id, gender_id,
        start_date || null, end_date || null,
        roulette_weight, roulette_daily_limit || null, roulette_only,
        estimated_savings, active, created_by,
      ]
    )
    return NextResponse.json(rows[0], { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
