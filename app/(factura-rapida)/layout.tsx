import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import { ReactNode } from "react"
import pool from "@/lib/db"
import { FRHeader } from "./_components/fr-header"

const PLAN_FACTURA_RAPIDA_ID = 10

const FR_ROLES = ["administrador", "roisol_admin"]

export default async function FacturaRapidaLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const raw = cookieStore.get("roipos_session")?.value
  if (!raw) redirect("/login")

  let session: { id: number; role: string; business_id?: number }
  try {
    session = JSON.parse(decodeURIComponent(raw))
  } catch {
    redirect("/login")
  }

  if (!FR_ROLES.includes(session.role)) redirect("/login")

  const businessId = session.business_id
  if (!businessId) redirect("/login")

  // Verificar que el plan activo del business es Factura Rápida (plans.id = 10)
  const { rows } = await pool.query<{ plan_id: number; name: string }>(
    `SELECT COALESCE(p.id, 0) AS plan_id, b.name
     FROM business b
     LEFT JOIN business_plan bp ON bp.id = b.active_subscription_id
     LEFT JOIN plans p          ON p.id  = bp.plan_id
     WHERE b.id = $1`,
    [businessId]
  )

  if (!rows.length || rows[0].plan_id !== PLAN_FACTURA_RAPIDA_ID) {
    redirect("/login")
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
