import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export async function GET() {
  try {
    const { rows } = await pool.query('SELECT NOW() as time, current_database() as db')
    return NextResponse.json({ ok: true, ...rows[0] })
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
