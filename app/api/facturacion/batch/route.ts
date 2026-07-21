import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { motorFacturacion } from '@/lib/facturacion/motor'
import { adaptarVentaROIPOS } from '@/lib/facturacion/adapters/roipos.adapter'
import { adaptarDirecto } from '@/lib/facturacion/adapters/direct.adapter'
import pool from '@/lib/db'
import type { FacturacionInput, FacturacionOutput, ErrorFacturacion } from '@/lib/facturacion/types'

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
    if (role !== 'administrador' && role !== 'roisol_admin') {
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

interface BatchItem {
  ventaId?: string
  input?: FacturacionInput
}

type BatchResultado =
  | { ok: true; ventaId?: string; output: FacturacionOutput }
  | { ok: false; ventaId?: string; error: ErrorFacturacion }

/**
 * POST /api/facturacion/batch
 *
 * Body: { items: Array<{ ventaId?: string, input?: FacturacionInput }>, cuitEmisor: string }
 *
 * Procesa en loop secuencial con 500ms entre requests (ARCA tiene rate limits).
 * Todos los ítems pertenecen al mismo CUIT (cuitEmisor).
 */
export async function POST(req: Request) {
  const blocked = await requireAdmin()
  if (blocked) return blocked

  const body = await req.json()
  const items: BatchItem[] = body.items ?? []
  const cuitEmisor: string = body.cuitEmisor ?? ''

  if (!cuitEmisor || !items.length) {
    return NextResponse.json(
      {
        error: {
          categoria: 'validacion',
          mensaje: 'Body inválido: { items: [...], cuitEmisor: string }',
        } satisfies ErrorFacturacion,
      },
      { status: 400 }
    )
  }

  if (items.length > 20) {
    return NextResponse.json(
      { error: { categoria: 'validacion', mensaje: 'Máximo 20 ítems por batch.' } satisfies ErrorFacturacion },
      { status: 400 }
    )
  }

  const resultados: BatchResultado[] = []

  for (const item of items) {
    try {
      let input: FacturacionInput

      if (item.ventaId) {
        input = await adaptarVentaROIPOS(Number(item.ventaId), cuitEmisor)
      } else if (item.input) {
        input = adaptarDirecto(item.input)
      } else {
        resultados.push({
          ok: false,
          ventaId: item.ventaId,
          error: { categoria: 'validacion', mensaje: 'Ítem sin ventaId ni input' },
        })
        continue
      }

      const output = await motorFacturacion(input)

      // Actualizar sales.arca_cae y invoice_number si es origen ROIPOS
      if (input.meta.origenSistema === 'roipos' && input.meta.origenId) {
        const invoiceNumber =
          `${String(input.emisor.puntoVenta).padStart(5, '0')}-${String(output.nroComprobante).padStart(8, '0')}`
        await pool.query(
          `UPDATE sales SET arca_cae = $1, arca_vto_cae = $2, invoice_number = $3 WHERE id = $4`,
          [output.cae, output.caeVencimiento, invoiceNumber, Number(input.meta.origenId)]
        )
      }

      resultados.push({ ok: true, ventaId: item.ventaId, output })
    } catch (e) {
      const err = e as ErrorFacturacion
      resultados.push({
        ok: false,
        ventaId: item.ventaId,
        error: err.categoria
          ? err
          : { categoria: 'interno', mensaje: String(e) },
      })
      console.error('[facturacion/batch] error en ítem:', item.ventaId, e)
    }

    // Delay entre requests para respetar rate limits de ARCA
    await new Promise(r => setTimeout(r, 500))
  }

  const exitosos = resultados.filter(r => r.ok).length
  const fallidos = resultados.filter(r => !r.ok).length

  return NextResponse.json({ exitosos, fallidos, resultados })
}
