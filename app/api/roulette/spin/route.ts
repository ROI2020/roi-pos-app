import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

const NO_PRIZE_COUNT  = 2
const NO_PRIZE_WEIGHT = 15

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return 'DC' + Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export interface RouletteSegment {
  type:         'prize' | 'no_prize'
  promotion_id: number | null
  label:        string        // texto en el segmento de la ruleta
  summary:      string
  discount_type: string | null
  value:        number | null
  weight:       number
}

/**
 * POST /api/roulette/spin
 * Body: { customer_id: number }
 *
 * Valida al cliente, construye los segmentos ponderados,
 * elige un ganador, guarda el historial y devuelve el resultado.
 */
export async function POST(req: Request) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { customer_id } = await req.json()
  if (!customer_id)
    return NextResponse.json({ error: 'customer_id requerido' }, { status: 400 })

  const client = await pool.connect()
  try {
    // ── 1. Validar cliente ──────────────────────────────────────────────
    const { rows: [customer] } = await client.query(
      `SELECT id, verified, last_roulette_month
       FROM customers WHERE id = $1 AND business_id = $2`,
      [customer_id, businessId]
    )
    if (!customer)
      return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
    if (!customer.verified)
      return NextResponse.json({ error: 'Cliente no verificado' }, { status: 400 })

    const currentMonth = new Date().toISOString().slice(0, 7) // 'YYYY-MM'
    if (customer.last_roulette_month === currentMonth)
      return NextResponse.json({ error: 'El cliente ya participó este mes' }, { status: 409 })

    // ── 2. Obtener promos activas con límite diario ──────────────────────
    const { rows: promos } = await client.query(
      `SELECT
         p.id, p.name, p.summary,
         p.discount_type, p.value::float AS value,
         p.roulette_weight, p.roulette_daily_limit,
         COUNT(rs.id) FILTER (
           WHERE rs.result = 'prize' AND rs.spun_at::date = CURRENT_DATE
         )::int AS today_wins
       FROM promotions p
       LEFT JOIN roulette_spins rs ON rs.promotion_id = p.id
       WHERE p.business_id = $1
         AND p.active = true
         AND (p.start_date IS NULL OR p.start_date <= CURRENT_DATE)
         AND (p.end_date   IS NULL OR p.end_date   >= CURRENT_DATE)
       GROUP BY p.id`,
      [businessId]
    )

    // ── 3. Construir segmentos (filtrar los que superaron límite diario) ──
    const promoSegs: RouletteSegment[] = promos
      .filter(p => !p.roulette_daily_limit || p.today_wins < p.roulette_daily_limit)
      .map(p => ({
        type:         'prize',
        promotion_id: p.id,
        label:        p.summary || (p.discount_type === 'percentage'
                        ? `${p.value}% OFF`
                        : `$${p.value} OFF`),
        summary:      p.summary ?? '',
        discount_type: p.discount_type,
        value:        p.value,
        weight:       p.roulette_weight,
      }))

    const noSegs: RouletteSegment[] = Array.from({ length: NO_PRIZE_COUNT }, () => ({
      type:          'no_prize',
      promotion_id:  null,
      label:         '¡Mejor suerte!',
      summary:       '',
      discount_type: null,
      value:         null,
      weight:        NO_PRIZE_WEIGHT,
    }))

    const segments: RouletteSegment[] = [...promoSegs, ...noSegs]

    // ── 4. Selección ponderada ───────────────────────────────────────────
    const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0)
    let rnd    = Math.random() * totalWeight
    let winIdx = segments.length - 1
    for (let i = 0; i < segments.length; i++) {
      rnd -= segments[i].weight
      if (rnd <= 0) { winIdx = i; break }
    }
    const winner = segments[winIdx]
    const result = winner.type

    await client.query('BEGIN')

    // ── 5a. Detalle de la promo ganadora (para el cupón imprimible) ──────────
    let promoDetail: {
      detail: string | null
      category_name: string | null
      age_group_name: string | null
      season_name: string | null
      gender_name: string | null
    } | null = null

    if (result === 'prize' && winner.promotion_id) {
      const { rows: [pd] } = await client.query(
        `SELECT p.detail,
                cat.name AS category_name,
                ag.name  AS age_group_name,
                sea.name AS season_name,
                gen.name AS gender_name
         FROM promotions p
         LEFT JOIN categories cat ON cat.id = p.category_id
         LEFT JOIN age_groups  ag  ON ag.id  = p.age_group_id
         LEFT JOIN seasons     sea ON sea.id = p.season_id
         LEFT JOIN genders     gen ON gen.id = p.gender_id
         WHERE p.id = $1`,
        [winner.promotion_id]
      )
      promoDetail = pd ?? null
    }

    // ── 5b. Generar código de descuento si ganó ──────────────────────────
    let discountCode:   string | null = null
    let discountCodeId: number | null = null
    let discountExpiry: string | null = null

    if (result === 'prize') {
      discountCode = generateCode()
      const { rows: [dc] } = await client.query(
        `INSERT INTO discount_codes
           (business_id, code, promotion_id, customer_id, source, discount_type, value, expires_at)
         VALUES ($1, $2, $3, $4, 'ruleta', $5, $6, NOW() + INTERVAL '30 days')
         RETURNING id, code, expires_at`,
        [businessId, discountCode, winner.promotion_id, customer_id, winner.discount_type, winner.value]
      )
      discountCodeId = dc.id
      discountCode   = dc.code
      discountExpiry = dc.expires_at instanceof Date
        ? dc.expires_at.toISOString()
        : String(dc.expires_at)
    }

    // ── 6. Guardar historial de giro ─────────────────────────────────────
    await client.query(
      `INSERT INTO roulette_spins
         (business_id, customer_id, promotion_id, discount_code_id, result)
       VALUES ($1, $2, $3, $4, $5)`,
      [businessId, customer_id, winner.promotion_id ?? null, discountCodeId, result]
    )

    // ── 7. Actualizar mes de participación del cliente ───────────────────
    await client.query(
      `UPDATE customers SET last_roulette_month = $1, updated_at = NOW() WHERE id = $2`,
      [currentMonth, customer_id]
    )

    await client.query('COMMIT')

    return NextResponse.json({
      result,
      winning_index: winIdx,
      segments,
      discount_code:   discountCode,
      discount_expiry: discountExpiry,
      promotion: result === 'prize'
        ? {
            name:           winner.label,
            discount_type:  winner.discount_type,
            value:          winner.value,
            detail:         promoDetail?.detail         ?? null,
            category_name:  promoDetail?.category_name  ?? null,
            age_group_name: promoDetail?.age_group_name ?? null,
            season_name:    promoDetail?.season_name    ?? null,
            gender_name:    promoDetail?.gender_name    ?? null,
          }
        : null,
    })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[POST /api/roulette/spin]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
