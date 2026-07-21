import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import pool from "@/lib/db"

async function getBusinessId(): Promise<{ businessId: number } | { error: NextResponse }> {
  const cookieStore = await cookies()
  const raw = cookieStore.get("roipos_session")?.value
  if (!raw) return { error: NextResponse.json({ error: "No autorizado" }, { status: 401 }) }
  try {
    const { role, business_id } = JSON.parse(decodeURIComponent(raw)) as { role: string; business_id?: number }
    if (role !== "administrador" && role !== "roisol_admin") return { error: NextResponse.json({ error: "Acceso denegado" }, { status: 403 }) }
    if (!business_id) return { error: NextResponse.json({ error: "Sin negocio asociado" }, { status: 400 }) }
    return { businessId: business_id }
  } catch {
    return { error: NextResponse.json({ error: "Sesión inválida" }, { status: 401 }) }
  }
}

/**
 * GET /api/factura-rapida/config
 * Retorna la configuración ARCA para el tenant actual.
 */
export async function GET() {
  const auth = await getBusinessId()
  if ("error" in auth) return auth.error

  const { rows } = await pool.query<{
    cuit: string
    punto_venta: number
    razon_social: string
    condicion_iva: string
    ambiente: string
    last_verified_at: string | null
  }>(
    `SELECT cuit, punto_venta, razon_social, condicion_iva, ambiente, last_verified_at
     FROM facturacion_config
     WHERE business_id = $1 AND activo = true
     LIMIT 1`,
    [auth.businessId]
  )

  if (!rows.length) return NextResponse.json({ error: "Sin configuración ARCA" }, { status: 404 })

  const cfg = rows[0]
  return NextResponse.json({
    cuit:           cfg.cuit,
    puntoVenta:     cfg.punto_venta,
    razonSocial:    cfg.razon_social,
    condicionIva:   cfg.condicion_iva as "monotributo" | "responsable_inscripto",
    ambiente:       cfg.ambiente as "homo" | "prod",
    lastVerifiedAt: cfg.last_verified_at,
  })
}
