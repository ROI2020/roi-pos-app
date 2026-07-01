import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import pool from '@/lib/db'
import ClienteDetalle from '@/components/roisol/ClienteDetalle'

interface ClienteCompleto {
  id: number
  name: string
  active_plan_id: number | null
  plan_name: string | null
  created_at: string
  dominios: Array<{ id: string; domain: string; is_primary: boolean }>
  facturacion: {
    cuit: string
    punto_venta: number
    razon_social: string
    condicion_iva: string
    ambiente: 'homo' | 'prod'
    activo: boolean
  } | null
}

async function getCliente(id: string): Promise<ClienteCompleto | null> {
  const [bizRes, domRes, fcRes] = await Promise.all([
    pool.query<{ id: number; name: string; active_plan_id: number | null; plan_name: string | null; created_at: string }>(
      `SELECT b.id, b.name, b.active_plan_id, p.name AS plan_name, b.created_at
       FROM business b
       LEFT JOIN plans p ON p.id = b.active_plan_id
       WHERE b.id = $1`,
      [id]
    ),
    pool.query<{ id: string; domain: string; is_primary: boolean }>(
      `SELECT id, domain, is_primary FROM business_domains WHERE business_id = $1 ORDER BY is_primary DESC, domain`,
      [id]
    ),
    pool.query<{ cuit: string; punto_venta: number; razon_social: string; condicion_iva: string; ambiente: 'homo' | 'prod'; activo: boolean }>(
      `SELECT cuit, punto_venta, razon_social, condicion_iva, ambiente, activo
       FROM facturacion_config WHERE business_id = $1 LIMIT 1`,
      [id]
    ),
  ])

  if (bizRes.rows.length === 0) return null

  return {
    ...bizRes.rows[0],
    dominios: domRes.rows,
    facturacion: fcRes.rows[0] ?? null,
  }
}

export default async function ClienteDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cliente = await getCliente(id)
  if (!cliente) notFound()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/roisol/clientes" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{cliente.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Alta: {new Date(cliente.created_at).toLocaleDateString('es-AR')}
            {cliente.plan_name && <> &middot; Plan: {cliente.plan_name}</>}
          </p>
        </div>
      </div>

      <ClienteDetalle cliente={cliente} />
    </div>
  )
}
