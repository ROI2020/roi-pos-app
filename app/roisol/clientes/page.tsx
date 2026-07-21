import pool from '@/lib/db'
import Link from 'next/link'
import { Plus } from 'lucide-react'

interface ClienteRow {
  id: number
  name: string
  plan_name: string | null
  created_at: string
  dominio_primario: string | null
  total_dominios: number
  cuit: string | null
  punto_venta: number | null
  ambiente: string | null
}

async function getClientes(): Promise<ClienteRow[]> {
  const { rows } = await pool.query<ClienteRow>(
    `SELECT
       b.id,
       b.name,
       p.name          AS plan_name,
       b.created_at,
       bd_p.domain     AS dominio_primario,
       COUNT(bd.id)    AS total_dominios,
       fc.cuit,
       fc.punto_venta,
       fc.ambiente
     FROM business b
     LEFT JOIN business_plan bp    ON bp.id = b.active_subscription_id
     LEFT JOIN plans p             ON p.id  = bp.plan_id
     LEFT JOIN business_domains bd ON bd.business_id = b.id
     LEFT JOIN business_domains bd_p
            ON bd_p.business_id = b.id AND bd_p.is_primary = true
     LEFT JOIN facturacion_config fc
            ON fc.business_id = b.id AND fc.activo = true
     GROUP BY b.id, p.name, bd_p.domain, fc.cuit, fc.punto_venta, fc.ambiente
     ORDER BY b.created_at DESC`
  )
  return rows
}

export default async function ClientesPage() {
  const clientes = await getClientes()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clientes</h1>
          <p className="text-sm text-gray-500 mt-0.5">{clientes.length} negocio{clientes.length !== 1 ? 's' : ''} registrado{clientes.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          href="/roisol/clientes/nuevo"
          className="flex items-center gap-2 bg-violet-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Nuevo cliente
        </Link>
      </div>

      <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              {['Nombre', 'Dominio primario', 'CUIT', 'PV', 'Ambiente', 'Plan', 'Dominios', 'Alta'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clientes.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-gray-400 text-sm">
                  No hay clientes registrados aún.
                </td>
              </tr>
            )}
            {clientes.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{c.name}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.dominio_primario ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600 font-mono text-xs">{c.cuit ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.punto_venta ?? '—'}</td>
                <td className="px-4 py-3">
                  {c.ambiente
                    ? <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.ambiente === 'prod' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                        {c.ambiente === 'prod' ? 'Producción' : 'Homo'}
                      </span>
                    : '—'}
                </td>
                <td className="px-4 py-3 text-gray-600">{c.plan_name ?? '—'}</td>
                <td className="px-4 py-3 text-gray-600">{c.total_dominios}</td>
                <td className="px-4 py-3 text-gray-400 text-xs">
                  {new Date(c.created_at).toLocaleDateString('es-AR')}
                </td>
                <td className="px-4 py-3">
                  <Link
                    href={`/roisol/clientes/${c.id}`}
                    className="text-violet-600 hover:underline text-xs font-medium"
                  >
                    Ver detalle
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
