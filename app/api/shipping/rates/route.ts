import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/shipping/rates?state=C
 *
 * Endpoint público — sin autenticación.
 * Devuelve las tarifas activas para el código de provincia PAQ.AR dado.
 * Si no se especifica state, devuelve todas las activas.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const state = searchParams.get('state')?.toUpperCase()

  try {
    const { rows } = await pool.query<{
      id:            number
      correo_config_id: number
      carrier:       string
      display_name:  string
      zone_name:     string
      delivery_type: string
      display_label: string
      price:         number
    }>(
      `SELECT
         sr.id,
         sr.correo_config_id,
         cc.carrier,
         cc.display_name,
         sr.zone_name,
         sr.delivery_type,
         sr.display_label,
         sr.price::float
       FROM shipping_rates sr
       JOIN correo_config cc ON cc.id = sr.correo_config_id
       WHERE sr.active = true
         AND cc.active = true
         ${state ? `AND $1 = ANY(sr.state_codes)` : ''}
       ORDER BY sr.price ASC`,
      state ? [state] : []
    )

    return NextResponse.json(rows)
  } catch (err) {
    console.error('[GET /api/shipping/rates]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
