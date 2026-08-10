import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/promotions/applicable?variant_id=X
 *
 * Devuelve las promociones vigentes HOY que aplican al producto de la variante dada.
 * Usado por el POS para mostrar el badge "Promo Aplicable" en el carrito.
 *
 * Criterios:
 *  - active = true
 *  - start_date / end_date vigentes
 *  - days_of_week contiene el día de hoy (1=lu ... 7=do)
 *  - category_id, age_group_id, season_id, gender_id coinciden con el producto (o son null = todos)
 */
export async function GET(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { searchParams } = new URL(req.url)
  const variantId   = searchParams.get('variant_id')
  const promotionId = searchParams.get('promotion_id')  // si viene → modo "código de ruleta"
  if (!variantId)
    return NextResponse.json({ error: 'variant_id requerido' }, { status: 400 })

  // Obtener atributos del producto de esa variante
  const { rows: [product] } = await pool.query(
    `SELECT prod.category_id, prod.age_group_id, prod.season_id, prod.gender_id
     FROM product_variants pv
     JOIN products prod ON prod.id = pv.product_id
     WHERE pv.id = $1`,
    [variantId]
  )
  if (!product) return NextResponse.json([])

  if (promotionId) {
    // ── Modo "código de ruleta": verificar si UNA promo específica aplica al variante.
    // No se verifica día de la semana (el cliente ya ganó el código ese día).
    const { rows } = await pool.query(
      `SELECT
         p.id, p.name, p.summary, p.detail,
         p.discount_type,
         p.value::float             AS value,
         p.estimated_savings::float AS estimated_savings
       FROM promotions p
       WHERE p.id = $1
         AND p.business_id = $2
         AND (p.category_id  IS NULL OR p.category_id  = $3)
         AND (p.age_group_id IS NULL OR p.age_group_id = $4)
         AND (p.season_id    IS NULL OR p.season_id    = $5)
         AND (p.gender_id    IS NULL OR p.gender_id    = $6)`,
      [promotionId, businessId,
       product.category_id, product.age_group_id, product.season_id, product.gender_id]
    )
    return NextResponse.json(rows)
  }

  // ── Modo normal: promos del día vigentes para el variante ──────────────────
  // Dígito del día actual (1=lunes ... 7=domingo)
  const dow = new Date().getDay()
  const dayDigit = dow === 0 ? 7 : dow

  const { rows } = await pool.query(
    `SELECT
       p.id, p.name, p.summary, p.detail,
       p.discount_type,
       p.value::float             AS value,
       p.estimated_savings::float AS estimated_savings
     FROM promotions p
     WHERE p.business_id = $1
       AND p.active = true
       AND p.roulette_only = false
       AND (p.start_date IS NULL OR p.start_date <= CURRENT_DATE)
       AND (p.end_date   IS NULL OR p.end_date   >= CURRENT_DATE)
       AND p.days_of_week LIKE $2
       AND (p.category_id  IS NULL OR p.category_id  = $3)
       AND (p.age_group_id IS NULL OR p.age_group_id = $4)
       AND (p.season_id    IS NULL OR p.season_id    = $5)
       AND (p.gender_id    IS NULL OR p.gender_id    = $6)
     ORDER BY p.value DESC`,
    [
      businessId,
      `%${dayDigit}%`,
      product.category_id,
      product.age_group_id,
      product.season_id,
      product.gender_id,
    ]
  )
  return NextResponse.json(rows)
}
