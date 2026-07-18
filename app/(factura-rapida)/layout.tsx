import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ReactNode } from "react"
import pool from "@/lib/db"
import { FRHeader } from "./_components/fr-header"

const PLAN_FACTURA_RAPIDA_ID = 10

export default async function FacturaRapidaLayout({ children }: { children: ReactNode }) {
  // Verificar sesión
  const cookieStore = await cookies()
  const raw = cookieStore.get("roipos_session")?.value
  if (!raw) redirect("/sin-acceso")

  let session: { id: number; role: string; business_id?: number }
  try {
    session = JSON.parse(decodeURIComponent(raw))
  } catch {
    redirect("/sin-acceso")
  }

  if (session.role !== "administrador") redirect("/sin-acceso")

  const businessId = session.business_id
  if (!businessId) redirect("/sin-acceso")

  // Verificar que el plan del business es factura_rapida
  const { rows } = await pool.query<{ active_plan_id: number; name: string }>(
    `SELECT active_plan_id, name FROM business WHERE id = $1`,
    [businessId]
  )

  if (!rows.length || Number(rows[0].active_plan_id) !== PLAN_FACTURA_RAPIDA_ID) {
    redirect("/sin-acceso")
  }

  const businessName = rows[0].name

  return (
    <div className="min-h-screen bg-slate-50">
      <FRHeader businessName={businessName} />
      <div className="max-w-4xl mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  )
}
