import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'
import pool from '@/lib/db'
import SwitchBusinessSelect from '@/components/roisol/SwitchBusinessSelect'

export default async function RoisolLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value

  if (!raw) redirect('/login')

  let session: { id: number; role: string; business_id?: number }
  try {
    session = JSON.parse(decodeURIComponent(raw))
  } catch {
    redirect('/login')
  }

  if (session.role !== 'roisol_admin') redirect('/')

  // Obtener lista de negocios para el selector
  const { rows: businesses } = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM business ORDER BY name`
  )

  const currentBusinessId = session.business_id ?? 0

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <span className="text-sm font-bold text-violet-700 tracking-tight">ROISOL</span>
        <span className="text-slate-300">|</span>
        <span className="text-sm text-slate-500">Panel de administración</span>
        <div className="ml-auto">
          <SwitchBusinessSelect
            businesses={businesses}
            currentBusinessId={currentBusinessId}
          />
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
