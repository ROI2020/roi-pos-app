import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * POST /api/customers/[id]/code
 * Genera un código de verificación de 6 dígitos (válido 15 min)
 * y devuelve el link wa.me con el número del local (si está configurado).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireBusinessId()
  if (auth instanceof NextResponse) return auth
  const { businessId } = auth

  const { id } = await params

  const { rows: [customer] } = await pool.query(
    `SELECT id, name, phone FROM customers WHERE id = $1 AND business_id = $2`,
    [id, businessId]
  )
  if (!customer) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  // WhatsApp del local (configurado en settings con key 'whatsapp_phone')
  const { rows: [setting] } = await pool.query(
    `SELECT value FROM settings WHERE key = 'whatsapp_phone' AND business_id = $1`,
    [businessId]
  )
  const storePhone = setting?.value ?? ''

  // Código de 6 dígitos, expira en 15 minutos
  const code    = Math.floor(100000 + Math.random() * 900000).toString()
  const expires = new Date(Date.now() + 15 * 60 * 1000)

  await pool.query(
    `UPDATE customers SET verification_code = $1, verification_expires = $2 WHERE id = $3`,
    [code, expires, id]
  )

  const waText = encodeURIComponent(`Hola! Mi código de verificación para la ruleta es: ${code}`)
  const waLink = storePhone
    ? `https://wa.me/${storePhone.replace(/\D/g, '')}?text=${waText}`
    : null

  return NextResponse.json({ code, wa_link: waLink, expires_at: expires })
}
