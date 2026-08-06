import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * POST /api/discount-codes/validate
 * Body: { code: string }
 *
 * Valida si el código es válido para usar en una venta.
 * No marca el código como usado (eso lo hace el cierre de la venta).
 *
 * Respuesta:
 *  { valid: true,  discount_code: { ... } }
 *  { valid: false, reason: string, discount_code?: { ... } }
 */
export async function POST(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { code } = await req.json()
  if (!code?.trim())
    return NextResponse.json({ valid: false, reason: 'Código requerido' })

  const { rows: [dc] } = await pool.query(
    `SELECT
       dc.*,
       dc.value::float   AS value,
       dc.value::float   AS discount_value,
       cust.name         AS customer_name,
       cust.phone        AS customer_phone,
       p.summary         AS promotion_summary,
       p.detail          AS promotion_detail,
       p.category_id,
       p.age_group_id,
       p.season_id,
       p.gender_id,
       cat.name          AS category_name,
       ag.name           AS age_group_name,
       sea.name          AS season_name,
       gen.name          AS gender_name
     FROM discount_codes dc
     LEFT JOIN customers  cust ON cust.id = dc.customer_id
     LEFT JOIN promotions p    ON p.id    = dc.promotion_id
     LEFT JOIN categories cat  ON cat.id  = p.category_id
     LEFT JOIN age_groups ag   ON ag.id   = p.age_group_id
     LEFT JOIN seasons    sea  ON sea.id  = p.season_id
     LEFT JOIN genders    gen  ON gen.id  = p.gender_id
     WHERE dc.code = $1 AND dc.business_id = $2`,
    [code.trim().toUpperCase(), businessId]
  )

  if (!dc)
    return NextResponse.json({ valid: false, reason: 'Código no encontrado' })

  if (dc.used_at)
    return NextResponse.json({
      valid: false,
      reason: 'El código ya fue utilizado',
      discount_code: dc,
    })

  if (new Date(dc.expires_at) < new Date())
    return NextResponse.json({
      valid: false,
      reason: `El código expiró el ${new Date(dc.expires_at).toLocaleDateString('es-AR')}`,
      discount_code: dc,
    })

  return NextResponse.json({ valid: true, discount_code: dc })
}
