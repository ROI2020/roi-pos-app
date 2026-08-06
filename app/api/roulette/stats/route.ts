import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/roulette/stats
 * KPIs para el panel de Promociones (pestaña estadísticas).
 */
export async function GET() {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { rows: [stats] } = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM promotions
        WHERE business_id = $1 AND active = true)                        AS active_promotions,
       (SELECT COUNT(*)::int FROM promotions
        WHERE business_id = $1 AND active = false)                       AS inactive_promotions,
       (SELECT COUNT(*)::int FROM roulette_spins
        WHERE business_id = $1
          AND DATE_TRUNC('month', spun_at) = DATE_TRUNC('month', NOW())) AS spins_this_month,
       (SELECT COUNT(*)::int FROM roulette_spins
        WHERE business_id = $1
          AND result = 'prize'
          AND DATE_TRUNC('month', spun_at) = DATE_TRUNC('month', NOW())) AS prizes_this_month,
       (SELECT COUNT(*)::int FROM roulette_spins
        WHERE business_id = $1 AND spun_at::date = CURRENT_DATE)         AS spins_today,
       (SELECT COUNT(*)::int FROM discount_codes
        WHERE business_id = $1)                                          AS total_codes,
       (SELECT COUNT(*)::int FROM discount_codes
        WHERE business_id = $1 AND used_at IS NOT NULL)                  AS used_codes,
       (SELECT COUNT(*)::int FROM customers
        WHERE business_id = $1)                                          AS total_customers,
       (SELECT COUNT(*)::int FROM customers
        WHERE business_id = $1 AND verified = true)                      AS verified_customers`,
    [businessId]
  )

  // Promo más ganada del mes
  const { rows: [topPromo] } = await pool.query(
    `SELECT p.name, p.summary, COUNT(rs.id)::int AS wins
     FROM roulette_spins rs
     JOIN promotions p ON p.id = rs.promotion_id
     WHERE rs.business_id = $1
       AND rs.result = 'prize'
       AND DATE_TRUNC('month', rs.spun_at) = DATE_TRUNC('month', NOW())
     GROUP BY p.id, p.name, p.summary
     ORDER BY wins DESC
     LIMIT 1`,
    [businessId]
  )

  const spinsMonth  = stats.spins_this_month  ?? 0
  const prizesMonth = stats.prizes_this_month ?? 0
  const winRate     = spinsMonth > 0 ? Math.round((prizesMonth / spinsMonth) * 100) : 0

  return NextResponse.json({
    ...stats,
    win_rate:      winRate,
    top_promotion: topPromo ?? null,
  })
}
