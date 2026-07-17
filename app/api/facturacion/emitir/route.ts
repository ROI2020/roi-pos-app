import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'
import { motorFacturacion } from '@/lib/facturacion/motor'
import { adaptarVentaROIPOS } from '@/lib/facturacion/adapters/roipos.adapter'
import { adaptarDirecto } from '@/lib/facturacion/adapters/direct.adapter'
import type { FacturacionInput, ErrorFacturacion } from '@/lib/facturacion/types'

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
 * POST /api/facturacion/emitir
 *
 * Opción A — desde ROIPOS: { ventaId: string, cuitEmisor: string }
 * Opción B — llamada directa: { input: FacturacionInput }
 */
export async function POST(req: Request) {
  const blocked = await requireAdmin()
  if (blocked) return blocked

  let input: FacturacionInput

  try {
    const body = await req.json()

    if (body.ventaId && body.cuitEmisor) {
      // Opción A: leer venta desde ROIPOS y construir el input
      input = await adaptarVentaROIPOS(Number(body.ventaId), body.cuitEmisor)
    } else if (body.input) {
      // Opción B: input ya construido por el caller
      input = adaptarDirecto(body.input as FacturacionInput)
    } else {
      return NextResponse.json(
        {
          error: {
            categoria: 'validacion',
            mensaje: 'Body inválido: enviá { ventaId, cuitEmisor } o { input: FacturacionInput }',
          } satisfies ErrorFacturacion,
        },
        { status: 400 }
      )
    }
  } catch (e) {
    const err = e as ErrorFacturacion
    if (err.categoria) {
      return NextResponse.json({ error: err }, { status: 422 })
    }
    console.error('[facturacion/emitir] error al preparar input:', e)
    return NextResponse.json(
      { error: { categoria: 'interno', mensaje: 'Error interno al preparar la factura' } satisfies ErrorFacturacion },
      { status: 500 }
    )
  }

  try {
    const output = await motorFacturacion(input)

    // Si el origen es ROIPOS, actualizar también la tabla sales con el CAE y número de comprobante
    if (input.meta.origenSistema === 'roipos' && input.meta.origenId) {
      const invoiceNumber =
        `${String(input.emisor.puntoVenta).padStart(5, '0')}-${String(output.nroComprobante).padStart(8, '0')}`
      await pool.query(
        `UPDATE sales SET arca_cae = $1, arca_vto_cae = $2, invoice_number = $3 WHERE id = $4`,
        [output.cae, output.caeVencimiento, invoiceNumber, Number(input.meta.origenId)]
      )
    }

    return NextResponse.json(output, { status: 200 })
  } catch (e) {
    const err = e as ErrorFacturacion
    if (err.categoria) {
      console.error('[facturacion/emitir] error ARCA:', err)
      return NextResponse.json({ error: err }, { status: 422 })
    }
    console.error('[facturacion/emitir] error inesperado:', e)
    return NextResponse.json(
      { error: { categoria: 'interno', mensaje: 'Error interno del servidor' } satisfies ErrorFacturacion },
      { status: 500 }
    )
  }
}
