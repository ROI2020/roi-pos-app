import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'
import { obtenerToken } from '@/lib/facturacion/wsaa'
import { obtenerUltimoNroComprobante } from '@/lib/facturacion/wsfev1'
import type { ErrorFacturacion } from '@/lib/facturacion/types'
async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) {
    return NextResponse.json(
      { error: { categoria: 'interno', mensaje: 'No autorizado' } satisfies ErrorFacturacion },
      { status: 401 }
    )
  }
  try {
    const { role } = JSON.parse(decodeURIComponent(raw)) as { id: number; role: string }
    if (role !== 'administrador') {
      return NextResponse.json(
        { error: { categoria: 'interno', mensaje: 'Acceso denegado' } satisfies ErrorFacturacion },
        { status: 403 }
      )
    }
    return null
  } catch {
    return NextResponse.json(
      { error: { categoria: 'interno', mensaje: 'Sesión inválida' } satisfies ErrorFacturacion },
      { status: 401 }
    )
  }
}

/**
 * GET /api/facturacion/consulta?cuit=XX-XXXXXXXX-X&puntoVenta=1&tipoCbte=11
 *
 * Retorna el último nro de comprobante autorizado para ese punto de venta.
 */
export async function GET(req: Request) {
  const blocked = await requireAdmin()
  if (blocked) return blocked

  const { searchParams } = new URL(req.url)
  const cuit       = searchParams.get('cuit') ?? ''
  const puntoVenta = parseInt(searchParams.get('puntoVenta') ?? '0', 10)
  const tipoCbte   = parseInt(searchParams.get('tipoCbte') ?? '11', 10)

  if (!cuit || !puntoVenta) {
    return NextResponse.json(
      { error: { categoria: 'validacion', mensaje: 'Params requeridos: cuit, puntoVenta' } satisfies ErrorFacturacion },
      { status: 400 }
    )
  }

  try {
    const cfgResult = await pool.query<{ ambiente: 'homo' | 'prod' }>(
      `SELECT ambiente FROM facturacion_config WHERE cuit = $1 AND activo = true`,
      [cuit]
    )
    if (!cfgResult.rows.length) {
      return NextResponse.json(
        { error: { categoria: 'validacion', mensaje: `CUIT ${cuit} no configurado` } satisfies ErrorFacturacion },
        { status: 404 }
      )
    }
    const cfg = cfgResult.rows[0]
    const ambiente = (process.env.ARCA_AMBIENTE as 'homo' | 'prod') ?? cfg.ambiente

    const auth = await obtenerToken(cuit, ambiente)
    const ultimoNro = await obtenerUltimoNroComprobante(
      { ...auth, cuit },
      puntoVenta,
      tipoCbte,
      ambiente
    )

    return NextResponse.json({ ultimoNro, resultado: 'ok' })
  } catch (e) {
    const err = e as ErrorFacturacion
    if (err.categoria) return NextResponse.json({ error: err }, { status: 422 })
    console.error('[facturacion/consulta]', e)
    return NextResponse.json(
      { error: { categoria: 'interno', mensaje: 'Error al consultar ARCA' } satisfies ErrorFacturacion },
      { status: 500 }
    )
  }
}
