"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Search, Plus, Pencil, Trash2, CheckCircle2, Circle,
  Phone, QrCode, ShieldCheck, RefreshCw, Users, X,
} from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge }    from "@/components/ui/badge"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import QRCode from "qrcode"

// ── Types ──────────────────────────────────────────────────────────────────────
interface Customer {
  id:                  number
  name:                string
  phone:               string
  consent_policies:    boolean
  consent_news:        boolean
  consent_images:      boolean
  consented_at:        string | null
  verified:            boolean
  last_roulette_month: string | null
  created_at:          string
  updated_at:          string
}

interface VerifyData {
  code:       string
  wa_link:    string | null
  expires_at: string
}

const EMPTY_FORM = {
  name:             '',
  phone:            '',
  consent_policies: false,
  consent_news:     false,
  consent_images:   false,
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function currentMonth() {
  return new Date().toISOString().slice(0, 7)
}

/**
 * Normaliza un teléfono al formato WA argentino: 549 + área + local (13 dígitos).
 * Casos contemplados:
 *   5491131005865  → 5491131005865   (ya completo)
 *   541131005865   → 5491131005865   (fijo → agregar 9)
 *   01131005865    → 5491131005865   (con 0 inicial)
 *   1131005865     → 5491131005865   (área + local, 10 dígitos)
 *   +54 9 11…      → 5491131005865   (con + y espacios)
 */
function normalizePhone(raw: string): string {
  const d = raw.replace(/\D/g, '')
  if (!d) return ''
  // Completo: 549 + área + local = 13 dígitos
  if (d.startsWith('549') && d.length === 13) return d
  // 54 + área + local (fijo), sin 9 → agregar 9 → 13d
  if (d.startsWith('54') && !d.startsWith('549') && d.length === 12) return '549' + d.slice(2)
  // 0 + área + local → quitar 0, agregar 549 → 13d
  if (d.startsWith('0') && d.length === 11) return '549' + d.slice(1)
  // área + local sin prefijo → 10d
  if (d.length === 10) return '549' + d
  return d
}

/** Devuelve true cuando el número parece completo (formato WA argentino). */
function isPhoneComplete(n: string): boolean {
  return n.startsWith('549') && n.length === 13
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CustomersPanel() {
  const [customers, setCustomers]     = useState<Customer[]>([])
  const [loading, setLoading]         = useState(true)
  const [search, setSearch]           = useState('')

  // Dialog states
  const [dialogOpen, setDialogOpen]   = useState(false)
  const [editing, setEditing]         = useState<Customer | null>(null)
  const [form, setForm]               = useState({ ...EMPTY_FORM })
  const [saving, setSaving]           = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null)

  // Verification flow
  const [verifyOpen, setVerifyOpen]   = useState(false)
  const [verifyCustomer, setVerifyCustomer] = useState<Customer | null>(null)
  const [verifyData, setVerifyData]   = useState<VerifyData | null>(null)
  const [qrDataUrl, setQrDataUrl]     = useState<string | null>(null)
  const [confirming, setConfirming]   = useState(false)
  const [generating, setGenerating]   = useState(false)

  const logoUrl = useRef<string>('/icon.svg')

  // Cargar logo del negocio para el overlay del QR
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((s: Record<string, string | null>) => {
        if (s.business_logo) logoUrl.current = s.business_logo
      })
      .catch(() => {})
  }, [])

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const qs  = search ? `?q=${encodeURIComponent(search)}` : ''
      const res = await fetch(`/api/customers${qs}`)
      if (!res.ok) throw new Error(await res.text())
      setCustomers(await res.json())
    } catch (e) {
      toast.error(`Error al cargar clientes: ${e}`)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => { load() }, [load])

  // ── Form helpers ───────────────────────────────────────────────────────────
  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(c: Customer) {
    setEditing(c)
    setForm({
      name:             c.name,
      phone:            c.phone,
      consent_policies: c.consent_policies,
      consent_news:     c.consent_news,
      consent_images:   c.consent_images,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.name.trim())  { toast.error('Nombre requerido');   return }
    if (!form.phone.trim()) { toast.error('Teléfono requerido'); return }
    const normalizedPhone = normalizePhone(form.phone)
    if (!normalizedPhone)       { toast.error('Teléfono inválido'); return }
    if (!isPhoneComplete(normalizedPhone)) {
      toast.error('El teléfono parece incompleto. Incluí el código de área (ej: 11 para CABA, 351 para Córdoba)')
      return
    }
    setSaving(true)
    try {
      const url    = editing ? `/api/customers/${editing.id}` : '/api/customers'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, phone: normalizedPhone }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al guardar'); return }

      toast.success(editing ? 'Cliente actualizado' : 'Cliente creado')
      setDialogOpen(false)
      await load()

      // Si es nuevo y no está verificado → ofrecer verificación
      if (!editing && !data.verified) {
        setVerifyCustomer(data)
        setVerifyData(null)
        setQrDataUrl(null)
        setVerifyOpen(true)
      }
    } catch (e) {
      toast.error(`Error: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/customers/${deleteTarget.id}`, { method: 'DELETE' })
    if (res.ok) {
      toast.success('Cliente eliminado')
      setDeleteTarget(null)
      load()
    } else {
      const d = await res.json()
      toast.error(d.error ?? 'Error al eliminar')
    }
  }

  // ── Verification ───────────────────────────────────────────────────────────
  async function openVerify(c: Customer) {
    setVerifyCustomer(c)
    setVerifyData(null)
    setQrDataUrl(null)
    setVerifyOpen(true)
  }

  async function generateCode() {
    if (!verifyCustomer) return
    setGenerating(true)
    try {
      const res  = await fetch(`/api/customers/${verifyCustomer.id}/code`, { method: 'POST' })
      const data = await res.json() as VerifyData
      if (!res.ok) { toast.error((data as { error?: string }).error ?? 'Error'); return }
      setVerifyData(data)

      // Generar QR si hay link de WhatsApp
      if (data.wa_link) {
        const url = await QRCode.toDataURL(data.wa_link, {
          width: 240,
          margin: 2,
          errorCorrectionLevel: 'H',
          color: { dark: '#1e293b', light: '#ffffff' },
        })
        setQrDataUrl(url)
      }
    } finally {
      setGenerating(false)
    }
  }

  async function confirmVerify() {
    if (!verifyCustomer) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/customers/${verifyCustomer.id}/verify`, { method: 'POST' })
      if (res.ok) {
        toast.success('✅ Cliente verificado correctamente')
        setVerifyOpen(false)
        load()
      } else {
        const d = await res.json()
        toast.error(d.error ?? 'Error al verificar')
      }
    } finally {
      setConfirming(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const eligible = (c: Customer) => c.verified && c.last_roulette_month !== currentMonth()

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-violet-600" />
          <h1 className="text-xl font-bold text-gray-800">Clientes</h1>
          {!loading && (
            <span className="text-xs text-gray-400 font-normal">
              ({customers.length})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <Input
              placeholder="Buscar nombre o teléfono…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm w-56"
            />
          </div>
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5 mr-1" />Nuevo cliente
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Teléfono</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-600">Verificado</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-600">Políticas</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-600">Novedades</th>
              <th className="text-center px-3 py-2.5 font-medium text-gray-600">Fotos</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Última ruleta</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Alta</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && customers.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-gray-400 text-sm">
                  No hay clientes registrados
                </td>
              </tr>
            )}
            {customers.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-800">
                  {c.name}
                  {eligible(c) && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold
                                     bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full">
                      🎡 Puede girar
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3 w-3 text-gray-400" />
                    {c.phone}
                  </span>
                </td>
                <td className="px-3 py-3 text-center">
                  {c.verified
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                    : <Circle      className="h-4 w-4 text-gray-300 mx-auto" />}
                </td>
                <td className="px-3 py-3 text-center">
                  {c.consent_policies
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                    : <X            className="h-4 w-4 text-gray-300 mx-auto" />}
                </td>
                <td className="px-3 py-3 text-center">
                  {c.consent_news
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                    : <X            className="h-4 w-4 text-gray-300 mx-auto" />}
                </td>
                <td className="px-3 py-3 text-center">
                  {c.consent_images
                    ? <CheckCircle2 className="h-4 w-4 text-green-500 mx-auto" />
                    : <X            className="h-4 w-4 text-gray-300 mx-auto" />}
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">
                  {c.last_roulette_month
                    ? c.last_roulette_month
                    : <span className="text-gray-300">—</span>}
                </td>
                <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(c.created_at)}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-1 justify-end">
                    {!c.verified && (
                      <Button
                        size="sm" variant="outline"
                        className="h-7 px-2 text-violet-600 border-violet-200 hover:bg-violet-50"
                        onClick={() => openVerify(c)}
                        title="Verificar por WhatsApp"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm" variant="ghost"
                      className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => setDeleteTarget(c)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre *</Label>
              <Input
                placeholder="Nombre completo"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>WhatsApp / Teléfono *</Label>
              <Input
                placeholder="Ej: 011 5555-7777  ó  +54 9 351 612-3456"
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                onBlur={() => {
                  const n = normalizePhone(form.phone.trim())
                  if (n && n !== form.phone.trim()) setForm(f => ({ ...f, phone: n }))
                }}
              />
              {form.phone.trim() && (() => {
                const n = normalizePhone(form.phone.trim())
                if (isPhoneComplete(n))
                  return <p className="text-[11px] text-green-600">✓ Se guardará como: {n}</p>
                if (n)
                  return <p className="text-[11px] text-amber-500">⚠️ Incluí código de área (ej: 11 para CABA, 351 para Córdoba)</p>
                return null
              })()}
            </div>

            <div className="space-y-3 pt-1">
              <p className="text-sm font-medium text-gray-700">Consentimientos</p>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent_policies"
                  checked={form.consent_policies}
                  onCheckedChange={v => setForm(f => ({ ...f, consent_policies: !!v }))}
                />
                <Label htmlFor="consent_policies" className="text-sm font-normal text-gray-600 leading-snug cursor-pointer">
                  Acepta las <span className="font-medium text-violet-600">políticas y términos</span>
                  <span className="ml-1 text-[10px] text-violet-500 font-semibold uppercase tracking-wide">
                    (requerido para participar)
                  </span>
                </Label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent_news"
                  checked={form.consent_news}
                  onCheckedChange={v => setForm(f => ({ ...f, consent_news: !!v }))}
                />
                <Label htmlFor="consent_news" className="text-sm font-normal text-gray-600 cursor-pointer">
                  Quiere recibir <span className="font-medium">novedades y promociones</span>
                </Label>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="consent_images"
                  checked={form.consent_images}
                  onCheckedChange={v => setForm(f => ({ ...f, consent_images: !!v }))}
                />
                <Label htmlFor="consent_images" className="text-sm font-normal text-gray-600 cursor-pointer">
                  Permite subir sus <span className="font-medium">imágenes a redes sociales</span>
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Verification Dialog */}
      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-violet-600" />
              Verificar teléfono
            </DialogTitle>
          </DialogHeader>

          {verifyCustomer && (
            <div className="space-y-4 py-2">
              <p className="text-sm text-gray-600">
                Cliente: <span className="font-medium text-gray-800">{verifyCustomer.name}</span>
                <br />
                Teléfono: <span className="font-medium text-gray-800">{verifyCustomer.phone}</span>
              </p>

              {!verifyData ? (
                <div className="text-center space-y-3">
                  <p className="text-sm text-gray-500">
                    Generá un código para que el cliente lo envíe por WhatsApp.
                  </p>
                  <Button onClick={generateCode} disabled={generating} className="w-full">
                    {generating ? 'Generando…' : '📲 Generar código de verificación'}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Código grande */}
                  <div className="text-center">
                    <p className="text-xs text-gray-500 mb-1">Código de verificación</p>
                    <div className="text-4xl font-mono font-bold tracking-[0.3em] text-violet-700 bg-violet-50 rounded-lg py-3">
                      {verifyData.code}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1">
                      Válido por 15 minutos
                    </p>
                  </div>

                  {/* QR Code */}
                  {qrDataUrl && (
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-xs text-gray-500">
                        El cliente escanea el QR → abre WhatsApp → envía el mensaje
                      </p>
                      <div className="relative inline-block">
                        <img src={qrDataUrl} alt="QR WhatsApp" className="w-48 h-48 rounded-lg" />
                        {/* Logo centrado */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="bg-white rounded-full p-1.5 w-12 h-12 flex items-center justify-center shadow">
                            <img src={logoUrl.current} alt="logo" className="w-8 h-8 object-contain" />
                          </div>
                        </div>
                      </div>
                      <a href={verifyData.wa_link!} target="_blank" rel="noopener noreferrer"
                         className="text-xs text-violet-600 underline">
                        Abrir link de WhatsApp
                      </a>
                    </div>
                  )}

                  {!qrDataUrl && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                      ⚠️ No hay número de WhatsApp del local configurado.
                      Decíle al cliente que envíe el código <strong>{verifyData.code}</strong> al WhatsApp del negocio.
                    </div>
                  )}

                  {/* Confirmación manual */}
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-xs text-gray-500 text-center">
                      Cuando veas el mensaje en WhatsApp, confirmá:
                    </p>
                    <Button
                      onClick={confirmVerify}
                      disabled={confirming}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      <ShieldCheck className="h-4 w-4 mr-2" />
                      {confirming ? 'Verificando…' : '✓ Recibí el mensaje — Verificar cliente'}
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full text-xs" onClick={generateCode} disabled={generating}>
                      Regenerar código
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name}</strong> ({deleteTarget?.phone}).
              Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
