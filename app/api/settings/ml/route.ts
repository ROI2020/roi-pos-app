/**
 * GET  /api/settings/ml  → estado de la integración ML del negocio
 * PUT  /api/settings/ml  → guarda ml_app_id y ml_app_secret
 * DELETE /api/settings/ml → desconecta ML (borra tokens)
 */

import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import type { PoolClient } from 'pg'
import { requireBusinessId } from '@/lib/get-business-id'
import { getPublicSettingsByKeys, getSecretSetting } from '@/lib/settings'

async function upsertSetting(
  client:     PoolClient,
  businessId: number,
  key:        string,
  value:      string | null,
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

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const pub = await getPublicSettingsByKeys(businessId, [
    'ml_enabled', 'ml_app_id', 'ml_user_id', 'ml_token_expires',
    'ml_msg_confirmation', 'ml_msg_dispatched',
  ])

  // Solo indicamos si el secret está configurado, nunca lo devolvemos
  const hasSecret      = !!(await getSecretSetting(businessId, 'ml_app_secret'))
  const hasAccessToken = !!(await getSecretSetting(businessId, 'ml_access_token'))

  return NextResponse.json({
    ml_enabled:           pub.ml_enabled === 'true',
    ml_app_id:            pub.ml_app_id ?? null,
    ml_app_secret:        hasSecret ? '••••••••' : null,
    ml_user_id:           pub.ml_user_id ?? null,
    ml_token_expires:     pub.ml_token_expires ?? null,
    connected:            hasAccessToken && pub.ml_enabled === 'true',
    ml_msg_confirmation:  pub.ml_msg_confirmation ?? null,
    ml_msg_dispatched:    pub.ml_msg_dispatched ?? null,
  })
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    ml_app_id?:            string | null
    ml_app_secret?:        string | null
    ml_msg_confirmation?:  string | null
    ml_msg_dispatched?:    string | null
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    if (body.ml_app_id !== undefined) {
      await upsertSetting(client, businessId, 'ml_app_id', body.ml_app_id || null, false)
    }
    if (body.ml_app_secret && body.ml_app_secret !== '••••••••') {
      await upsertSetting(client, businessId, 'ml_app_secret', body.ml_app_secret, true)
    }
    if (body.ml_msg_confirmation !== undefined) {
      await upsertSetting(client, businessId, 'ml_msg_confirmation', body.ml_msg_confirmation, false)
    }
    if (body.ml_msg_dispatched !== undefined) {
      await upsertSetting(client, businessId, 'ml_msg_dispatched', body.ml_msg_dispatched, false)
    }

    await client.query('COMMIT')
    return NextResponse.json({ ok: true })
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('[settings/ml PUT]', err)
    return NextResponse.json({ error: 'Error guardando settings' }, { status: 500 })
  } finally {
    client.release()
  }
}

// ── DELETE — desconectar ML ───────────────────────────────────────────────────

export async function DELETE() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  await pool.query(
    `UPDATE settings
     SET value = NULL
     WHERE business_id = $1
       AND key IN ('ml_access_token', 'ml_refresh_token', 'ml_token_expires', 'ml_user_id')`,
    [businessId],
  )
  await pool.query(
    `INSERT INTO settings (business_id, key, value, is_secret)
     VALUES ($1, 'ml_enabled', 'false', false)
     ON CONFLICT (key, business_id) DO UPDATE SET value = 'false'`,
    [businessId],
  )

  return NextResponse.json({ ok: true })
}
