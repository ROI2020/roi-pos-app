import { NextResponse } from 'next/server'
import pool from '@/lib/db'

/**
 * GET /api/facturacion/config?branchId=X
 *
 * Devuelve la configuración ARCA activa para una sucursal.
 * Join por las DOS columnas: branches.cuit_emisor = fc.cuit
 *                        AND branches.arca_pos_number = fc.punto_venta
 * Retorna { cuit: null } si la sucursal no tiene cuit_emisor configurado.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const branchId = parseInt(searchParams.get('branchId') ?? '0', 10)

  if (!branchId) {
    return NextResponse.json({ cuit: null }, { status: 200 })
  }

  try {
    const { rows } = await pool.query<{ cuit: string; punto_venta: number; razon_social: string }>(
      `SELECT fc.cuit, fc.punto_venta, fc.razon_social
       FROM branches b
       JOIN facturacion_config fc
         ON fc.cuit          = b.cuit_emisor
        AND fc.punto_venta   = b.arca_pos_number
        AND fc.activo        = true
       WHERE b.id = $1
       LIMIT 1`,
      [branchId]
    )

    if (!rows.length) return NextResponse.json({ cuit: null })
    return NextResponse.json(rows[0])
  } catch (err) {
    console.error('[GET /api/facturacion/config]', err)
    return NextResponse.json({ cuit: null })
  }
}
