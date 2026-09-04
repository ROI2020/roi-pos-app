"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams } from "next/navigation"
import {
  Building2, Users, Warehouse, Plus, Pencil, Trash2,
  Loader2, Save, Upload, X, CheckCircle2, Star,
  Globe, Copy, RefreshCw, Eye, EyeOff, Rss, BarChart2,
  Wallet, ChevronDown, ChevronRight, CreditCard, Sparkles, Receipt,
  FileText, ExternalLink, Mail, Send, Code, Clock, ShoppingBag, LinkIcon, Unlink,
} from "lucide-react"
import { toast } from "sonner"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Badge }    from "@/components/ui/badge"
import { Switch }   from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ── Types ──────────────────────────────────────────────────────────────────────
interface AppUser {
  id: number; name: string; email: string
  role: 'vendedor' | 'encargado' | 'administrador'
  active: boolean; created_at: string
}
interface Branch { id: number; name: string; address: string | null; arca_pos_number: number; cuit_emisor: string | null; is_default: boolean }
interface Fop { id: number; name: string; use_for_sales: boolean }
interface Account {
  id: number; name: string; type: string; currency: string
  branch_id: number | null; branch_name: string; fops: Fop[]
}

type Tab = 'negocio' | 'usuarios' | 'sucursales' | 'cuentas' | 'catalogo' | 'ia' | 'gastos' | 'pagos' | 'dropshipping' | 'paginas' | 'email' | 'ml'

interface ExpenseType {
  id: number
  name: string
  type: 'fijo' | 'variable'
  budget: number
}

const ACCOUNT_TYPES = [
  { value: 'efectivo',    label: 'Efectivo'           },
  { value: 'mercadopago', label: 'Billetera'       },
  { value: 'banco',       label: 'Cuenta bancaria'    },
  { value: 'otro',        label: 'Otro'               },
] as const

const ROLES = [
  { value: 'vendedor',       label: 'Vendedor'       },
  { value: 'encargado',      label: 'Encargado'      },
  { value: 'administrador',  label: 'Administrador'  },
] as const

