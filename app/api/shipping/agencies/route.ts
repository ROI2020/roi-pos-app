import { NextResponse } from 'next/server'
import { getAgencies } from '@/lib/correo/correoArgentino'

/**
 * GET /api/shipping/agencies?province=C&receives=true
 *
 * Endpoint público — sin autenticación.
 * Proxy a GET /v1/agencies de PAQ.AR, filtrado por provincia.
 *
 * Query params:
 *   province   string  — código de provincia PAQ.AR (1 letra)
 *   receives   'true'  — solo sucursales que reciben paquetes del vendedor
 *   delivers   'true'  — solo sucursales que entregan al comprador
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const province  = searchParams.get('province') ?? undefined
  const receives  = searchParams.get('receives') === 'true'
  const delivers  = searchParams.get('delivers') === 'true'

  try {
    const agencies = await getAgencies({
      province,
      receivesPackages: receives || undefined,
      deliversPackages: delivers || undefined,
    })

    return NextResponse.json(agencies)
  } catch (err) {
    console.error('[GET /api/shipping/agencies]', err)
    // Si PAQ.AR falla (sin credenciales en test), devolver array vacío con info
    return NextResponse.json(
      { error: String(err), agencies: [] },
      { status: 502 }
    )
  }
}
