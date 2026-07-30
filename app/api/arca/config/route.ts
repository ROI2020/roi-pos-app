import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'

async function requireAdmin(): Promise<{ error: NextResponse } | { businessId: number }> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return { error: NextResponse.json({ error: 'No autorizado' }, { status: 401 }) }
  try {
    const { role, business_id } = JSON.parse(decodeURIComponent(raw)) as { role: string; business_id?: number }
    if (role !== 'administrador' && role !== 'roisol_admin') return { error: NextResponse.json({ error: 'Acceso denegado' }, { status: 403 }) }
    return { businessId: business_id ?? 1 }
  } catch {
    return { error: NextResponse.json({ error: 'Sesión inválida' }, { status: 401 }) }
  }
}

interface ConfigRow {
  cuit: string
  punto_venta: number
  razon_social: string
  condicion_iva: string
  ambiente: string
  concepto: number
}

/**
 * GET /api/arca/config
 *   Sin params → lista todas las configs activas
 *   ?cuit=XX-XXXXXXXX-X → config específica + sucursales vinculadas
 */
export async function GET(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  const { searchParams } = new URL(req.url)
  const cuit = searchParams.get('cuit')

  try {
    if (cuit) {
      // Config específica + sucursales vinculadas a este CUIT
      const [cfgRes, branchRes] = await Promise.all([
        pool.query<ConfigRow>(
          `SELECT cuit, punto_venta, razon_social, condicion_iva, ambiente
           FROM facturacion_config WHERE cuit = $1 AND activo = true`,
          [cuit]
        ),
        pool.query<{ id: number; name: string; arca_pos_number: number | null }>(
          `SELECT id, name, arca_pos_number
           FROM branches WHERE cuit_emisor = $1 ORDER BY name`,
          [cuit]
        ),
      ])

      if (!cfgRes.rows.length) {
        return NextResponse.json({ existe: false, sucursales: branchRes.rows })
      }
      const cfg = cfgRes.rows[0]
      return NextResponse.json({
        existe: true,
        config: {
          cuit: cfg.cuit,
          puntoVenta: cfg.punto_venta,
          razonSocial: cfg.razon_social,
          condicionIva: cfg.condicion_iva,
          ambiente: cfg.ambiente,
        },
        sucursales: branchRes.rows,
      })
    }

    // Lista las configs del negocio autenticado
    const { rows } = await pool.query<ConfigRow>(
      `SELECT cuit, punto_venta, razon_social, condicion_iva, ambiente, concepto
       FROM facturacion_config WHERE activo = true AND business_id = $1 ORDER BY razon_social`,
      [auth.businessId]
    )
    return NextResponse.json(
      rows.map(r => ({
        cuit: r.cuit,
        puntoVenta: r.punto_venta,
        razonSocial: r.razon_social,
        condicionIva: r.condicion_iva,
        ambiente: r.ambiente,
        concepto: r.concepto as 1 | 2 | 3,
      }))
    )
  } catch (err) {
    console.error('[GET /api/arca/config]', err)
    return NextResponse.json({ error: 'Error al leer configuración' }, { status: 500 })
  }
}

/**
 * POST /api/arca/config
 * Upsert de configuración del emisor.
 */
export async function POST(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error
  const { businessId } = auth

  try {
    const { cuit, puntoVenta, razonSocial, condicionIva, ambiente, concepto } = await req.json() as {
      cuit: string
      puntoVenta: number
      razonSocial: string
      condicionIva: string
      ambiente: string
      concepto?: number
    }

    if (!cuit?.trim() || !razonSocial?.trim() || !puntoVenta) {
      return NextResponse.json({ error: 'cuit, razonSocial y puntoVenta son obligatorios' }, { status: 400 })
    }
    if (!['homo', 'prod'].includes(ambiente)) {
      return NextResponse.json({ error: 'ambiente debe ser "homo" o "prod"' }, { status: 400 })
    }
    if (!['monotributo', 'responsable_inscripto'].includes(condicionIva)) {
      return NextResponse.json({ error: 'condicionIva inválida' }, { status: 400 })
    }

    const conceptoVal = concepto && [1, 2, 3].includes(concepto) ? concepto : 1
    await pool.query(
      `INSERT INTO facturacion_config
         (cuit, punto_venta, razon_social, condicion_iva, ambiente, concepto, activo, business_id)
       VALUES ($1, $2, $3, $4, $5, $6, true, $7)
       ON CONFLICT (cuit) DO UPDATE SET
         punto_venta   = EXCLUDED.punto_venta,
         razon_social  = EXCLUDED.razon_social,
         condicion_iva = EXCLUDED.condicion_iva,
         ambiente      = EXCLUDED.ambiente,
         concepto      = EXCLUDED.concepto,
         business_id   = EXCLUDED.business_id,
         activo        = true`,
      [cuit.trim(), puntoVenta, razonSocial.trim(), condicionIva, ambiente, conceptoVal, businessId]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[POST /api/arca/config]', err)
    return NextResponse.json({ error: 'Error al guardar configuración' }, { status: 500 })
  }
}

/**
 * PATCH /api/arca/config
 * Vincula o desvincula una sucursal de un CUIT emisor.
 * Body: { branchId: number, cuit: string | null }
 *   cuit = null → desvincular
 *   cuit = 'XX-XXXXXXXX-X' → vincular
 */
export async function PATCH(req: Request) {
  const auth = await requireAdmin()
  if ('error' in auth) return auth.error

  try {
    const { branchId, cuit } = await req.json() as { branchId: number; cuit: string | null }

    if (!branchId) {
      return NextResponse.json({ error: 'branchId es obligatorio' }, { status: 400 })
    }

    await pool.query(
      `UPDATE branches SET cuit_emisor = $1 WHERE id = $2 AND business_id = $3`,
      [cuit ?? null, branchId, auth.businessId]
    )

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/arca/config]', err)
    return NextResponse.json({ error: 'Error al vincular sucursal' }, { status: 500 })
  }
}
