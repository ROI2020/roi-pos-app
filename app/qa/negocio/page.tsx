import { redirect } from 'next/navigation'
import pool from '@/lib/db'
import { isQa } from '@/lib/env'
import { cookies } from 'next/headers'
import QaBusinessList from './qa-business-list'

export default async function QaNegocioPage() {
  if (!isQa) redirect('/')

  const store = await cookies()
  const currentId = parseInt(store.get('qa_business_id')?.value ?? '0', 10) || null

  const { rows } = await pool.query<{
    id: number; name: string; locale: string; currency: string
  }>(
    `SELECT b.id, b.name,
       COALESCE((SELECT value FROM settings WHERE business_id = b.id AND key = 'locale' AND is_secret = false), 'es-AR') AS locale,
       COALESCE((SELECT value FROM settings WHERE business_id = b.id AND key = 'currency' AND is_secret = false), 'ARS') AS currency
     FROM business b
     WHERE b.active_subscription_id IS NOT NULL
     ORDER BY b.name`
  )

  return (
    <div style={{ maxWidth: 600, margin: '60px auto', padding: '0 16px', fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 24, marginBottom: 8 }}>QA — Elegir negocio</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        Seleccioná el negocio con el que querés probar. Se guarda en una cookie.
      </p>
      <QaBusinessList businesses={rows} currentId={currentId} />
    </div>
  )
}
