import { NextResponse } from 'next/server'
import { readFileSync } from 'fs'
import { join } from 'path'
import pool from '@/lib/db'

/**
 * GET /api/migrate
 * Ejecuta las migraciones de la BD (idempotente — se puede llamar varias veces).
 * Solo usar en desarrollo / setup inicial.
 */
export async function GET() {
  const client = await pool.connect()
  try {
    const sql = readFileSync(join(process.cwd(), 'db', 'migrate.sql'), 'utf-8')
    await client.query(sql)
    return NextResponse.json({ ok: true, message: 'Migración ejecutada correctamente' })
  } catch (err) {
    console.error('[GET /api/migrate]', err)
    return NextResponse.json(
      { ok: false, error: String(err) },
      { status: 500 }
    )
  } finally {
    client.release()
  }
}
