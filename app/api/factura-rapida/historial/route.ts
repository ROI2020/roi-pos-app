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
 * GET /api/factura-rapida/historial?offset=0&from=YYYY-MM-DD&to=YYYY-MM-DD&q=texto
 */
export async function GET(req: Request) {
  const auth = await getBusinessId()
  if ("error" in auth) return auth.error

  const { searchParams } = new URL(req.url)
  const offset = parseInt(searchParams.get("offset") ?? "0", 10)
  const from   = searchParams.get("from")
  const to     = searchParams.get("to")
  const q      = searchParams.get("q")?.trim().toLowerCase()

  const conditions: string[] = ["f.business_id = $1", "f.estado = 'emitida'", "f.origen_sistema != 'roipos'"]
  const params: unknown[]    = [auth.businessId]

  if (from) { params.push(from); conditions.push(`f.fecha_cbte >= $${params.length}`) }
  if (to)   { params.push(to);   conditions.push(`f.fecha_cbte <= $${params.length}`) }

  const where = conditions.join(" AND ")

  const { rows } = await pool.query(
    `SELECT
       f.id,
       LPAD(f.punto_venta::text, 5, '0') || '-' || LPAD(f.nro_comprobante::text, 8, '0') AS nro_comprobante_fmt,
       f.fecha_cbte,
       f.importe_total::float AS importe_total,
       f.cae,
       f.cae_vto,
       f.receptor_nombre,
       f.created_at,
       f.raw_request->'comprobante'->'items'->0->>'descripcion' AS descripcion
     FROM facturas f
     WHERE ${where}
     ORDER BY f.created_at DESC
     LIMIT 21 OFFSET $${params.length + 1}`,
    [...params, offset]
  )

  // Client-side q filter (simple approach; DB-level would need full-text index)
  const filtered = q
    ? rows.filter(r =>
        (r.descripcion ?? "").toLowerCase().includes(q) ||
        (r.receptor_nombre ?? "").toLowerCase().includes(q) ||
        (r.nro_comprobante_fmt ?? "").includes(q)
      )
    : rows

  const hasMore = filtered.length > 20
  return NextResponse.json({
    items:   filtered.slice(0, 20),
    hasMore,
  })
}
