import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import NuevoClienteForm from '@/components/roisol/NuevoClienteForm'

export default function NuevoClientePage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/roisol/clientes" className="text-gray-400 hover:text-gray-600 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo cliente</h1>
          <p className="text-sm text-gray-500 mt-0.5">Alta de negocio con dominio y configuración ARCA</p>
        </div>
      </div>
      <NuevoClienteForm />
    </div>
  )
}
