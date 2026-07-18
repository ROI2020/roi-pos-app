'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Plan {
  id: string
  name: string
  level: number
}

interface Resultado {
  businessId: number
  subdomain: string
  dominioPropio?: string
  recordatorioNetlify: string
  nombre: string
  cuit: string
  puntoVenta: number
  ambiente: string
  planName: string
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 63)
}

function validarCuit(cuit: string): boolean {
  const digits = cuit.replace(/\D/g, '')
  if (digits.length !== 11) return false
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]
  const sum = weights.reduce((acc, w, i) => acc + w * parseInt(digits[i]), 0)
  const rem = sum % 11
  const check = rem === 0 ? 0 : rem === 1 ? 9 : 11 - rem
  return check === parseInt(digits[10])
}

export default function NuevoClienteForm() {
  const router = useRouter()
  const [planes, setPlanes] = useState<Plan[]>([])
  const [form, setForm] = useState({
    nombre: '',
    activePlanId: '',
    slug: '',
    dominioPropio: '',
    cuit: '',
    puntoVenta: 1,
    razonSocial: '',
    condicionIva: 'monotributo' as 'monotributo' | 'responsable_inscripto',
    ambiente: 'homo' as 'homo' | 'prod',
    emailAdmin: '',
  })
  const [slugManual, setSlugManual] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)

  useEffect(() => {
    fetch('/api/plans').then(r => r.json()).then(setPlanes).catch(() => {})
  }, [])

  function handleNombre(nombre: string) {
    setForm(f => ({
      ...f,
      nombre,
      slug: slugManual ? f.slug : slugify(nombre),
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!/^[a-z0-9-]{1,63}$/.test(form.slug)) {
      setError('El slug solo puede contener minúsculas, números y guiones (máx. 63 caracteres).')
      return
    }
    if (!validarCuit(form.cuit)) {
      setError('CUIT inválido. Verificá el número y el dígito verificador.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/roisol/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }

      const planName = planes.find(p => p.id === form.activePlanId)?.name ?? form.activePlanId
      setResultado({ ...data, nombre: form.nombre, cuit: form.cuit, puntoVenta: form.puntoVenta, ambiente: form.ambiente, planName })
    } catch {
      setError('Error de red al crear el cliente.')
    } finally {
      setSaving(false)
    }
  }

  if (resultado) {
    return (
      <div className="max-w-lg space-y-6">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle2 className="h-6 w-6" />
          <h2 className="text-xl font-bold">Cliente creado exitosamente</h2>
        </div>

        <div className="bg-white border rounded-lg p-5 text-sm space-y-2">
          <p><span className="text-gray-500 w-28 inline-block">Negocio:</span> <strong>{resultado.nombre}</strong></p>
          <p><span className="text-gray-500 w-28 inline-block">Plan:</span> {resultado.planName}</p>
          <p><span className="text-gray-500 w-28 inline-block">CUIT:</span> {resultado.cuit}</p>
          <p><span className="text-gray-500 w-28 inline-block">PV:</span> {resultado.puntoVenta} ({resultado.ambiente === 'prod' ? 'Producción' : 'Homologación'})</p>
        </div>

        <div className="bg-white border rounded-lg p-5 text-sm space-y-2">
          <p className="font-medium text-gray-800">Dominios configurados:</p>
          <p className="font-mono text-xs text-violet-700">{resultado.subdomain} (subdominio)</p>
          {resultado.dominioPropio && (
            <p className="font-mono text-xs text-violet-700">{resultado.dominioPropio} (primario)</p>
          )}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm space-y-2">
          <p className="font-medium text-amber-800">⚠️ Netlify</p>
          <p className="text-amber-700">{resultado.recordatorioNetlify}</p>
        </div>

        <div className="bg-slate-50 border rounded-lg p-4 text-sm space-y-1">
          <p className="font-medium text-gray-700">Próximos pasos para este cliente:</p>
          <ul className="list-disc list-inside text-gray-600 space-y-1">
            <li>Pedirle que delegue el servicio <strong>wsfe</strong> en ARCA a CUIT ROISOL</li>
            <li>Verificar conexión en la pantalla de Config. ARCA del cliente</li>
          </ul>
        </div>

        <div className="flex gap-3">
          <Button onClick={() => router.push(`/roisol/clientes/${resultado.businessId}`)}>
            Ver detalle del cliente
          </Button>
          <Button variant="outline" onClick={() => setResultado(null)}>
            + Nuevo cliente
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg space-y-8">

      {/* Datos del negocio */}
      <section className="space-y-4">
        <h2 className="font-semibold text-gray-800 border-b pb-2">Datos del negocio</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Nombre del negocio</label>
          <input
            type="text"
            value={form.nombre}
            onChange={e => handleNombre(e.target.value)}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Plan</label>
          <select
            value={form.activePlanId}
            onChange={e => setForm(f => ({ ...f, activePlanId: e.target.value }))}
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            required
          >
            <option value="">Seleccionar plan...</option>
            {planes.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Dominio */}
      <section className="space-y-4">
        <h2 className="font-semibold text-gray-800 border-b pb-2">Subdominio ROISOL</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
          <div className="flex items-center gap-0">
            <input
              type="text"
              value={form.slug}
              onChange={e => { setSlugManual(true); setForm(f => ({ ...f, slug: e.target.value })) }}
              placeholder="mi-negocio"
              pattern="^[a-z0-9-]{1,63}$"
              className="flex-1 border rounded-l-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              required
            />
            <span className="border border-l-0 rounded-r-md px-3 py-2 text-sm bg-gray-50 text-gray-500">.roisol.com.ar</span>
          </div>
          {form.slug && (
            <p className="text-xs text-violet-600 mt-1">→ {form.slug}.roisol.com.ar</p>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Dominio propio <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={form.dominioPropio}
            onChange={e => setForm(f => ({ ...f, dominioPropio: e.target.value }))}
            placeholder="malema.com.ar"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <p className="text-xs text-gray-400 mt-1">
            Si se completa, es el dominio primario. El subdominio quedará como secundario.
          </p>
        </div>
      </section>

      {/* Config ARCA */}
      <section className="space-y-4">
        <h2 className="font-semibold text-gray-800 border-b pb-2">Configuración ARCA</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CUIT</label>
            <input
              type="text"
              value={form.cuit}
              onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))}
              placeholder="20-12345678-9"
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Punto de Venta</label>
            <input
              type="number"
              value={form.puntoVenta}
              onChange={e => setForm(f => ({ ...f, puntoVenta: parseInt(e.target.value) || 1 }))}
              min={1}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              required
            />
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Razón Social</label>
            <input
              type="text"
              value={form.razonSocial}
              onChange={e => setForm(f => ({ ...f, razonSocial: e.target.value }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condición IVA</label>
            <select
              value={form.condicionIva}
              onChange={e => setForm(f => ({ ...f, condicionIva: e.target.value as 'monotributo' | 'responsable_inscripto' }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="monotributo">Monotributista</option>
              <option value="responsable_inscripto">Responsable Inscripto</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ambiente</label>
            <select
              value={form.ambiente}
              onChange={e => setForm(f => ({ ...f, ambiente: e.target.value as 'homo' | 'prod' }))}
              className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            >
              <option value="homo">Homologación (pruebas)</option>
              <option value="prod">Producción</option>
            </select>
            {form.ambiente === 'prod' && (
              <p className="text-xs text-amber-600 mt-1 font-medium">⚠️ Producción emite facturas reales.</p>
            )}
          </div>
        </div>
      </section>

      {/* Acceso del administrador */}
      <section className="space-y-4">
        <h2 className="font-semibold text-gray-800 border-b pb-2">Acceso del administrador</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Email Google <span className="text-gray-400 font-normal">(opcional)</span>
          </label>
          <input
            type="email"
            value={form.emailAdmin}
            onChange={e => setForm(f => ({ ...f, emailAdmin: e.target.value }))}
            placeholder="cliente@gmail.com"
            className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          <p className="text-xs text-gray-400 mt-1">El cliente usará este Gmail para ingresar.</p>
        </div>
      </section>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" disabled={saving} className="w-full">
        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
        Crear cliente
      </Button>
    </form>
  )
}