const ROLE_COLORS: Record<string, string> = {
  vendedor:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  encargado:     'bg-amber-50 text-amber-700 border-amber-200',
  administrador: 'bg-violet-50 text-violet-700 border-violet-200',
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Negocio
// ══════════════════════════════════════════════════════════════════════════════
function NegocioTab() {
  const [name,           setName          ] = useState('')
  const [logo,           setLogo          ] = useState<string | null>(null)
  const [waNumber,       setWaNumber      ] = useState('')
  const [rcptPhone,      setRcptPhone     ] = useState('')
  const [rcptAddress,    setRcptAddress   ] = useState('')
  const [rcptFooter,     setRcptFooter    ] = useState('')
  const [rcptNoInvoice,  setRcptNoInvoice ] = useState('')
  const [waRuleta,       setWaRuleta      ] = useState('')
  const [saving,         setSaving        ] = useState(false)
  const [loading,        setLoading       ] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((d: Record<string, string | null>) => {
        setName(d.business_name ?? '')
        setLogo(d.business_logo ?? null)
        setWaNumber(d.whatsapp_report_number ?? '')
        setWaRuleta(d.whatsapp_phone ?? '')
        setRcptPhone(d.receipt_phone ?? '')
        setRcptAddress(d.receipt_address ?? '')
        setRcptFooter(d.receipt_footer ?? '')
        setRcptNoInvoice(d.receipt_no_invoice_text ?? '')
      })
      .catch(() => toast.error('Error al cargar configuración'))
      .finally(() => setLoading(false))
  }, [])

  const handleLogoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 500_000) {
      toast.error('El logo no puede superar 500 KB')
      return
    }
    const reader = new FileReader()
    reader.onload = ev => setLogo(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business_name:           name.trim(),
          business_logo:           logo,
          whatsapp_report_number:  waNumber.trim() || null,
          whatsapp_phone:          waRuleta.trim() || null,
          receipt_phone:           rcptPhone.trim() || null,
          receipt_address:         rcptAddress.trim() || null,
          receipt_footer:          rcptFooter.trim() || null,
          receipt_no_invoice_text: rcptNoInvoice.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Configuración guardada')
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-6 max-w-lg">
      {/* Nombre del negocio */}
      <div className="space-y-1.5">
        <Label>Nombre del negocio</Label>
        <Input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Ej: Ropa Kids SA"
          className="text-sm"
        />
      </div>

      {/* WhatsApp para reportes */}
      <div className="space-y-1.5">
        <Label>WhatsApp para reportes de caja</Label>
        <div className="flex items-center gap-2">
          {/* icono WA */}
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-500 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <Input
            value={waNumber}
            onChange={e => setWaNumber(e.target.value)}
            placeholder="5491155555555"
            className="text-sm font-mono"
          />
        </div>
        <p className="text-xs text-gray-400">
          Número internacional sin + ni espacios (ej: 5491155555555 para Argentina).
          Al cerrar caja aparecerá el botón "Enviar por WhatsApp" con el resumen precargado.
        </p>
      </div>

      {/* WhatsApp para Ruleta */}
      <div className="space-y-1.5">
        <Label>WhatsApp para Ruleta (verificación de clientes)</Label>
        <div className="flex items-center gap-2">
          <svg viewBox="0 0 24 24" className="h-5 w-5 text-green-500 fill-current shrink-0" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          <Input
            value={waRuleta}
            onChange={e => setWaRuleta(e.target.value)}
            placeholder="5491155555555"
            className="text-sm font-mono"
          />
        </div>
        <p className="text-xs text-gray-400">
          Número internacional sin + ni espacios. Los clientes enviarán su código de verificación
          a este número para participar en la Ruleta.
        </p>
      </div>

      {/* Logo */}
      <div className="space-y-2">
        <Label>Logo</Label>
        <div className="flex items-start gap-4">
          {/* Preview */}
          <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center bg-gray-50 overflow-hidden shrink-0">
            {logo
              ? <img src={logo} alt="logo" className="w-full h-full object-contain p-1" />
              : <Building2 className="h-8 w-8 text-gray-300" />
            }
          </div>
          <div className="space-y-2">
            <Button
              variant="outline" size="sm"
              className="gap-2"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-4 w-4" />
              Subir imagen
            </Button>
            {logo && (
              <Button
                variant="ghost" size="sm"
                className="gap-2 text-red-500 hover:text-red-700"
                onClick={() => { setLogo(null); if (fileRef.current) fileRef.current.value = '' }}
              >
                <X className="h-4 w-4" />
                Quitar logo
              </Button>
            )}
            <p className="text-xs text-gray-400">PNG, JPG o SVG · máx. 500 KB</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleLogoFile}
            />
          </div>
        </div>
      </div>

      {/* Datos del recibo */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recibo de venta</p>

        <div className="space-y-1.5">
          <Label>Teléfono</Label>
          <Input
            value={rcptPhone}
            onChange={e => setRcptPhone(e.target.value)}
            placeholder="Ej: +54 11 3454-2093"
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Dirección</Label>
          <Input
            value={rcptAddress}
            onChange={e => setRcptAddress(e.target.value)}
            placeholder="Ej: Av. Yrigoyen 2549, El Talar, Tigre - Local F4"
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label>Pie del recibo</Label>
          <Input
            value={rcptFooter}
            onChange={e => setRcptFooter(e.target.value)}
            placeholder="Ej: Presentar este comprobante en caso de cambios"
            className="text-sm"
          />
          <p className="text-xs text-gray-400">Aparece debajo de los datos del local.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Texto inferior</Label>
          <Input
            value={rcptNoInvoice}
            onChange={e => setRcptNoInvoice(e.target.value)}
            placeholder="No válido como factura"
            className="text-sm"
          />
          <p className="text-xs text-gray-400">Se muestra al pie del recibo. Dejalo vacío para usar el texto por defecto.</p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Diálogo: usuario (alta y edición)
// ══════════════════════════════════════════════════════════════════════════════
function UserDialog({
  user,
  onSaved,
  onClose,
}: {
  user: AppUser | null    // null = nuevo usuario
  onSaved: (u: AppUser) => void
  onClose: () => void
}) {
  const [name,   setName  ] = useState(user?.name  ?? '')
  const [email,  setEmail ] = useState(user?.email ?? '')
  const [role,   setRole  ] = useState<string>(user?.role ?? 'vendedor')
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim())  { toast.error('El nombre es obligatorio');  return }
    if (!email.trim()) { toast.error('El email es obligatorio');   return }
    setSaving(true)
    try {
      const res = user
        ? await fetch(`/api/users/${user.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role }),
          })
        : await fetch('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role }),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(user ? 'Usuario actualizado' : 'Usuario creado')
      onSaved(data)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{user ? 'Editar usuario' : 'Nuevo usuario'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Nombre completo</Label>
            <Input
              autoFocus value={name} onChange={e => setName(e.target.value)}
              placeholder="Juan García"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="juan@negocio.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Rol</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {user ? 'Guardar' : 'Crear usuario'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Usuarios
// ══════════════════════════════════════════════════════════════════════════════
function UsuariosTab() {
  const [users,   setUsers  ] = useState<AppUser[]>([])
  const [loading, setLoading] = useState(true)
  const [editUser, setEditUser] = useState<AppUser | null | 'new'>(null)

  const load = useCallback(async () => {
    try {
      const data: AppUser[] = await fetch('/api/users?all=true').then(r => r.json())
      setUsers(data)
    } catch { toast.error('Error al cargar usuarios') }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDeactivate = async (u: AppUser) => {
    if (!confirm(`¿Desactivar a ${u.name}?`)) return
    await fetch(`/api/users/${u.id}`, { method: 'DELETE' })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: false } : x))
    toast.success('Usuario desactivado')
  }

  const handleReactivate = async (u: AppUser) => {
    await fetch(`/api/users/${u.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: true }),
    })
    setUsers(prev => prev.map(x => x.id === u.id ? { ...x, active: true } : x))
    toast.success('Usuario reactivado')
  }

  const handleSaved = (saved: AppUser) => {
    setUsers(prev => {
      const exists = prev.find(u => u.id === saved.id)
      return exists
        ? prev.map(u => u.id === saved.id ? saved : u)
        : [...prev, saved]
    })
    setEditUser(null)
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setEditUser('new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Nuevo usuario
        </Button>
      </div>

      {users.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Users className="h-10 w-10 text-gray-300" />
          <p>No hay usuarios aún. Creá el primero.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[480px]">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <th className="text-left px-3 py-2.5">Nombre</th>
                <th className="text-left px-3 py-2.5 hidden sm:table-cell">Email</th>
                <th className="text-left px-3 py-2.5">Rol</th>
                <th className="text-left px-3 py-2.5">Estado</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.id} className={u.active ? '' : 'opacity-50'}>
                  <td className="px-3 py-3 font-medium text-gray-900 whitespace-nowrap">{u.name}</td>
                  <td className="px-3 py-3 text-gray-500 hidden sm:table-cell">{u.email}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${ROLE_COLORS[u.role]}`}>
                      {ROLES.find(r => r.value === u.role)?.label ?? u.role}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {u.active
                      ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Activo</span>
                      : <span className="text-xs text-gray-400">Inactivo</span>
                    }
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="icon"
                        className="h-7 w-7 text-gray-400 hover:text-gray-700"
                        title="Editar"
                        onClick={() => setEditUser(u)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {u.active
                        ? (
                          <Button
                            variant="ghost" size="icon"
                            className="h-7 w-7 text-gray-400 hover:text-red-600"
                            title="Desactivar"
                            onClick={() => handleDeactivate(u)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost" size="sm"
                            className="h-7 text-xs text-gray-400 hover:text-green-600"
                            onClick={() => handleReactivate(u)}
                          >
                            Reactivar
                          </Button>
                        )
                      }
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editUser !== null && (
        <UserDialog
          user={editUser === 'new' ? null : editUser}
          onSaved={handleSaved}
          onClose={() => setEditUser(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Diálogo: sucursal (alta y edición)
// ══════════════════════════════════════════════════════════════════════════════
function BranchDialog({
  branch,
  onSaved,
  onClose,
}: {
  branch?:  Branch            // undefined = nueva sucursal
  onSaved:  (b: Branch) => void
  onClose:  () => void
}) {
  const [name,       setName      ] = useState(branch?.name         ?? '')
  const [address,    setAddress   ] = useState(branch?.address      ?? '')
  const [arcaNum,    setArcaNum   ] = useState(String(branch?.arca_pos_number ?? ''))
  const [cuitEmisor, setCuitEmisor] = useState(branch?.cuit_emisor  ?? '')
  const [saving,     setSaving    ] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        address: address.trim() || null,
        arca_pos_number: parseInt(arcaNum) || 0,
        cuit_emisor: cuitEmisor.trim() || null,
      }
      const res = branch
        ? await fetch(`/api/branches/${branch.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/branches', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(branch ? 'Sucursal actualizada' : 'Sucursal creada')
      onSaved(data)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{branch ? 'Editar sucursal' : 'Nueva sucursal'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Casa Central" />
          </div>
          <div className="space-y-1.5">
            <Label>Dirección</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="Av. Corrientes 1234" />
          </div>
          <div className="space-y-1.5">
            <Label>Nº Punto de Venta ARCA</Label>
            <Input
              type="number" min={0} value={arcaNum}
              onChange={e => setArcaNum(e.target.value)}
              placeholder="1"
            />
            <p className="text-xs text-gray-400">
              Requerido para facturación electrónica. Puede ser 0 si no se factura aún.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>CUIT emisor</Label>
            <Input
              value={cuitEmisor}
              onChange={e => setCuitEmisor(e.target.value)}
              placeholder="20-12345678-9"
              className="font-mono text-sm"
            />
            <p className="text-xs text-gray-400">
              CUIT del titular de esta sucursal para facturación. Dejar vacío si usa el CUIT general.
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {branch ? 'Guardar' : 'Crear sucursal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Sucursales
// ══════════════════════════════════════════════════════════════════════════════
function SucursalesTab() {
  const [branches,  setBranches ] = useState<Branch[]>([])
  const [loading,   setLoading  ] = useState(true)
  const [showNew,   setShowNew  ] = useState(false)
  const [editBranch, setEditBranch] = useState<Branch | null>(null)

  useEffect(() => {
    fetch('/api/branches')
      .then(r => r.json())
      .then((data: Branch[]) => setBranches(data))
      .catch(() => toast.error('Error al cargar sucursales'))
      .finally(() => setLoading(false))
  }, [])

  const setDefault = async (b: Branch) => {
    try {
      const res = await fetch(`/api/branches/${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setBranches(prev => prev.map(x => ({ ...x, is_default: x.id === b.id })))
      toast.success(`${b.name} marcada como sucursal favorita`)
    } catch (err: unknown) { toast.error((err as Error).message) }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <p className="text-xs text-gray-500">
          La sucursal <span className="text-amber-500">★ favorita</span> se pre-selecciona en el POS al abrir.
        </p>
        <Button onClick={() => setShowNew(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Nueva sucursal
        </Button>
      </div>

      {branches.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Warehouse className="h-10 w-10 text-gray-300" />
          <p>No hay sucursales. Creá la primera.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm min-w-[380px]">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                <th className="w-8 px-2 py-2.5" />
                <th className="text-left px-3 py-2.5">Nombre</th>
                <th className="text-left px-3 py-2.5 hidden sm:table-cell">Dirección</th>
                <th className="text-left px-3 py-2.5">PV ARCA</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {branches.map(b => (
                <tr key={b.id} className={b.is_default ? 'bg-amber-50/50' : ''}>
                  {/* Favorita */}
                  <td className="px-3 py-3 text-center">
                    <button
                      title={b.is_default ? 'Sucursal favorita' : 'Marcar como favorita'}
                      onClick={() => !b.is_default && setDefault(b)}
                      className={`transition-colors ${b.is_default
                        ? 'text-amber-400 cursor-default'
                        : 'text-gray-200 hover:text-amber-300'}`}
                    >
                      <Star className={`h-4 w-4 ${b.is_default ? 'fill-amber-400' : ''}`} />
                    </button>
                  </td>
                  <td className="px-3 py-3 font-medium text-gray-900">
                    {b.name}
                    {b.is_default && (
                      <span className="ml-2 text-[10px] text-amber-600 bg-amber-100 rounded px-1.5 py-0.5">
                        favorita
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-gray-500 hidden sm:table-cell">
                    {b.address ?? <span className="italic text-gray-300">Sin dirección</span>}
                  </td>
                  <td className="px-3 py-3 text-gray-500">{b.arca_pos_number}</td>
                  <td className="px-3 py-3">
                    <Button
                      variant="ghost" size="icon"
                      className="h-7 w-7 text-gray-400 hover:text-violet-700"
                      title="Editar"
                      onClick={() => setEditBranch(b)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && (
        <BranchDialog
          onSaved={b => { setBranches(prev => [...prev, b]); setShowNew(false) }}
          onClose={() => setShowNew(false)}
        />
      )}
      {editBranch && (
        <BranchDialog
          branch={editBranch}
          onSaved={b => {
            setBranches(prev => prev.map(x => x.id === b.id ? { ...x, ...b } : x))
            setEditBranch(null)
          }}
          onClose={() => setEditBranch(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Catálogo digital
// ══════════════════════════════════════════════════════════════════════════════
function CatalogoTab() {
  const [baseUrl,     setBaseUrl    ] = useState('')
  const [token,       setToken      ] = useState('')
  const [showToken,   setShowToken  ] = useState(false)
  const [banner,      setBanner     ] = useState<string | null>(null)
  const [bannerText,  setBannerText ] = useState('')
  const [catalogPhone, setCatalogPhone] = useState('')
  const [envioInfo,   setEnvioInfo  ] = useState('')
  const [footerText,  setFooterText ] = useState('')
  const [catalogCuotas, setCatalogCuotas] = useState('')
  const [infoItems,   setInfoItems  ] = useState('')
  const [htmlBanner,  setHtmlBanner ] = useState('')
  const [ga4MeasurementId, setGa4MeasurementId] = useState('')
  const [ga4PropertyId,    setGa4PropertyId   ] = useState('')
  // ── Tema visual ──────────────────────────────────────────────
  const [themeColorPrimary,   setThemeColorPrimary  ] = useState('#7c3aed')
  const [themeColorSecondary, setThemeColorSecondary] = useState('#ec4899')
  const [themeColorBg,        setThemeColorBg       ] = useState('#f9fafb')
  const [themeColorSurface,   setThemeColorSurface  ] = useState('#ffffff')
  const [themeColorText,      setThemeColorText     ] = useState('#111827')
  const [themeColorMuted,     setThemeColorMuted    ] = useState('#6b7280')
  const [themeColorBorder,    setThemeColorBorder   ] = useState('#e5e7eb')
  const [themeFont,           setThemeFont          ] = useState('')
  const [saving,      setSaving     ] = useState(false)
  const [loading,     setLoading    ] = useState(true)
  const [copied,      setCopied     ] = useState<string | null>(null)
  const bannerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((d: Record<string, string | null>) => {
        setBaseUrl(d.catalog_base_url ?? '')
        setToken(d.catalog_token ?? '')
        setBanner(d.catalog_banner ?? null)
        setBannerText(d.catalog_banner_text ?? '')
        setCatalogPhone(d.catalog_phone ?? '')
        setEnvioInfo(d.catalog_envio_info ?? '')
        setFooterText(d.catalog_footer_text ?? '')
        setCatalogCuotas(d.catalog_cuotas ?? '')
        setInfoItems(d.catalog_info_items ?? '')
        setHtmlBanner(d.catalog_html_banner ?? '')
        setGa4MeasurementId(d.catalog_ga4_measurement_id ?? '')
        setGa4PropertyId(d.catalog_ga4_property_id ?? '')
        setThemeColorPrimary(d.catalog_color_primary     ?? '#7c3aed')
        setThemeColorSecondary(d.catalog_color_secondary ?? '#ec4899')
        setThemeColorBg(d.catalog_color_bg               ?? '#f9fafb')
        setThemeColorSurface(d.catalog_color_surface     ?? '#ffffff')
        setThemeColorText(d.catalog_color_text           ?? '#111827')
        setThemeColorMuted(d.catalog_color_muted         ?? '#6b7280')
        setThemeColorBorder(d.catalog_color_border       ?? '#e5e7eb')
        setThemeFont(d.catalog_font                      ?? '')
      })
      .catch(() => toast.error('Error al cargar configuración'))
      .finally(() => setLoading(false))
  }, [])

  const handleBannerFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) { toast.error('El banner no puede superar 2 MB'); return }
    const reader = new FileReader()
    reader.onload = ev => setBanner(ev.target?.result as string)
    reader.readAsDataURL(file)
  }

  const regenerateToken = () => {
    const arr   = new Uint8Array(24)
    crypto.getRandomValues(arr)
    const newTk = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
    setToken(newTk)
    toast.info('Token generado. Guardá los cambios para aplicarlo.')
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalog_base_url:   baseUrl.trim().replace(/\/$/, '') || null,
          catalog_token:      token.trim() || null,
          catalog_banner:              banner,
          catalog_banner_text:         bannerText.trim() || null,
          catalog_phone:               catalogPhone.trim() || null,
          catalog_envio_info:          envioInfo.trim() || null,
          catalog_footer_text:         footerText.trim() || null,
          catalog_cuotas:              catalogCuotas.trim() || null,
          catalog_info_items:          infoItems.trim() || null,
          catalog_html_banner:         htmlBanner.trim() || null,
          catalog_ga4_measurement_id:  ga4MeasurementId.trim() || null,
          catalog_ga4_property_id:     ga4PropertyId.trim() || null,
          catalog_color_primary:       themeColorPrimary   || null,
          catalog_color_secondary:     themeColorSecondary || null,
          catalog_color_bg:            themeColorBg        || null,
          catalog_color_surface:       themeColorSurface   || null,
          catalog_color_text:          themeColorText      || null,
          catalog_color_muted:         themeColorMuted     || null,
          catalog_color_border:        themeColorBorder    || null,
          catalog_font:                themeFont.trim()    || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Configuración guardada')
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const copyUrl = (url: string, key: string) => {
    navigator.clipboard.writeText(url)
    setCopied(key)
    setTimeout(() => setCopied(null), 2000)
  }

  const base  = (baseUrl || 'https://tu-dominio.com').replace(/\/$/, '')
  const tk    = token || 'TU_TOKEN'

  const FEEDS = [
    {
      key:         'meta',
      label:       'Meta (WhatsApp / Instagram / Facebook)',
      url:         `${base}/api/v1/feeds/meta-catalog.xml?token=${tk}`,
      description: 'Productos con flags WA, IG o FB activados.',
      color:       'border-blue-200 bg-blue-50 text-blue-700',
    },
    {
      key:         'google',
      label:       'Google Merchant Center',
      url:         `${base}/api/v1/feeds/google-catalog.xml?token=${tk}`,
      description: 'Productos con flag Web activado. g:link apunta a la página individual de cada producto.',
      color:       'border-green-200 bg-green-50 text-green-700',
    },
    {
      key:         'tiktok',
      label:       'TikTok Shop',
      url:         `${base}/api/v1/feeds/tiktok-catalog.xml?token=${tk}`,
      description: 'Productos con flag Web activado (mismo filtro que Google).',
      color:       'border-gray-200 bg-gray-50 text-gray-700',
    },
    {
      key:         'all',
      label:       'Feed completo (todos los exportables)',
      url:         `${base}/api/v1/feeds/all-catalog.xml?token=${tk}`,
      description: 'Cualquier producto con al menos un flag activo.',
      color:       'border-violet-200 bg-violet-50 text-violet-700',
    },
  ]

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl">

      {/* URL pública */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Globe className="h-4 w-4 text-gray-400" />
          URL pública del sistema
        </Label>
        <Input
          value={baseUrl}
          onChange={e => setBaseUrl(e.target.value)}
          placeholder="https://tu-dominio.com"
          className="text-sm font-mono"
        />
        <p className="text-xs text-gray-400">
          Dominio público donde está desplegado el sistema (sin barra al final).
          Se usa para armar las URLs de imágenes e imágenes del feed.
        </p>
      </div>

      {/* Token */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5">
          <Rss className="h-4 w-4 text-gray-400" />
          Token de acceso al feed
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="(sin token — el feed no estará protegido)"
              className="text-sm font-mono pr-10"
            />
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowToken(v => !v)}
              type="button"
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <Button variant="outline" size="sm" className="gap-1.5 shrink-0" onClick={regenerateToken}>
            <RefreshCw className="h-3.5 w-3.5" />
            {token ? 'Regenerar' : 'Generar'}
          </Button>
        </div>
        <p className="text-xs text-gray-400">
          Se envía como <code className="bg-gray-100 px-1 rounded">?token=XXX</code> en la URL del feed.
          Regenerar el token invalida todos los feeds configurados anteriormente en Meta/TikTok.
        </p>
      </div>

      {/* Banner de la tienda */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tienda online — Apariencia</p>

        <div className="space-y-1.5">
          <Label>Banner principal</Label>
          <p className="text-xs text-gray-400">
            Tamaño recomendado: <strong>1200×400px</strong> (relación 3:1, horizontal) · PNG, JPG · máx. 2 MB
          </p>

          {/* Preview del banner */}
          <div
            className="relative w-full rounded-xl border-2 border-dashed border-gray-200 overflow-hidden bg-gray-50 cursor-pointer hover:border-violet-300 transition-colors"
            style={{ aspectRatio: '3/1' }}
            onClick={() => bannerRef.current?.click()}
          >
            {banner ? (
              <>
                <img src={banner} alt="Banner" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/0 hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 hover:opacity-100">
                  <span className="bg-white/90 text-xs font-medium px-3 py-1 rounded-full">Cambiar imagen</span>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-gray-300">
                <Upload className="h-8 w-8" />
                <span className="text-xs">Clic para subir banner (1200×400px recomendado)</span>
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => bannerRef.current?.click()}>
              <Upload className="h-3.5 w-3.5" />
              {banner ? 'Cambiar' : 'Subir banner'}
            </Button>
            {banner && (
              <Button
                variant="ghost" size="sm"
                className="gap-1.5 text-red-500 hover:text-red-700"
                onClick={() => { setBanner(null); if (bannerRef.current) bannerRef.current.value = '' }}
              >
                <X className="h-3.5 w-3.5" />
                Quitar
              </Button>
            )}
          </div>
          <input ref={bannerRef} type="file" accept="image/*" className="hidden" onChange={handleBannerFile} />
        </div>

        {/* Texto del banner */}
        <div className="space-y-1.5">
          <Label>Texto informativo de la tienda</Label>
          <textarea
            value={bannerText}
            onChange={e => setBannerText(e.target.value)}
            rows={7}
            placeholder={'🏢 Galeria Comercial 197 (Talar)\n⏰ Mar-Dom | 10:00 - 20:00\n📍 Local 4 - Frente\n💳 Aceptamos todas las tarjetas\n🎁 3 Cuotas sin interés\n🏷️ ¡Promos imperdibles!\n✨ ¡Te esperamos!'}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none leading-relaxed"
          />
          <p className="text-xs text-gray-400">
            Cada línea se muestra como una entrada en la tienda. Podés usar emojis.
          </p>
        </div>

        {/* Teléfono de WhatsApp de la tienda */}
        <div className="space-y-1.5">
          <Label>Teléfono de WhatsApp de la tienda</Label>
          <Input
            value={catalogPhone}
            onChange={e => setCatalogPhone(e.target.value)}
            placeholder="5491131005865"
            className="text-sm font-mono"
          />
          <p className="text-xs text-gray-400">
            Número internacional sin + ni espacios (ej: <code className="bg-gray-100 px-1 rounded">5491131005865</code>).
            Se usa en los botones de consulta de productos de la tienda.
          </p>
        </div>

        {/* Info de envío y retiro */}
        <div className="space-y-1.5">
          <Label>Información de envío y retiro</Label>
          <textarea
            value={envioInfo}
            onChange={e => setEnvioInfo(e.target.value)}
            rows={4}
            placeholder={'📦 Envíos a todo el país por Correo Argentino y Andreani\n🏪 Retiro en tienda: Av. Ejemplo 1234, Lunes a Viernes 10-18hs\n⏱️ Entrega en 2-5 días hábiles'}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none leading-relaxed"
          />
          <p className="text-xs text-gray-400">
            Se muestra en el detalle de cada producto. Cada línea = una opción.
          </p>
        </div>

        {/* Barra informativa con íconos */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Rss className="h-4 w-4 text-gray-400" />
            Barra informativa (íconos + texto)
          </Label>
          <textarea
            value={infoItems}
            onChange={e => setInfoItems(e.target.value)}
            rows={6}
            placeholder={'truck|Free Shipping on Most Orders\nshield-check|Safe Checkout via PayPal\nshopping-bag|Buy Now, Pay Later\nmail|24/7 Email Support\ntag|Exclusive Online Deals'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y"
          />
          <p className="text-xs text-gray-400">
            Una línea por ítem: <code className="bg-gray-100 px-1 rounded">icono|Texto a mostrar</code>.
            Íconos disponibles: <code className="bg-gray-100 px-1 rounded">truck</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">shield-check</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">credit-card</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">shopping-bag</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">mail</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">tag</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">clock</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">package</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">refresh-cw</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">gift</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">zap</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">lock</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">globe</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">star</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">award</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">heart</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">check-circle</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">phone</code>.
            Si está vacío, se usa el campo "Texto del banner" como fallback.
          </p>
        </div>

        {/* Pie de página de la tienda */}
        <div className="space-y-1.5">
          <Label>Pie de página de la tienda</Label>
          <textarea
            value={footerText}
            onChange={e => setFooterText(e.target.value)}
            rows={4}
            placeholder={'¡No te pierdas las novedades!\n¿Querés trabajar con nosotros? ¡Mandanos tu CV!'}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300 resize-none leading-relaxed"
          />
          <p className="text-xs text-gray-400">
            Texto libre que aparece al final de la tienda. Cada línea = un párrafo.
          </p>
        </div>

        {/* Banner HTML personalizado */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <Code className="h-4 w-4 text-gray-400" />
            Banner HTML personalizado
          </Label>
          <textarea
            value={htmlBanner}
            onChange={e => setHtmlBanner(e.target.value)}
            rows={8}
            spellCheck={false}
            placeholder={'<!-- Ejemplo: banner promocional -->\n<div style="background:#7c3aed;color:#fff;text-align:center;padding:12px 16px;font-size:14px">\n  🔥 <strong>OFERTA:</strong> 20% OFF en toda la tienda · Código: <code>PROMO20</code>\n</div>'}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y min-h-[120px]"
          />
          <p className="text-xs text-gray-400">
            HTML libre que se inyecta en la parte superior de la tienda (debajo del header).
            Podés usar estilos inline, emojis y texto. Dejá vacío para no mostrar nada.
          </p>
        </div>

        {/* Cuotas sin interés */}
        <div className="space-y-1.5">
          <Label>Cuotas sin interés</Label>
          <Input
            type="number"
            min="0"
            max="24"
            value={catalogCuotas}
            onChange={e => setCatalogCuotas(e.target.value)}
            placeholder="0 (desactivado)"
            className="text-sm w-40"
          />
          <p className="text-xs text-gray-400">
            Número de cuotas sin interés que ofrecés. Ej: <code className="bg-gray-100 px-1 rounded">3</code> muestra
            "3 cuotas sin interés" en todos los productos. Dejar en 0 u vacío para no mostrar.
          </p>
        </div>
      </div>

      {/* ── Tema visual ─────────────────────────────────────────── */}
      <div className="space-y-4 pt-2 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Tema visual de la tienda</p>
        </div>
        <p className="text-xs text-gray-400 -mt-2">
          Los cambios se aplican en tiempo real al guardar — sin necesidad de redesplegar el sitio.
        </p>

        {/* Color pairs grid */}
        {(
          [
            { label: 'Color primario',    desc: 'Botones, precios, activos',         val: themeColorPrimary,   set: setThemeColorPrimary   },
            { label: 'Color secundario',  desc: 'Badges de promo, grupos de edad',   val: themeColorSecondary, set: setThemeColorSecondary },
            { label: 'Fondo de página',   desc: 'Área gris detrás de las tarjetas',  val: themeColorBg,        set: setThemeColorBg        },
            { label: 'Fondo de tarjetas', desc: 'Header, footer, cards, drawer',     val: themeColorSurface,   set: setThemeColorSurface   },
            { label: 'Texto principal',   desc: 'Títulos y body text',               val: themeColorText,      set: setThemeColorText      },
            { label: 'Texto secundario',  desc: 'Subtítulos, etiquetas, placeholders', val: themeColorMuted,  set: setThemeColorMuted     },
            { label: 'Bordes',            desc: 'Separadores y marcos',              val: themeColorBorder,    set: setThemeColorBorder    },
          ] as { label: string; desc: string; val: string; set: (v: string) => void }[]
        ).map(({ label, desc, val, set }) => (
          <div key={label} className="flex items-center gap-3">
            <div className="relative shrink-0">
              <input
                type="color"
                value={val}
                onChange={e => set(e.target.value)}
                className="w-9 h-9 rounded-lg cursor-pointer border border-gray-200 p-0.5"
                title={label}
              />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-700">{label}</p>
              <p className="text-xs text-gray-400">{desc}</p>
            </div>
            <input
              type="text"
              value={val}
              onChange={e => set(e.target.value)}
              pattern="^#[0-9a-fA-F]{6}$"
              maxLength={7}
              className="w-24 text-xs font-mono border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-violet-300 shrink-0"
            />
          </div>
        ))}

        {/* Tipografía */}
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Tipografía (Google Fonts)
          </Label>
          <Input
            value={themeFont}
            onChange={e => setThemeFont(e.target.value)}
            placeholder="Inter"
            className="text-sm"
          />
          <p className="text-xs text-gray-400">
            Nombre exacto de la fuente en Google Fonts. Ej: <code className="bg-gray-100 px-1 rounded">Inter</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">Montserrat</code>,{' '}
            <code className="bg-gray-100 px-1 rounded">Roboto</code>.
            Dejarlo vacío usa la fuente del sistema.
          </p>
        </div>
      </div>

      {/* Google Analytics */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Google Analytics</p>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <BarChart2 className="h-4 w-4 text-gray-400" />
            ID de medición
          </Label>
          <Input
            value={ga4MeasurementId}
            onChange={e => setGa4MeasurementId(e.target.value)}
            placeholder="G-XXXXXXXXXX"
            className="text-sm font-mono"
          />
          <p className="text-xs text-gray-400">
            Formato <code className="bg-gray-100 px-1 rounded">G-XXXXXXXXXX</code>.
            Si tiene valor, se inserta el tag de Google en todas las páginas de la tienda.
            Si está vacío, no se agrega nada.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            <BarChart2 className="h-4 w-4 text-gray-400" />
            ID de propiedad
          </Label>
          <Input
            value={ga4PropertyId}
            onChange={e => setGa4PropertyId(e.target.value)}
            placeholder="123456789"
            className="text-sm font-mono"
          />
          <p className="text-xs text-gray-400">
            Número de propiedad GA4 (Admin → Detalles de la propiedad en Google Analytics).
            No afecta la tienda — se usa para consultar métricas desde otros sistemas.
          </p>
        </div>
      </div>

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar cambios
      </Button>

      {/* URLs de feeds */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">URLs de feeds para registrar en cada plataforma</p>
        <p className="text-xs text-gray-400">
          <strong>Meta:</strong> Business Suite → Catálogos → Orígenes de datos → "URL del feed de datos".<br />
          <strong>Google:</strong> Merchant Center → Productos → Feeds → "Scheduled fetch".<br />
          <strong>TikTok:</strong> Seller Center → Productos → Catálogo → "Importar por URL".<br />
          Frecuencia recomendada: <strong>1 hora</strong>.
        </p>

        <div className="space-y-2">
          {FEEDS.map(f => (
            <div key={f.key} className={`border rounded-lg px-4 py-3 ${f.color}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{f.label}</p>
                  <p className="text-[10px] opacity-70 mt-0.5">{f.description}</p>
                  <p className="text-[10px] font-mono mt-1.5 break-all opacity-80">{f.url}</p>
                </div>
                <button
                  className="shrink-0 mt-0.5 hover:opacity-70 transition-opacity"
                  onClick={() => copyUrl(f.url, f.key)}
                  title="Copiar URL"
                >
                  {copied === f.key
                    ? <CheckCircle2 className="h-4 w-4 text-green-500" />
                    : <Copy className="h-4 w-4" />
                  }
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-xs text-amber-700">
          <strong>Imágenes:</strong> Meta y TikTok requieren URLs HTTP públicas — no aceptan Base64.
          El sistema sirve las fotos en <code className="bg-amber-100 px-1 rounded">/api/images/products/&#123;id&#125;</code>.
          Solo funcionan correctamente cuando el sistema está publicado en la URL pública configurada arriba.
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Diálogo: cuenta (alta y edición)
// ══════════════════════════════════════════════════════════════════════════════
function AccountDialog({
  account,
  branches,
  onSaved,
  onClose,
}: {
  account?: Account            // undefined = nueva cuenta
  branches: Branch[]
  onSaved:  (a: Account) => void
  onClose:  () => void
}) {
  const [name,     setName    ] = useState(account?.name ?? '')
  const [type,     setType    ] = useState(account?.type ?? 'efectivo')
  const [currency, setCurrency] = useState(account?.currency ?? 'ARS')
  const [branchId, setBranchId] = useState<string>(
    account ? (account.branch_id === null ? 'central' : String(account.branch_id)) : 'central'
  )
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const payload = {
        name: name.trim(),
        type,
        currency: currency.trim() || 'ARS',
        branch_id: branchId === 'central' ? null : parseInt(branchId),
      }
      const res = account
        ? await fetch(`/api/accounts/${account.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
        : await fetch('/api/accounts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      const branchName = branchId === 'central'
        ? 'Caja Central'
        : branches.find(b => b.id === parseInt(branchId))?.name ?? ''
      toast.success(account ? 'Cuenta actualizada' : 'Cuenta creada')
      onSaved({ ...data, branch_name: branchName, fops: account?.fops ?? [] })
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{account ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Mercado Pago MC" />
          </div>
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Sucursal</Label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="central">Caja Central</SelectItem>
                {branches.map(b => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              "Caja Central" es una cuenta a nivel negocio, no atada a una sucursal puntual.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Input value={currency} onChange={e => setCurrency(e.target.value.toUpperCase())} placeholder="ARS" className="font-mono" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {account ? 'Guardar' : 'Crear cuenta'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Diálogo: forma de pago (alta y edición)
// ══════════════════════════════════════════════════════════════════════════════
function FopDialog({
  accountId,
  fop,
  onSaved,
  onClose,
}: {
  accountId: number
  fop?:      Fop              // undefined = nueva forma de pago
  onSaved:   (f: Fop) => void
  onClose:   () => void
}) {
  const [name,        setName       ] = useState(fop?.name ?? '')
  const [useForSales, setUseForSales] = useState(fop?.use_for_sales ?? true)
  const [saving,      setSaving     ] = useState(false)

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('El nombre es obligatorio'); return }
    setSaving(true)
    try {
      const res = fop
        ? await fetch(`/api/fops/${fop.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ use_for_sales: useForSales }),
          })
        : await fetch('/api/fops', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ account_id: accountId, name: name.trim(), use_for_sales: useForSales }),
          })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(fop ? 'Forma de pago actualizada' : 'Forma de pago creada')
      onSaved(data)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{fop ? 'Editar forma de pago' : 'Nueva forma de pago'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-red-500">*</span></Label>
            <Input
              autoFocus={!fop} value={name} onChange={e => setName(e.target.value)}
              placeholder="Débito" disabled={!!fop}
            />
            {fop && (
              <p className="text-xs text-gray-400">
                El nombre no se puede editar una vez creada (lo usan internamente las ventas y los reportes).
              </p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <Label className="cursor-pointer" onClick={() => setUseForSales(v => !v)}>
                Usar en ventas
              </Label>
              <p className="text-xs text-gray-400">Aparece como opción de pago en el POS.</p>
            </div>
            <Switch checked={useForSales} onCheckedChange={setUseForSales} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {fop ? 'Guardar' : 'Crear'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Cuentas y Formas de Pago
// ══════════════════════════════════════════════════════════════════════════════
function CuentasTab() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [branches, setBranches] = useState<Branch[]>([])
  const [loading,  setLoading ] = useState(true)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [showNewAccount, setShowNewAccount] = useState(false)
  const [editAccount,    setEditAccount   ] = useState<Account | null>(null)
  const [newFopFor,      setNewFopFor     ] = useState<number | null>(null)
  const [editFop,        setEditFop       ] = useState<{ accountId: number; fop: Fop } | null>(null)

  const load = useCallback(async () => {
    try {
      const [accs, brs] = await Promise.all([
        fetch('/api/accounts').then(r => r.json()),
        fetch('/api/branches').then(r => r.json()),
      ])
      setAccounts(accs)
      setBranches(brs)
    } catch { toast.error('Error al cargar cuentas') }
    finally  { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleDeleteAccount = async (a: Account) => {
    if (!confirm(`¿Eliminar la cuenta "${a.name}"?`)) return
    const res = await fetch(`/api/accounts/${a.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error); return }
    setAccounts(prev => prev.filter(x => x.id !== a.id))
    toast.success('Cuenta eliminada')
  }

  const handleDeleteFop = async (accountId: number, fop: Fop) => {
    if (!confirm(`¿Eliminar la forma de pago "${fop.name}"?`)) return
    const res = await fetch(`/api/fops/${fop.id}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error); return }
    setAccounts(prev => prev.map(a => a.id === accountId
      ? { ...a, fops: a.fops.filter(f => f.id !== fop.id) }
      : a
    ))
    toast.success('Forma de pago eliminada')
  }

  const toggleUseForSales = async (accountId: number, fop: Fop) => {
    const next = !fop.use_for_sales
    setAccounts(prev => prev.map(a => a.id === accountId
      ? { ...a, fops: a.fops.map(f => f.id === fop.id ? { ...f, use_for_sales: next } : f) }
      : a
    ))
    const res = await fetch(`/api/fops/${fop.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ use_for_sales: next }),
    })
    if (!res.ok) {
      setAccounts(prev => prev.map(a => a.id === accountId
        ? { ...a, fops: a.fops.map(f => f.id === fop.id ? { ...f, use_for_sales: !next } : f) }
        : a
      ))
      toast.error('No se pudo actualizar')
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
        <p className="text-xs text-gray-500">
          Cada cuenta agrupa las formas de pago que se concilian ahí. "Usar en ventas" controla
          si esa forma de pago aparece como opción al cobrar en el POS.
        </p>
        <Button onClick={() => setShowNewAccount(true)} className="gap-2 shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Nueva cuenta
        </Button>
      </div>

      {accounts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400 gap-2">
          <Wallet className="h-10 w-10 text-gray-300" />
          <p>No hay cuentas aún. Creá la primera.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden divide-y divide-gray-100">
          {accounts.map(a => {
            const isOpen = expanded.has(a.id)
            return (
              <div key={a.id}>
                {/* Fila de cuenta */}
                <div className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50">
                  <button onClick={() => toggleExpand(a.id)} className="text-gray-400 hover:text-gray-700 shrink-0">
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </button>
                  <Wallet className="h-4 w-4 text-violet-400 shrink-0" />
                  <div className="min-w-0 flex-1 cursor-pointer" onClick={() => toggleExpand(a.id)}>
                    <p className="text-sm font-medium text-gray-900 truncate">{a.name}</p>
                    <p className="text-xs text-gray-400">
                      {a.branch_name} · {ACCOUNT_TYPES.find(t => t.value === a.type)?.label ?? a.type} · {a.currency}
                      {' · '}{a.fops.length} forma{a.fops.length !== 1 ? 's' : ''} de pago
                    </p>
                  </div>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-violet-700"
                    title="Editar cuenta" onClick={() => setEditAccount(a)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost" size="icon" className="h-7 w-7 text-gray-400 hover:text-red-600"
                    title="Eliminar cuenta" onClick={() => handleDeleteAccount(a)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Formas de pago de la cuenta */}
                {isOpen && (
                  <div className="bg-gray-50/60 px-3 pb-3 pl-4 sm:pl-10">
                    {a.fops.length === 0 ? (
                      <p className="text-xs text-gray-400 py-2">Sin formas de pago todavía.</p>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {a.fops.map(f => (
                          <div key={f.id} className="flex items-center gap-2 py-2">
                            <CreditCard className="h-3.5 w-3.5 text-gray-300 shrink-0" />
                            <span className="text-sm text-gray-700 flex-1 min-w-0 truncate">{f.name}</span>
                            <span className={`hidden sm:inline-flex text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${
                              f.use_for_sales
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-gray-100 text-gray-400 border-gray-200'
                            }`}>
                              {f.use_for_sales ? 'en ventas' : 'oculta'}
                            </span>
                            <Switch
                              checked={f.use_for_sales}
                              onCheckedChange={() => toggleUseForSales(a.id, f)}
                            />
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-violet-700"
                              title="Editar" onClick={() => setEditFop({ accountId: a.id, fop: f })}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost" size="icon" className="h-6 w-6 text-gray-400 hover:text-red-600"
                              title="Eliminar" onClick={() => handleDeleteFop(a.id, f)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="outline" size="sm" className="gap-1.5 mt-2 h-7 text-xs"
                      onClick={() => setNewFopFor(a.id)}
                    >
                      <Plus className="h-3 w-3" />
                      Nueva forma de pago
                    </Button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showNewAccount && (
        <AccountDialog
          branches={branches}
          onSaved={a => { setAccounts(prev => [...prev, a]); setShowNewAccount(false) }}
          onClose={() => setShowNewAccount(false)}
        />
      )}
      {editAccount && (
        <AccountDialog
          account={editAccount}
          branches={branches}
          onSaved={a => {
            setAccounts(prev => prev.map(x => x.id === a.id ? { ...x, ...a } : x))
            setEditAccount(null)
          }}
          onClose={() => setEditAccount(null)}
        />
      )}
      {newFopFor !== null && (
        <FopDialog
          accountId={newFopFor}
          onSaved={f => {
            setAccounts(prev => prev.map(a => a.id === newFopFor ? { ...a, fops: [...a.fops, f] } : a))
            setNewFopFor(null)
          }}
          onClose={() => setNewFopFor(null)}
        />
      )}
      {editFop && (
        <FopDialog
          accountId={editFop.accountId}
          fop={editFop.fop}
          onSaved={f => {
            setAccounts(prev => prev.map(a => a.id === editFop.accountId
              ? { ...a, fops: a.fops.map(x => x.id === f.id ? f : x) }
              : a
            ))
            setEditFop(null)
          }}
          onClose={() => setEditFop(null)}
        />
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Descripción con IA
// ══════════════════════════════════════════════════════════════════════════════
const AI_MODELOS = [
  { value: 'claude-haiku-4-5-20251001', label: 'Haiku — rápido y económico'  },
  { value: 'claude-sonnet-4-6',         label: 'Sonnet — más creativo'        },
]
const AI_ESTILOS = [
  { value: 'comercial',   label: 'Comercial — tono coloquial argentino (vos)' },
  { value: 'descriptivo', label: 'Descriptivo — objetivo y detallado'          },
  { value: 'emocional',   label: 'Emocional — conecta con el comprador'        },
  { value: 'minimalista', label: 'Minimalista — 1 o 2 oraciones'               },
]

function IATab() {
  const [modelo, setModelo] = useState('claude-haiku-4-5-20251001')
  const [estilo, setEstilo] = useState('comercial')

  useEffect(() => {
    setModelo(localStorage.getItem('ai_modelo') ?? 'claude-haiku-4-5-20251001')
    setEstilo(localStorage.getItem('ai_estilo') ?? 'comercial')
  }, [])

  const handleSave = () => {
    localStorage.setItem('ai_modelo', modelo)
    localStorage.setItem('ai_estilo', estilo)
    toast.success('Configuración de IA guardada')
  }

  return (
    <div className="space-y-6 max-w-md">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Descripción con IA</h2>
        <p className="text-sm text-gray-500 mt-1">
          Configurá el modelo y el estilo por defecto al generar descripciones de productos desde la ficha del producto.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Modelo</Label>
          <Select value={modelo} onValueChange={setModelo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_MODELOS.map(m => (
                <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Estilo</Label>
          <Select value={estilo} onValueChange={setEstilo}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AI_ESTILOS.map(e => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          Guardar
        </Button>
      </div>

      <div className="bg-violet-50 border border-violet-200 rounded-lg px-4 py-3 text-xs text-violet-700 space-y-1">
        <p><strong>Haiku</strong> es más rápido y económico. Ideal para uso frecuente.</p>
        <p><strong>Sonnet</strong> genera textos más creativos y elaborados.</p>
        <p className="text-violet-500 pt-1">Requiere configurar <code className="bg-violet-100 px-1 rounded">ANTHROPIC_API_KEY</code> en el servidor.</p>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// GastosTab — ABM de tipos de gasto
// ══════════════════════════════════════════════════════════════════════════════
const TYPE_OPTIONS: { value: 'fijo' | 'variable'; label: string; desc: string }[] = [
  { value: 'fijo',     label: 'Fijo',     desc: 'Importe mensual constante (alquiler, sueldos…)' },
  { value: 'variable', label: 'Variable', desc: 'Varía con las ventas (comisiones, packaging…)' },
]

function GastosTab() {
  const [items,   setItems  ] = useState<ExpenseType[]>([])
  const [loading, setLoading] = useState(true)
  const [editId,  setEditId ] = useState<number | null>(null)
  const [showNew, setShowNew] = useState(false)

  const [form, setForm] = useState<{ name: string; type: 'fijo' | 'variable'; budget: string }>({
    name: '', type: 'fijo', budget: '',
  })
  const [saving,   setSaving  ] = useState(false)
  const [deleting, setDeleting] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetch('/api/expense-types').then(r => r.json())
      setItems(Array.isArray(data) ? data : [])
    } catch { toast.error('Error al cargar tipos de gasto') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const openNew = () => {
    setEditId(null)
    setForm({ name: '', type: 'fijo', budget: '' })
    setShowNew(true)
  }

  const openEdit = (et: ExpenseType) => {
    setShowNew(false)
    setEditId(et.id)
    setForm({ name: et.name, type: et.type, budget: et.budget > 0 ? String(et.budget) : '' })
  }

  const cancelEdit = () => { setEditId(null); setShowNew(false) }

  const handleSave = async () => {
    if (!form.name.trim()) { toast.error('El nombre es requerido'); return }
    setSaving(true)
    try {
      const payload = { name: form.name.trim(), type: form.type, budget: parseFloat(form.budget) || 0 }
      let res: Response
      if (editId) {
        res = await fetch(`/api/expense-types/${editId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      } else {
        res = await fetch('/api/expense-types', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(editId ? 'Tipo actualizado' : 'Tipo creado')
      cancelEdit()
      load()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    setDeleting(id)
    try {
      const res = await fetch(`/api/expense-types/${id}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 204) {
        const data = await res.json()
        throw new Error(data.error)
      }
      toast.success('Tipo eliminado')
      load()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally { setDeleting(null) }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)

  const totalFijo = items.filter(i => i.type === 'fijo').reduce((s, i) => s + i.budget, 0)

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:justify-between">
        <p className="text-sm text-gray-500">
          Definí tipos de gasto con su categoría y presupuesto mensual estimado.
          Estos datos se usan para calcular el <strong>Punto de Equilibrio</strong>.
        </p>
        <Button size="sm" onClick={openNew} className="gap-1.5 shrink-0 self-start sm:self-auto">
          <Plus className="h-4 w-4" />Nuevo tipo
        </Button>
      </div>

      {/* Formulario nuevo / editar inline */}
      {(showNew || editId !== null) && (
        <div className="border rounded-xl p-4 bg-violet-50/40 space-y-3">
          <p className="text-sm font-semibold text-violet-700">
            {editId ? 'Editar tipo de gasto' : 'Nuevo tipo de gasto'}
          </p>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Nombre</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Alquiler"
                className="text-sm"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleSave()}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Tipo</Label>
                <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as 'fijo' | 'variable' }))}>
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TYPE_OPTIONS.map(o => (
                      <SelectItem key={o.value} value={o.value}>
                        <span className="font-medium">{o.label}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{o.desc}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Presupuesto mensual ($)</Label>
                <Input
                  type="number" min={0} step="1"
                  value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                  placeholder="0"
                  className="text-sm"
                />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editId ? 'Guardar' : 'Crear'}
            </Button>
            <Button size="sm" variant="ghost" onClick={cancelEdit}>Cancelar</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">
          No hay tipos de gasto. Creá uno para habilitar el Punto de Equilibrio.
        </p>
      ) : (
        <div className="rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[380px]">
            <thead>
              <tr className="bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 text-left">Nombre</th>
                <th className="px-3 py-2.5 text-left hidden sm:table-cell">Tipo</th>
                <th className="px-3 py-2.5 text-right">Presupuesto / mes</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map(et => (
                <tr key={et.id} className={`hover:bg-gray-50 ${editId === et.id ? 'bg-violet-50/30' : ''}`}>
                  <td className="px-3 py-2.5 font-medium text-gray-800">
                    <span className="block">{et.name}</span>
                    <span className={`sm:hidden text-[10px] font-medium px-1.5 py-0.5 rounded-full ${
                      et.type === 'fijo' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                    }`}>{et.type === 'fijo' ? 'Fijo' : 'Variable'}</span>
                  </td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                      et.type === 'fijo'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {et.type === 'fijo' ? 'Fijo' : 'Variable'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 whitespace-nowrap">
                    {et.budget > 0 ? fmt(et.budget) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(et)}>
                        <Pencil className="h-3.5 w-3.5 text-gray-400" />
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        onClick={() => handleDelete(et.id)}
                        disabled={deleting === et.id}
                      >
                        {deleting === et.id
                          ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
                          : <Trash2 className="h-3.5 w-3.5 text-red-400" />
                        }
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50 text-sm font-semibold">
                <td colSpan={2} className="px-3 py-2.5 text-gray-600">
                  Total costos fijos mensuales
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-violet-700 whitespace-nowrap">
                  {fmt(totalFijo)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Pasarela de pago
// ══════════════════════════════════════════════════════════════════════════════
interface PaymentConfig {
  payment_gateway:          string
  currency:                 string
  locale:                   string
  mp_public_key:            string | null
  mp_fop_id:                number | null
  paypal_client_id:         string | null
  paypal_mode:              string
  paypal_fop_id:            number | null
  mp_access_token_set:      boolean
  paypal_client_secret_set: boolean
}

interface FopOption { id: number; name: string; use_for_sales: boolean }

function PagosTab() {
  const [cfg,     setCfg    ] = useState<PaymentConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving ] = useState(false)

  // Formulario
  const [gateway,             setGateway            ] = useState('mercadopago')
  const [currency,            setCurrency           ] = useState('ARS')
  const [locale,              setLocale             ] = useState('es-AR')
  const [mpPublicKey,         setMpPublicKey        ] = useState('')
  const [mpAccessToken,       setMpAccessToken      ] = useState('')     // vacío = no cambiar
  const [paypalClientId,      setPaypalClientId     ] = useState('')
  const [paypalClientSecret,  setPaypalClientSecret ] = useState('')     // vacío = no cambiar
  const [paypalMode,          setPaypalMode         ] = useState('sandbox')
  const [mpFopId,             setMpFopId            ] = useState<number | null>(null)
  const [paypalFopId,         setPaypalFopId        ] = useState<number | null>(null)
  const [fopsList,            setFopsList           ] = useState<FopOption[]>([])

  // Visibilidad de campos secretos
  const [showMpToken,  setShowMpToken ] = useState(false)
  const [showPpSecret, setShowPpSecret] = useState(false)

  useEffect(() => {
    Promise.all([
      fetch('/api/settings/payment').then(r => r.json()),
      fetch('/api/fops').then(r => r.json()),
    ])
      .then(([d, fops]: [PaymentConfig, FopOption[]]) => {
        setCfg(d)
        setGateway(d.payment_gateway)
        setCurrency(d.currency)
        setLocale(d.locale)
        setMpPublicKey(d.mp_public_key ?? '')
        setMpFopId(d.mp_fop_id ?? null)
        setPaypalClientId(d.paypal_client_id ?? '')
        setPaypalMode(d.paypal_mode ?? 'sandbox')
        setPaypalFopId(d.paypal_fop_id ?? null)
        setFopsList(Array.isArray(fops) ? fops : [])
      })
      .catch(() => toast.error('Error al cargar configuración de pagos'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/payment', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_gateway:      gateway,
          currency:             currency.trim().toUpperCase(),
          locale:               locale.trim(),
          mp_public_key:        mpPublicKey.trim()        || null,
          mp_access_token:      mpAccessToken.trim()      || null,    // null = mantener
          mp_fop_id:            mpFopId,
          paypal_client_id:     paypalClientId.trim()     || null,
          paypal_client_secret: paypalClientSecret.trim() || null,   // null = mantener
          paypal_mode:          paypalMode,
          paypal_fop_id:        paypalFopId,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Actualizar estado del "secreto configurado"
      setCfg(prev => prev ? {
        ...prev,
        payment_gateway:          gateway,
        currency,
        locale,
        mp_public_key:            mpPublicKey.trim() || null,
        paypal_client_id:         paypalClientId.trim() || null,
        paypal_mode:              paypalMode,
        mp_access_token_set:      prev.mp_access_token_set      || !!mpAccessToken.trim(),
        paypal_client_secret_set: prev.paypal_client_secret_set || !!paypalClientSecret.trim(),
      } : prev)
      setMpAccessToken('')      // limpiar campos secretos tras guardar
      setPaypalClientSecret('')
      toast.success('Configuración de pago guardada')
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-7 max-w-lg">

      {/* ── Gateway ── */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Pasarela de pago</p>

        {[
          { value: 'mercadopago', label: 'MercadoPago', desc: 'Para negocios en Argentina (ARS)', flag: '🇦🇷' },
          { value: 'paypal',      label: 'PayPal',       desc: 'Para negocios en USA (USD)',        flag: '🇺🇸' },
        ].map(g => (
          <button key={g.value} onClick={() => setGateway(g.value)}
            className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all
              ${gateway === g.value ? 'border-violet-500 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
            <span className="text-2xl">{g.flag}</span>
            <div>
              <p className={`text-sm font-semibold ${gateway === g.value ? 'text-violet-700' : 'text-gray-800'}`}>
                {g.label}
              </p>
              <p className="text-xs text-gray-500">{g.desc}</p>
            </div>
            {gateway === g.value && (
              <CheckCircle2 className="h-5 w-5 text-violet-500 ml-auto shrink-0" />
            )}
          </button>
        ))}
      </div>

      {/* ── Moneda y locale ── */}
      <div className="space-y-3 pt-2 border-t border-gray-100">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Moneda e idioma de la tienda</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="text-sm font-mono">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ARS">ARS — Peso argentino</SelectItem>
                <SelectItem value="USD">USD — Dólar estadounidense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Idioma / Locale</Label>
            <Select value={locale} onValueChange={setLocale}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="es-AR">🇦🇷 es-AR</SelectItem>
                <SelectItem value="en-US">🇺🇸 en-US</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <p className="text-xs text-gray-400">
          El locale determina el idioma de la tienda y las opciones de entrega disponibles.
          <strong> Cambiar requiere redesplegar</strong> para que el middleware tome el nuevo valor.
        </p>
      </div>

      {/* ── MercadoPago credentials ── */}
      {gateway === 'mercadopago' && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Credenciales MercadoPago</p>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Public Key
              <span className="text-[10px] font-normal text-gray-400">(pública)</span>
            </Label>
            <Input
              value={mpPublicKey}
              onChange={e => setMpPublicKey(e.target.value)}
              placeholder="APP_USR-xxxxxxxx-..."
              autoComplete="off"
              className="text-sm font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Access Token
              <span className="text-[10px] font-normal text-gray-400">(secreto)</span>
              {cfg?.mp_access_token_set && (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                  ● Configurado
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showMpToken ? 'text' : 'password'}
                value={mpAccessToken}
                onChange={e => setMpAccessToken(e.target.value)}
                placeholder={cfg?.mp_access_token_set ? '●●●●●●●● (dejar vacío = mantener)' : 'APP_USR-xxxxxxxx-...'}
                autoComplete="new-password"
                className="text-sm font-mono pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowMpToken(v => !v)}
              >
                {showMpToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Dejá vacío para mantener el token existente. Solo completá si querés reemplazarlo.
            </p>
          </div>

          {/* FOP para registrar cobros MP online en transactions */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Forma de pago en el libro
              <span className="text-[10px] font-normal text-gray-400">(para reportes)</span>
            </Label>
            <Select
              value={mpFopId != null ? String(mpFopId) : '__none__'}
              onValueChange={v => setMpFopId(v === '__none__' ? null : parseInt(v))}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Sin asignar —</SelectItem>
                {fopsList.map(f => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              Forma de pago que representa MercadoPago en tu libro de movimientos.
              Los pedidos online confirmados se registrarán automáticamente en Transacciones.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
            Credenciales disponibles en{' '}
            <a href="https://www.mercadopago.com.ar/developers/panel/app" target="_blank" rel="noopener noreferrer"
              className="underline font-medium">
              MercadoPago Developers → Tu aplicación → Credenciales de producción
            </a>.
          </div>
        </div>
      )}

      {/* ── PayPal credentials ── */}
      {gateway === 'paypal' && (
        <div className="space-y-4 pt-2 border-t border-gray-100">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Credenciales PayPal</p>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Client ID
              <span className="text-[10px] font-normal text-gray-400">(público)</span>
            </Label>
            <Input
              value={paypalClientId}
              onChange={e => setPaypalClientId(e.target.value)}
              placeholder="AXxx..."
              autoComplete="off"
              className="text-sm font-mono"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Client Secret
              <span className="text-[10px] font-normal text-gray-400">(secreto)</span>
              {cfg?.paypal_client_secret_set && (
                <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                  ● Configurado
                </span>
              )}
            </Label>
            <div className="relative">
              <Input
                type={showPpSecret ? 'text' : 'password'}
                value={paypalClientSecret}
                onChange={e => setPaypalClientSecret(e.target.value)}
                placeholder={cfg?.paypal_client_secret_set ? '●●●●●●●● (dejar vacío = mantener)' : 'EHxx...'}
                autoComplete="new-password"
                className="text-sm font-mono pr-10"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                onClick={() => setShowPpSecret(v => !v)}
              >
                {showPpSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              Dejá vacío para mantener el secreto existente.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Entorno</Label>
            <Select value={paypalMode} onValueChange={setPaypalMode}>
              <SelectTrigger className="text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox — pruebas</SelectItem>
                <SelectItem value="live">Live — producción</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* FOP para registrar pagos PayPal en transactions */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-2">
              Forma de pago en el libro
              <span className="text-[10px] font-normal text-gray-400">(para reportes)</span>
            </Label>
            <Select
              value={paypalFopId != null ? String(paypalFopId) : '__none__'}
              onValueChange={v => setPaypalFopId(v === '__none__' ? null : parseInt(v))}
            >
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Sin asignar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— Sin asignar —</SelectItem>
                {fopsList.map(f => (
                  <SelectItem key={f.id} value={String(f.id)}>{f.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400">
              Seleccioná la forma de pago que representa PayPal en tu libro de movimientos.
              Los pagos aprobados se registrarán automáticamente en Transacciones.
            </p>
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-xs text-blue-700">
            Credenciales en{' '}
            <a href="https://developer.paypal.com/developer/applications" target="_blank" rel="noopener noreferrer"
              className="underline font-medium">
              PayPal Developer → My Apps & Credentials
            </a>.
            En Sandbox usá las credenciales de la app de prueba; en Live, las de la app de producción.
          </div>
        </div>
      )}

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar configuración de pago
      </Button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Dropshipping CJ
// ══════════════════════════════════════════════════════════════════════════════
interface CJSettings {
  cj_enabled:      string
  cj_api_email:    string | null
  cj_auto_fulfill: string
  cj_api_key_set:  boolean
}

function CJTab() {
  const [cfg,     setCfg    ] = useState<CJSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving ] = useState(false)
  const [syncing, setSyncing] = useState(false)

  const [enabled,     setEnabled    ] = useState(false)
  const [autoFulfill, setAutoFulfill] = useState(false)
  const [apiEmail,    setApiEmail   ] = useState('')
  const [apiKey,      setApiKey     ] = useState('')
  const [showKey,     setShowKey    ] = useState(false)

  useEffect(() => {
    fetch('/api/settings/cj')
      .then(r => r.json())
      .then((d: CJSettings) => {
        setCfg(d)
        setEnabled(d.cj_enabled === 'true')
        setAutoFulfill(d.cj_auto_fulfill === 'true')
        setApiEmail(d.cj_api_email ?? '')
      })
      .catch(() => toast.error('Error al cargar configuración CJ'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings/cj', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cj_enabled:      enabled      ? 'true' : 'false',
          cj_auto_fulfill: autoFulfill  ? 'true' : 'false',
          cj_api_email:    apiEmail.trim()  || null,
          cj_api_key:      apiKey.trim()    || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setCfg(prev => prev ? {
        ...prev,
        cj_enabled:      enabled      ? 'true' : 'false',
        cj_auto_fulfill: autoFulfill  ? 'true' : 'false',
        cj_api_email:    apiEmail.trim()  || null,
        cj_api_key_set:  prev.cj_api_key_set || !!apiKey.trim(),
      } : prev)
      setApiKey('')
      toast.success('Configuración CJ guardada')
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res  = await fetch('/api/admin/cj/sync', { method: 'POST' })
      const data = await res.json() as { updated: number; total: number; errors: unknown[] }
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Error')
      toast.success(`Sync completado: ${data.updated}/${data.total} productos actualizados`)
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSyncing(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-7 max-w-lg">

      {/* ── Habilitado ── */}
      <div className="flex items-center justify-between p-4 border rounded-xl">
        <div>
          <p className="text-sm font-semibold text-gray-800">Dropshipping CJ habilitado</p>
          <p className="text-xs text-gray-500">Activa la integración para este negocio</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {enabled && (
        <>
          {/* ── Auto-fulfill ── */}
          <div className="flex items-center justify-between p-4 border rounded-xl bg-amber-50 border-amber-200">
            <div>
              <p className="text-sm font-semibold text-amber-800">Auto-fulfillment</p>
              <p className="text-xs text-amber-700">
                Enviar a CJ automáticamente cuando el pago es confirmado
              </p>
            </div>
            <Switch
              checked={autoFulfill}
              onCheckedChange={setAutoFulfill}
              className="data-[state=checked]:bg-amber-500"
            />
          </div>

          {/* ── Credenciales ── */}
          <div className="space-y-4 pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Credenciales CJ API
            </p>

            <div className="space-y-1.5">
              <Label>Email de la cuenta CJ</Label>
              <Input
                type="email"
                value={apiEmail}
                onChange={e => setApiEmail(e.target.value)}
                placeholder="tu@email.com"
                autoComplete="off"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-2">
                API Key
                <span className="text-[10px] font-normal text-gray-400">(secreto)</span>
                {cfg?.cj_api_key_set && (
                  <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                    ● Configurado
                  </span>
                )}
              </Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value)}
                  placeholder={cfg?.cj_api_key_set ? '●●●●●●●● (dejar vacío = mantener)' : 'API Key de CJ Developer Portal'}
                  autoComplete="new-password"
                  className="text-sm font-mono pr-10"
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setShowKey(v => !v)}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400">
                Disponible en{' '}
                <a
                  href="https://developers.cjdropshipping.com"
                  target="_blank" rel="noopener noreferrer"
                  className="underline text-violet-600"
                >
                  developers.cjdropshipping.com
                </a>
                {' '}→ API Management
              </p>
            </div>
          </div>

          {/* ── Acciones ── */}
          <div className="pt-2 border-t border-gray-100 space-y-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Acciones</p>
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                onClick={handleSync}
                disabled={syncing || !cfg?.cj_api_key_set}
                className="gap-2"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Sync precios y stock
              </Button>
              <a
                href="/cj-import"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors"
              >
                <Globe className="h-4 w-4" />
                Importar productos
              </a>
            </div>
          </div>
        </>
      )}

      <Button onClick={handleSave} disabled={saving} className="gap-2">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Guardar configuración CJ
      </Button>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Componente principal
// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Emails transaccionales
// ══════════════════════════════════════════════════════════════════════════════
function EmailTab() {
  const [loading,   setLoading  ] = useState(true)
  const [saving,    setSaving   ] = useState(false)
  const [testing,   setTesting  ] = useState(false)
  const [testTo,    setTestTo   ] = useState('')

  // Campos públicos
  const [enabled,     setEnabled    ] = useState(false)
  const [smtpHost,    setSmtpHost   ] = useState('')
  const [smtpPort,    setSmtpPort   ] = useState('587')
  const [smtpSecure,  setSmtpSecure ] = useState(false)
  const [fromName,    setFromName   ] = useState('')
  const [fromAddress, setFromAddress] = useState('')
  const [replyTo,     setReplyTo    ] = useState('')
  const [bcc,         setBcc        ] = useState('')

  // Templates editables
  const [subjectConfirmation, setSubjectConfirmation] = useState('')
  const [introConfirmation,   setIntroConfirmation  ] = useState('')
  const [subjectShipment,     setSubjectShipment    ] = useState('')
  const [introShipment,       setIntroShipment      ] = useState('')

  // Credenciales secretas (solo se ven como flags)
  const [userSet,  setUserSet ] = useState(false)
  const [passSet,  setPassSet ] = useState(false)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpPass, setSmtpPass] = useState('')
  const [showPass, setShowPass] = useState(false)

  useEffect(() => {
    fetch('/api/settings/email')
      .then(r => r.json())
      .then((d: Record<string, string | boolean>) => {
        setEnabled(d.email_enabled === 'true')
        setSmtpHost(String(d.email_smtp_host    ?? ''))
        setSmtpPort(String(d.email_smtp_port    ?? '587'))
        setSmtpSecure(d.email_smtp_secure === 'true')
        setFromName(String(d.email_from_name    ?? ''))
        setFromAddress(String(d.email_from_address ?? ''))
        setReplyTo(String(d.email_reply_to      ?? ''))
        setBcc(String(d.email_bcc               ?? ''))
        setSubjectConfirmation(String(d.email_subject_confirmation ?? ''))
        setIntroConfirmation(String(d.email_intro_confirmation     ?? ''))
        setSubjectShipment(String(d.email_subject_shipment         ?? ''))
        setIntroShipment(String(d.email_intro_shipment             ?? ''))
        setUserSet(!!d.email_smtp_user_set)
        setPassSet(!!d.email_smtp_pass_set)
      })
      .catch(() => toast.error('Error al cargar configuración de email'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: Record<string, string | null> = {
        email_enabled:               enabled ? 'true' : 'false',
        email_smtp_host:             smtpHost.trim()              || null,
        email_smtp_port:             smtpPort.trim()              || '587',
        email_smtp_secure:           smtpSecure ? 'true' : 'false',
        email_from_name:             fromName.trim()              || null,
        email_from_address:          fromAddress.trim()           || null,
        email_reply_to:              replyTo.trim()               || null,
        email_bcc:                   bcc.trim()                   || null,
        email_subject_confirmation:  subjectConfirmation.trim()   || null,
        email_intro_confirmation:    introConfirmation.trim()     || null,
        email_subject_shipment:      subjectShipment.trim()       || null,
        email_intro_shipment:        introShipment.trim()         || null,
        email_smtp_user:             smtpUser.trim()              || null,
        email_smtp_pass:             smtpPass.trim()              || null,
      }
      const res = await fetch('/api/settings/email', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      // Marcar como set si se guardaron credenciales
      if (smtpUser.trim()) { setUserSet(true); setSmtpUser('') }
      if (smtpPass.trim()) { setPassSet(true); setSmtpPass('') }
      toast.success('Configuración de email guardada')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!testTo.trim()) { toast.error('Ingresá un email de destino'); return }
    setTesting(true)
    try {
      const res = await fetch('/api/settings/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ testTo: testTo.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success(`Email de prueba enviado a ${testTo}`)
    } catch (err) {
      toast.error(`Error al enviar prueba: ${(err as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  return (
    <div className="space-y-6 max-w-xl">

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-1">Emails transaccionales</h3>
        <p className="text-sm text-gray-500">
          Configurá el servidor SMTP para enviar confirmaciones de pedido y notificaciones de envío a tus clientes.
          Compatible con Gmail, Outlook, Zoho o cualquier proveedor SMTP.
        </p>
      </div>

      {/* Habilitar */}
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border">
        <div>
          <p className="text-sm font-medium text-gray-800">Emails habilitados</p>
          <p className="text-xs text-gray-500 mt-0.5">Los clientes recibirán confirmación de pedido y aviso de envío.</p>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </div>

      {/* Servidor SMTP */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Servidor SMTP</p>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2 space-y-1.5">
            <Label>Host</Label>
            <Input placeholder="smtp.gmail.com" value={smtpHost} onChange={e => setSmtpHost(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Puerto</Label>
            <Input placeholder="587" value={smtpPort} onChange={e => setSmtpPort(e.target.value)} />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch id="smtp-secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
          <Label htmlFor="smtp-secure" className="cursor-pointer">
            SSL directo (puerto 465) — desactivado = STARTTLS (puerto 587)
          </Label>
        </div>

        <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg text-xs text-blue-700 space-y-1">
          <p className="font-semibold">Gmail / Google Workspace</p>
          <p>Host: <code className="bg-blue-100 px-1 rounded">smtp.gmail.com</code> · Puerto: <code className="bg-blue-100 px-1 rounded">587</code> · SSL: desactivado</p>
          <p>Necesitás una <strong>App Password</strong> (no tu contraseña normal). Activala en tu cuenta Google → Seguridad → Verificación en 2 pasos → Contraseñas de aplicación.</p>
        </div>
      </div>

      {/* Credenciales */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Credenciales SMTP</p>

        <div className="space-y-1.5">
          <Label>
            Usuario SMTP
            {userSet && <span className="ml-2 text-[10px] font-normal text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">configurado</span>}
          </Label>
          <Input
            placeholder={userSet ? '••••••••••••  (dejar vacío para no cambiar)' : 'tu@gmail.com'}
            value={smtpUser}
            onChange={e => setSmtpUser(e.target.value)}
            autoComplete="off"
          />
        </div>

        <div className="space-y-1.5">
          <Label>
            Contraseña / App Password
            {passSet && <span className="ml-2 text-[10px] font-normal text-green-600 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded-full">configurado</span>}
          </Label>
          <div className="relative">
            <Input
              type={showPass ? 'text' : 'password'}
              placeholder={passSet ? '••••••••••••  (dejar vacío para no cambiar)' : 'App Password de 16 caracteres'}
              value={smtpPass}
              onChange={e => setSmtpPass(e.target.value)}
              autoComplete="new-password"
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPass(p => !p)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="text-xs text-gray-400">Las credenciales se guardan cifradas y nunca se muestran en claro.</p>
        </div>
      </div>

      {/* Remitente */}
      <div className="space-y-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Remitente</p>

        <div className="space-y-1.5">
          <Label>Nombre del remitente</Label>
          <Input placeholder="Mi Tienda" value={fromName} onChange={e => setFromName(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Email del remitente (From)</Label>
          <Input type="email" placeholder="pedidos@mitienda.com" value={fromAddress} onChange={e => setFromAddress(e.target.value)} />
          <p className="text-xs text-gray-400">Generalmente el mismo que el usuario SMTP.</p>
        </div>

        <div className="space-y-1.5">
          <Label>Reply-To <span className="text-gray-400 font-normal">(opcional)</span></Label>
          <Input type="email" placeholder="soporte@mitienda.com" value={replyTo} onChange={e => setReplyTo(e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            BCC — Copia oculta
            <span className="text-gray-400 font-normal">(opcional)</span>
          </Label>
          <Input type="email" placeholder="ruben@ejemplo.com" value={bcc} onChange={e => setBcc(e.target.value)} />
          <p className="text-xs text-gray-400">Recibís una copia de cada email que se envía a clientes. Útil para monitorear.</p>
        </div>
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar cambios
        </Button>
      </div>

      {/* Test */}
      <div className="border-t pt-5 space-y-3">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Email de prueba</p>
        <p className="text-xs text-gray-400">Guardá los cambios primero y luego enviá un email de prueba para verificar que la configuración funciona.</p>
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="destino@ejemplo.com"
            value={testTo}
            onChange={e => setTestTo(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleTest()}
            className="max-w-xs"
          />
          <Button variant="outline" onClick={handleTest} disabled={testing} className="gap-2 shrink-0">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {testing ? 'Enviando…' : 'Enviar prueba'}
          </Button>
        </div>
      </div>

      {/* Emails automáticos — estado + templates editables */}
      <div className="border-t pt-5 space-y-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Emails automáticos</p>

        {/* ── Confirmación de pedido ── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex items-start gap-3 p-4 bg-gray-50">
            <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-800">Pago aprobado</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">ACTIVO</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Confirmación de pedido con ítems, totales y link de tracking · Disparado al capturar pago PayPal / MercadoPago</p>
            </div>
          </div>
          <div className="p-4 space-y-3 border-t border-gray-100">
            <div className="space-y-1.5">
              <Label className="text-xs">Asunto del email</Label>
              <Input
                placeholder={`Order #{{orderId}} confirmed — {{storeName}}`}
                value={subjectConfirmation}
                onChange={e => setSubjectConfirmation(e.target.value)}
                className="text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto de introducción</Label>
              <textarea
                rows={3}
                placeholder={`Hi {{buyerName}}, your order #{{orderId}} is confirmed and being processed.`}
                value={introConfirmation}
                onChange={e => setIntroConfirmation(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y"
              />
              <p className="text-xs text-gray-400">
                Variables: <code className="bg-gray-100 px-1 rounded">{'{{buyerName}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{orderId}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{storeName}}'}</code>.
                Dejá vacío para usar el texto por defecto.
              </p>
            </div>
          </div>
        </div>

        {/* ── Pedido enviado ── */}
        <div className="rounded-xl border border-amber-200 overflow-hidden">
          <div className="flex items-start gap-3 p-4 bg-amber-50">
            <Clock className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-800">Pedido enviado</p>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">PENDIENTE DE CONEXIÓN</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Notificación de envío con carrier y número de guía · Se activará cuando CJ registre el tracking del pedido</p>
            </div>
          </div>
          <div className="p-4 space-y-3 border-t border-amber-100">
            <div className="space-y-1.5">
              <Label className="text-xs">Asunto del email</Label>
              <Input
                placeholder={`Your order #{{orderId}} has shipped! — {{storeName}}`}
                value={subjectShipment}
                onChange={e => setSubjectShipment(e.target.value)}
                className="text-sm font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Texto de introducción</Label>
              <textarea
                rows={3}
                placeholder={`Hi {{buyerName}}, order #{{orderId}} has been shipped!`}
                value={introShipment}
                onChange={e => setIntroShipment(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y"
              />
              <p className="text-xs text-gray-400">
                Variables: <code className="bg-gray-100 px-1 rounded">{'{{buyerName}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{orderId}}'}</code>{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{storeName}}'}</code>.
                Dejá vacío para usar el texto por defecto.
              </p>
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: MercadoLibre
// ══════════════════════════════════════════════════════════════════════════════

interface MLSettings {
  ml_enabled:            boolean
  ml_app_id:             string | null
  ml_app_secret:         string | null   // '••••••••' si está configurado
  ml_user_id:            string | null
  ml_token_expires:      string | null
  connected:             boolean
  ml_msg_confirmation?:  string | null
  ml_msg_dispatched?:    string | null
}

function MLTab() {
  const [cfg,      setCfg     ] = useState<MLSettings | null>(null)
  const [loading,  setLoading ] = useState(true)
  const [saving,   setSaving  ] = useState(false)
  const [appId,    setAppId   ] = useState('')
  const [appSecret,setAppSecret] = useState('')
  const [showSecret,setShowSecret] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [msgConfirmation, setMsgConfirmation] = useState('')
  const [msgDispatched,   setMsgDispatched  ] = useState('')
  const [savingMsgs,      setSavingMsgs     ] = useState(false)

  const DEFAULT_CONFIRMATION = '¡Hola {{buyerNickname}}! Recibimos tu pedido en {{storeName}} y ya lo estamos preparando 🙌. Ante cualquier consulta, escribinos acá.'
  const DEFAULT_DISPATCHED   = '¡Hola {{buyerNickname}}! Tu pedido ya fue despachado por {{carrier}} 📦. Número de seguimiento: {{trackingNumber}}. Podés rastrearlo en el sitio del correo. ¡Gracias por tu compra!'

  useEffect(() => {
    fetch('/api/settings/ml')
      .then(r => r.json())
      .then((d: MLSettings) => {
        setCfg(d)
        setAppId(d.ml_app_id ?? '')
        setMsgConfirmation(d.ml_msg_confirmation ?? '')
        setMsgDispatched(d.ml_msg_dispatched ?? '')
      })
      .catch(() => toast.error('Error al cargar configuración ML'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    if (!appId.trim()) { toast.error('El App ID es obligatorio'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/settings/ml', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ml_app_id:     appId.trim()     || null,
          ml_app_secret: appSecret.trim() || null,
        }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      setCfg(prev => prev ? {
        ...prev,
        ml_app_id:     appId.trim()     || null,
        ml_app_secret: appSecret.trim() ? '••••••••' : prev.ml_app_secret,
      } : prev)
      setAppSecret('')
      toast.success('Credenciales guardadas')
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('¿Desconectar MercadoLibre? Se borrarán los tokens de acceso.')) return
    setDisconnecting(true)
    try {
      await fetch('/api/settings/ml', { method: 'DELETE' })
      setCfg(prev => prev ? { ...prev, connected: false, ml_user_id: null, ml_token_expires: null } : prev)
      toast.success('ML desconectado')
    } catch {
      toast.error('Error al desconectar')
    } finally {
      setDisconnecting(false)
    }
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-400 py-8">
      <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
    </div>
  )

  const hasCredentials = !!(cfg?.ml_app_id && cfg?.ml_app_secret)
  const tokenExpires   = cfg?.ml_token_expires ? new Date(cfg.ml_token_expires) : null

  return (
    <div className="space-y-7 max-w-lg">

      {/* ── Estado de conexión ── */}
      <div className={`flex items-center justify-between p-4 border rounded-xl ${
        cfg?.connected
          ? 'bg-green-50 border-green-200'
          : 'bg-gray-50 border-gray-200'
      }`}>
        <div>
          <p className={`text-sm font-semibold ${cfg?.connected ? 'text-green-800' : 'text-gray-700'}`}>
            {cfg?.connected ? '● Conectado a MercadoLibre' : '○ No conectado'}
          </p>
          {cfg?.connected && cfg.ml_user_id && (
            <p className="text-xs text-green-600 mt-0.5">User ID: {cfg.ml_user_id}</p>
          )}
          {cfg?.connected && tokenExpires && (
            <p className="text-xs text-green-600">
              Token vence: {tokenExpires.toLocaleString('es-AR')} (se renueva automático)
            </p>
          )}
          {!cfg?.connected && (
            <p className="text-xs text-gray-500 mt-0.5">
              Cargá las credenciales y hacé clic en "Conectar con ML"
            </p>
          )}
        </div>
        {cfg?.connected && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            {disconnecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Unlink className="h-4 w-4" />}
            <span className="ml-1.5">Desconectar</span>
          </Button>
        )}
      </div>

      {/* ── Credenciales de la app ── */}
      <div className="space-y-4 border-t border-gray-100 pt-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Credenciales de la App ML
        </p>
        <p className="text-xs text-gray-500">
          Obtené el App ID y Secret Key en{' '}
          <a
            href="https://developers.mercadolibre.com.ar"
            target="_blank" rel="noopener noreferrer"
            className="underline text-violet-600"
          >
            developers.mercadolibre.com.ar
          </a>
          {' '}→ Tu aplicación → Credenciales.
        </p>

        <div className="space-y-1.5">
          <Label>App ID</Label>
          <Input
            value={appId}
            onChange={e => setAppId(e.target.value)}
            placeholder="1234567890123456"
            autoComplete="off"
            className="text-sm font-mono"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="flex items-center gap-2">
            Secret Key
            <span className="text-[10px] font-normal text-gray-400">(secreto)</span>
            {cfg?.ml_app_secret && (
              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                ● Configurado
              </span>
            )}
          </Label>
          <div className="relative">
            <Input
              type={showSecret ? 'text' : 'password'}
              value={appSecret}
              onChange={e => setAppSecret(e.target.value)}
              placeholder={cfg?.ml_app_secret ? '●●●●●●●● (dejar vacío = mantener)' : 'Secret Key de la app ML'}
              autoComplete="new-password"
              className="text-sm font-mono pr-10"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setShowSecret(v => !v)}
            >
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Guardar credenciales
        </Button>
      </div>

      {/* ── OAuth — conectar con ML ── */}
      {hasCredentials && !cfg?.connected && (
        <div className="border border-violet-200 bg-violet-50 rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-violet-800">Conectar tu cuenta de vendedor</p>
          <p className="text-xs text-violet-700">
            Hacé clic para autorizar a ROIPOS a gestionar tus publicaciones y recibir pedidos de ML.
            Serás redirigido a MercadoLibre y volvés automáticamente.
          </p>
          <a href="/api/ml/auth/start">
            <Button className="w-full bg-yellow-400 hover:bg-yellow-500 text-yellow-900 font-semibold border-0">
              <LinkIcon className="h-4 w-4 mr-2" />
              Conectar con MercadoLibre
            </Button>
          </a>
        </div>
      )}

      {/* ── Templates de mensajes ML ── */}
      <div className="space-y-4 border-t border-gray-100 pt-5">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Mensajes automáticos al comprador
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Variables disponibles: <code className="bg-gray-100 px-1 rounded">{'{{buyerNickname}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{storeName}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{trackingNumber}}'}</code>{' '}
            <code className="bg-gray-100 px-1 rounded">{'{{carrier}}'}</code>
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Mensaje de confirmación de pedido</Label>
          <p className="text-[11px] text-gray-400">Se envía automáticamente cuando llega un pedido pagado.</p>
          <textarea
            value={msgConfirmation}
            onChange={e => setMsgConfirmation(e.target.value)}
            placeholder={DEFAULT_CONFIRMATION}
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
          />
          <p className="text-[11px] text-gray-400">
            Vacío = usa el mensaje por defecto.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Mensaje de despacho (con tracking)</Label>
          <p className="text-[11px] text-gray-400">Se envía cuando hacés clic en &ldquo;Enviar tracking por ML&rdquo; en un pedido.</p>
          <textarea
            value={msgDispatched}
            onChange={e => setMsgDispatched(e.target.value)}
            placeholder={DEFAULT_DISPATCHED}
            rows={3}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
          />
          <p className="text-[11px] text-gray-400">
            Vacío = usa el mensaje por defecto.
          </p>
        </div>

        <Button
          onClick={async () => {
            setSavingMsgs(true)
            try {
              const res = await fetch('/api/settings/ml', {
                method:  'PUT',
                headers: { 'Content-Type': 'application/json' },
                body:    JSON.stringify({
                  ml_msg_confirmation: msgConfirmation.trim() || null,
                  ml_msg_dispatched:   msgDispatched.trim()   || null,
                }),
              })
              if (!res.ok) throw new Error((await res.json() as { error?: string }).error)
              toast.success('Mensajes ML guardados')
            } catch (e) {
              toast.error(String(e))
            } finally {
              setSavingMsgs(false)
            }
          }}
          disabled={savingMsgs}
          variant="outline"
          className="w-full"
        >
          {savingMsgs
            ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
            : <Save className="h-4 w-4 mr-2" />}
          Guardar mensajes
        </Button>
      </div>

      {/* ── Instrucciones redirect URI ── */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-600">Redirect URI requerido en la app ML</p>
        <div className="flex items-center gap-2">
          <code className="text-xs bg-white border border-gray-200 rounded px-2 py-1 flex-1 break-all">
            {typeof window !== 'undefined' ? `${window.location.origin}/api/ml/auth/callback` : '/api/ml/auth/callback'}
          </code>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 shrink-0"
            onClick={() => {
              const uri = `${window.location.origin}/api/ml/auth/callback`
              navigator.clipboard.writeText(uri).then(() => toast.success('Copiado'))
            }}
          >
            <Copy className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-gray-400">
          Copiá esta URL y pegála en Redirect URIs de tu aplicación en developers.mercadolibre.com.ar
        </p>
      </div>

    </div>
  )
}

// ── TABS array ────────────────────────────────────────────────────────────────

const TABS: { value: Tab; label: string; Icon: React.ElementType }[] = [
  { value: 'negocio',    label: 'Negocio',    Icon: Building2  },
  { value: 'usuarios',   label: 'Usuarios',   Icon: Users      },
  { value: 'sucursales', label: 'Sucursales', Icon: Warehouse  },
  { value: 'cuentas',    label: 'Cuentas',    Icon: Wallet     },
  { value: 'catalogo',   label: 'Catálogo',   Icon: Rss        },
  { value: 'pagos',        label: 'Pagos',        Icon: CreditCard },
  { value: 'dropshipping', label: 'Dropshipping', Icon: Globe      },
  { value: 'ia',           label: 'IA',            Icon: Sparkles   },
  { value: 'gastos',       label: 'Gastos',        Icon: Receipt    },
  { value: 'paginas',      label: 'Páginas',       Icon: FileText   },
  { value: 'email',        label: 'Emails',        Icon: Mail        },
  { value: 'ml',           label: 'Mercado Libre', Icon: ShoppingBag },
]

// ══════════════════════════════════════════════════════════════════════════════
// Pestaña: Páginas de la tienda (Shipping Policy, Terms, FAQ…)
// ══════════════════════════════════════════════════════════════════════════════
const SUGGESTED_PAGES = [
  { slug: 'shipping-policy', title: 'Shipping Policy'              },
  { slug: 'terms',           title: 'Terms of Service'             },
  { slug: 'politica-envios', title: 'Política de Envíos'           },
  { slug: 'terminos',        title: 'Términos y Condiciones'       },
  { slug: 'devoluciones',    title: 'Política de Devoluciones'     },
  { slug: 'faq',             title: 'Preguntas Frecuentes'         },
]

function PaginasTab() {
  const [pages,       setPages      ] = useState<{ id: number; slug: string; title: string; is_published: boolean; updated_at: string }[]>([])
  const [selSlug,     setSelSlug    ] = useState<string | null>(null)
  const [slug,        setSlug       ] = useState('')
  const [title,       setTitle      ] = useState('')
  const [content,     setContent    ] = useState('')
  const [isPublished, setIsPublished] = useState(true)
  const [saving,      setSaving     ] = useState(false)
  const [loading,     setLoading    ] = useState(true)
  const [deleting,    setDeleting   ] = useState(false)

  const loadPages = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/store-pages')
      .then(r => r.json())
      .then(setPages)
      .catch(() => toast.error('Error al cargar páginas'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { loadPages() }, [loadPages])

  const selectPage = (s: string) => {
    const p = pages.find(x => x.slug === s)
    if (!p) {
      // nueva página con slug sugerido
      const sug = SUGGESTED_PAGES.find(x => x.slug === s)
      setSlug(s); setTitle(sug?.title ?? ''); setContent(''); setIsPublished(true)
    } else {
      setSlug(p.slug); setTitle(p.title); setIsPublished(p.is_published)
      // Cargar contenido completo desde la API pública (incluye content)
      fetch(`/api/store-pages/${p.slug}`)
        .then(r => r.ok ? r.json() : { content: '' })
        .then(d => setContent(d.content ?? ''))
    }
    setSelSlug(s)
  }

  const handleSave = async () => {
    if (!slug.trim() || !title.trim()) { toast.error('Slug y título son obligatorios'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/store-pages', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: slug.trim(), title: title.trim(), content, is_published: isPublished }),
      })
      if (!res.ok) throw new Error((await res.json()).error)
      toast.success('Página guardada')
      loadPages()
    } catch (err: unknown) {
      toast.error((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!selSlug) return
    if (!confirm(`¿Eliminar la página "${title}"?`)) return
    setDeleting(true)
    try {
      await fetch(`/api/admin/store-pages?slug=${selSlug}`, { method: 'DELETE' })
      toast.success('Página eliminada')
      setSelSlug(null); setSlug(''); setTitle(''); setContent('')
      loadPages()
    } finally {
      setDeleting(false)
    }
  }

  const existingSlugs = new Set(pages.map(p => p.slug))
  const allSuggested  = SUGGESTED_PAGES.filter(s => !existingSlugs.has(s.slug))

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-gray-400" />
        <div>
          <h2 className="font-semibold text-gray-900">Páginas de la tienda</h2>
          <p className="text-xs text-gray-400">
            Shipping Policy, Terms of Service, FAQ y páginas personalizadas.
            URL: <code className="bg-gray-100 px-1 rounded">/tienda/p/[slug]</code>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Lista de páginas */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Páginas existentes</p>
          {loading && <p className="text-xs text-gray-400">Cargando…</p>}
          {!loading && pages.length === 0 && (
            <p className="text-xs text-gray-400">Ninguna todavía. Elegí una sugerida →</p>
          )}
          {pages.map(p => (
            <button key={p.slug} onClick={() => selectPage(p.slug)}
              className={`w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors
                ${selSlug === p.slug ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <p className="font-medium text-gray-800 truncate">{p.title}</p>
              <p className="text-[10px] text-gray-400 font-mono truncate">/p/{p.slug}</p>
              {!p.is_published && <span className="text-[9px] text-amber-500 font-semibold">BORRADOR</span>}
            </button>
          ))}

          {allSuggested.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide pt-2">Sugeridas (nuevas)</p>
              {allSuggested.map(s => (
                <button key={s.slug} onClick={() => selectPage(s.slug)}
                  className={`w-full text-left px-3 py-2 rounded-lg border border-dashed text-sm transition-colors
                    ${selSlug === s.slug ? 'border-violet-400 bg-violet-50' : 'border-gray-200 hover:border-violet-200 hover:bg-violet-50/40'}`}>
                  <p className="font-medium text-gray-600 truncate">+ {s.title}</p>
                  <p className="text-[10px] text-gray-400 font-mono">/p/{s.slug}</p>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Editor */}
        <div className="md:col-span-2 space-y-3">
          {!selSlug ? (
            <div className="flex items-center justify-center h-48 text-gray-300 text-sm border-2 border-dashed rounded-xl">
              Seleccioná una página para editar
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Slug (URL)</Label>
                  <Input value={slug} onChange={e => setSlug(e.target.value)}
                    className="text-sm font-mono"
                    placeholder="shipping-policy"
                    disabled={existingSlugs.has(selSlug)} />
                </div>
                <div className="space-y-1">
                  <Label>Título</Label>
                  <Input value={title} onChange={e => setTitle(e.target.value)}
                    className="text-sm" placeholder="Shipping Policy" />
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label>Contenido (HTML)</Label>
                  {existingSlugs.has(selSlug) && (
                    <a href={`/tienda/p/${selSlug}`} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-violet-600 flex items-center gap-1 hover:underline">
                      <ExternalLink className="h-3 w-3" /> Ver página
                    </a>
                  )}
                </div>
                <textarea
                  value={content}
                  onChange={e => setContent(e.target.value)}
                  rows={18}
                  className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:ring-2 focus:ring-violet-300 resize-y"
                  placeholder="<h2>Shipping</h2><p>...</p>"
                />
                <p className="text-xs text-gray-400">
                  HTML plano. Usá <code className="bg-gray-100 px-1 rounded">&lt;h2&gt;</code> para secciones,
                  <code className="bg-gray-100 px-1 rounded"> &lt;p&gt;</code> para párrafos,
                  <code className="bg-gray-100 px-1 rounded"> &lt;ul&gt;&lt;li&gt;</code> para listas.
                  El estilo lo aplica el tema del negocio automáticamente.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <input type="checkbox" id="chk-published" checked={isPublished}
                  onChange={e => setIsPublished(e.target.checked)}
                  className="rounded" />
                <label htmlFor="chk-published" className="text-sm text-gray-700">Publicada (visible en la tienda)</label>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button onClick={handleSave} disabled={saving} className="gap-2 flex-1">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Guardar página
                </Button>
                {existingSlugs.has(selSlug) && (
                  <Button variant="outline" onClick={handleDelete} disabled={deleting}
                    className="gap-2 text-red-600 border-red-200 hover:bg-red-50">
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default function SettingsPanel() {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const t = searchParams.get('tab')
    return (t && ['negocio','usuarios','sucursales','cuentas','catalogo','ia','gastos','pagos','dropshipping','paginas','email','ml'].includes(t))
      ? (t as Tab)
      : 'negocio'
  })

  // Toast de resultado OAuth ML
  useEffect(() => {
    const status = searchParams.get('ml_status')
    if (!status) return
    if (status === 'connected')  toast.success('✅ MercadoLibre conectado correctamente')
    if (status === 'cancelled')  toast.info('Conexión con ML cancelada')
    if (status === 'error') {
      const msg = searchParams.get('ml_msg') ?? 'Error desconocido'
      toast.error(`Error ML: ${decodeURIComponent(msg)}`)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 p-2 sm:p-4 md:p-8">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">

        {/* Título */}
        <div className="flex items-center gap-3">
          <Building2 className="h-6 w-6 text-violet-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
            <p className="text-sm text-gray-500">Negocio, usuarios y sucursales</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl border shadow-sm">
          {/* Tab headers — wraps into 2 rows when tabs don't fit */}
          <div className="border-b">
            <div className="flex flex-wrap px-2 pt-2 gap-0.5">
              {TABS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  onClick={() => setTab(value)}
                  className={`flex items-center gap-1.5 px-2.5 py-2 text-xs font-medium rounded-t-lg transition-colors border-b-2 -mb-px whitespace-nowrap
                    ${tab === value
                      ? 'border-violet-500 text-violet-700 bg-violet-50/50'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="p-3 sm:p-6">
            {tab === 'negocio'    && <NegocioTab />}
            {tab === 'usuarios'   && <UsuariosTab />}
            {tab === 'sucursales' && <SucursalesTab />}
            {tab === 'cuentas'    && <CuentasTab />}
            {tab === 'catalogo'   && <CatalogoTab />}
            {tab === 'pagos'        && <PagosTab />}
            {tab === 'dropshipping' && <CJTab />}
            {tab === 'ia'           && <IATab />}
            {tab === 'gastos'       && <GastosTab />}
            {tab === 'paginas'      && <PaginasTab />}
            {tab === 'email'        && <EmailTab />}
            {tab === 'ml'           && <MLTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
