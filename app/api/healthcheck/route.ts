import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { APP_ENV } from '@/lib/env'

function getDbRef(): string {
  const user = process.env.DB_USER ?? ''
  if (user.startsWith('postgres.')) return user.slice('postgres.'.length)
  const host = process.env.DB_HOST ?? ''
  if (!host || host === 'localhost' || host === '127.0.0.1') return 'local'
  const connStr = process.env.DATABASE_URL ?? ''
  if (connStr.includes('localhost') || connStr.includes('127.0.0.1')) return 'local'
  const m = connStr.match(/@([^:/?]+)/)
  return m ? m[1] : 'unknown'
}

export async function GET() {
  try {
    const { rows } = await pool.query('SELECT NOW() as time, current_database() as db')
    return NextResponse.json({
      ok:      true,
      ...rows[0],
      app_env: APP_ENV,
      db_ref:  getDbRef(),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    })
  } catch (err: unknown) {
    const msg = (err as { message?: string }).message ?? String(err)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
