import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { PoolClient } from 'pg'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/settings/cj
 * Devuelve configuración CJ del negocio.
 * El cj_api_key nunca se devuelve — solo un flag indicando si está configurado.
 *
 * PUT /api/settings/cj
 * Guarda configuración CJ. El api_key solo se escribe si viene no vacío.
 */

const PUBLIC_KEYS  = ['cj_enabled', 'cj_api_email', 'cj_auto_fulfill'] as const
const SECRET_KEY   = 'cj_api_key'

async function upsertSetting(
  client: PoolClient,
  businessId: number,
  key:        string,
  value:      string,
  isSecret:   boolean,
) {
  await client.query(
    `INSERT INTO settings (business_id, key, value, is_secret)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (key, business_id)
     DO UPDATE SET value = $3, is_secret = $4`,
    [businessId, key, value, isSecret],
  )
}

export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query<{ key: string; value: string; is_secret: boolean }>(
    `SELECT key, value, is_secret
     FROM settings
     WHERE business_id = $1
       AND key = ANY($2)`,
    [businessId, [...PUBLIC_KEYS, SECRET_KEY]],
  )

  const map = Object.fromEntries(rows.map(r => [r.key, r]))

  return NextResponse.json({
    cj_enabled:        map['cj_enabled']?.value     ?? 'false',
    cj_api_email:      map['cj_api_email']?.value    ?? null,
    cj_auto_fulfill:   map['cj_auto_fulfill']?.value ?? 'false',
    cj_api_key_set:    !!map[SECRET_KEY]?.value,        // nunca el valor
  })
}

export async function PUT(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    cj_enabled?:      string
    cj_api_email?:    string
    cj_auto_fulfill?: string
    cj_api_key?:      string | null
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (body.cj_enabled     !== undefined) await upsertSetting(client, businessId, 'cj_enabled',      body.cj_enabled,      false)
    if (body.cj_api_email   !== undefined) await upsertSetting(client, businessId, 'cj_api_email',    body.cj_api_email ?? '', false)
    if (body.cj_auto_fulfill !== undefined) await upsertSetting(client, businessId, 'cj_auto_fulfill', body.cj_auto_fulfill,  false)

    // Secreto: solo escribir si viene con valor
    if (body.cj_api_key?.trim()) {
      await upsertSetting(client, businessId, SECRET_KEY, body.cj_api_key.trim(), true)
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[PUT /api/settings/cj]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  } finally {
    client.release()
  }
}
