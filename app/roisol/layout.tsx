import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { ReactNode } from 'react'

// Panel interno ROISOL — solo accesible con rol roisol_admin
export default async function RoisolLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value

  if (!raw) redirect('/login')

  try {
    const { role } = JSON.parse(decodeURIComponent(raw)) as { role: string }
    if (role !== 'roisol_admin') redirect('/')
  } catch {
    redirect('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b px-6 py-3 flex items-center gap-3">
        <span className="text-sm font-bold text-violet-700 tracking-tight">ROISOL</span>
        <span className="text-slate-300">|</span>
        <span className="text-sm text-slate-500">Panel de administración</span>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
