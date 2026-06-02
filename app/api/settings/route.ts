import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/** GET /api/settings — devuelve todas las claves como objeto */
export async function GET() {
  const { rows } = await pool.query(`SELECT key, value FROM settings ORDER BY key`)
  const obj: Record<string, string | null> = {}
  rows.forEach(r => { obj[r.key] = r.value })
  return NextResponse.json(obj)
}

/**
 * PUT /api/settings
 * Body: { business_name?: string, business_logo?: string | null, ... }
 * Upsert de cada clave recibida.
 */
export async function PUT(req: Request) {
  const body = await req.json() as Record<string, string | null>
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [key, value] of Object.entries(body)) {
      await client.query(
        `INSERT INTO settings (key, value)
         VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
        [key, value ?? null]
      )
    }
    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PUT /api/settings]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
