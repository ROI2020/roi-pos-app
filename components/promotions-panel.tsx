"use client"

import React, { useState, useEffect, useCallback } from "react"
import {
  Plus, Pencil, Trash2, Tag, BarChart3, RefreshCw,
  Percent, DollarSign, Trophy, Loader2, Eye, Printer,
} from "lucide-react"
import { toast }     from "sonner"
import { Button }    from "@/components/ui/button"
import { Input }     from "@/components/ui/input"
import { Label }     from "@/components/ui/label"
import { Textarea }  from "@/components/ui/textarea"
import { Switch }    from "@/components/ui/switch"
import { Badge }     from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"

// ── Types ─────────────────────────────────────────────────────────────────────
interface LookupItem { id: number; name: string }

interface Promotion {
  id:                   number
  name:                 string | null
  summary:              string | null
  detail:               string | null
  discount_type:        string
  value:                number
  days_of_week:         string
  category_id:          number | null; category_name:  string | null
  age_group_id:         number | null; age_group_name: string | null
  season_id:            number | null; season_name:    string | null
  gender_id:            number | null; gender_name:    string | null
  start_date:           string | null
  end_date:             string | null
  roulette_weight:      number
  roulette_daily_limit: number | null
  roulette_only:        boolean
  estimated_savings:    number
  active:               boolean
  created_at:           string
}

interface Stats {
  active_promotions:   number
  inactive_promotions: number
  spins_this_month:    number
  prizes_this_month:   number
  spins_today:         number
  win_rate:            number
  total_codes:         number
  used_codes:          number
  total_customers:     number
  verified_customers:  number
  top_promotion:       { name: string; summary: string; wins: number } | null
}

// ── Day selector ──────────────────────────────────────────────────────────────
const DAYS = [
  { d: '1', label: 'Lu' }, { d: '2', label: 'Ma' }, { d: '3', label: 'Mi' },
  { d: '4', label: 'Ju' }, { d: '5', label: 'Vi' }, { d: '6', label: 'Sa' },
  { d: '7', label: 'Do' },
]

function DaySelector({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function toggle(d: string) {
    if (value.includes(d)) onChange(value.replace(d, '').split('').sort().join(''))
    else                   onChange((value + d).split('').sort().join(''))
  }
  return (
    <div className="flex gap-1">
      {DAYS.map(({ d, label }) => (
        <button
          key={d} type="button"
          onClick={() => toggle(d)}
          className={`w-8 h-8 rounded-md text-xs font-semibold transition-colors
            ${value.includes(d)
              ? 'bg-violet-600 text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, sub, color = 'violet',
}: { label: string; value: string | number; sub?: string; color?: string }) {
  const colors: Record<string, string> = {
    violet: 'bg-violet-50 text-violet-700',
    green:  'bg-green-50  text-green-700',
    amber:  'bg-amber-50  text-amber-700',
    blue:   'bg-blue-50   text-blue-700',
    rose:   'bg-rose-50   text-rose-700',
  }
  return (
    <div className={`rounded-xl p-4 ${colors[color]}`}>
      <p className="text-xs font-medium opacity-70 mb-1">{label}</p>
      <p className="text-3xl font-bold">{value}</p>
      {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Empty form ────────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  name:                 '',
  summary:              '',
  detail:               '',
  discount_type:        'percentage',
  value:                '',
  days_of_week:         '1234567',
  category_id:          '',
  age_group_id:         '',
  season_id:            '',
  gender_id:            '',
  start_date:           '',
  end_date:             '',
  roulette_weight:      '10',
  roulette_daily_limit: '',
  roulette_only:        false,
  estimated_savings:    '',
  active:               true,
}

type FormState = typeof EMPTY_FORM

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function discountLabel(p: Promotion) {
  return p.discount_type === 'percentage'
    ? `${p.value}% OFF`
    : `$${p.value.toLocaleString('es-AR')} OFF`
}

function daysLabel(days: string) {
  if (days === '1234567') return 'Todos los días'
  return days.split('').map(d => DAYS.find(x => x.d === d)?.label ?? d).join(' · ')
}

// ── PromoFlyer ────────────────────────────────────────────────────────────────
function PromoFlyer({
  promo, logoUrl, storeName,
}: {
  promo: Promotion
  logoUrl: string | null
  storeName: string | null
}) {
  const isPercent   = promo.discount_type === 'percentage'
  const bigNumber   = isPercent ? `${promo.value}%` : `$${promo.value.toLocaleString('es-AR')}`
  const daysText    = promo.days_of_week === '1234567' ? 'Todos los días' : daysLabel(promo.days_of_week)
  const hasFilters  = !!(promo.category_name || promo.age_group_name || promo.season_name || promo.gender_name)
  const hasDates    = !!(promo.start_date || promo.end_date)

  return (
    <div
      id="promo-flyer"
      className="relative w-[360px] flex flex-col overflow-hidden select-none"
      style={{
        background: 'linear-gradient(160deg,#0b0b14 0%,#110e2e 45%,#0b0b14 100%)',
        fontFamily: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
        color: '#fff',
      }}
    >
      {/* Glow decorativo */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 -left-16 w-64 h-64 rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #7c3aed, transparent)' }} />
        <div className="absolute -top-8 -right-8 w-48 h-48 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #ec4899, transparent)' }} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-72 h-32 opacity-10"
          style={{ background: 'radial-gradient(ellipse, #7c3aed, transparent)' }} />
      </div>

      {/* Barra superior */}
      <div className="h-1.5 w-full shrink-0"
        style={{ background: 'linear-gradient(90deg,#7c3aed,#ec4899,#7c3aed)' }} />

      {/* Logo + nombre */}
      <div className="relative flex flex-col items-center pt-7 pb-4 gap-2">
        {logoUrl ? (
          <img src={logoUrl} alt={storeName ?? ''} className="h-14 w-auto object-contain" />
        ) : (
          <div className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899)' }}>
            <Tag className="h-7 w-7 text-white" />
          </div>
        )}
        {storeName && (
          <p className="text-[11px] font-bold uppercase tracking-[0.3em]"
            style={{ color: '#a78bfa' }}>
            {storeName}
          </p>
        )}
      </div>

      {/* Caja principal del descuento */}
      <div className="relative mx-6 mb-5">
        {/* borde gradiente */}
        <div className="absolute inset-0 rounded-2xl p-px"
          style={{ background: 'linear-gradient(135deg,#7c3aed,#ec4899,#7c3aed)', borderRadius: '1rem' }}>
          <div className="w-full h-full rounded-2xl" style={{ background: '#0b0b14' }} />
        </div>
        <div className="relative rounded-2xl px-6 py-6 text-center"
          style={{ background: 'rgba(11,11,20,0.85)' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] mb-2"
            style={{ color: '#a78bfa' }}>
            DESCUENTO ESPECIAL
          </p>
          <p className="font-black leading-none mb-1"
            style={{
              fontSize: '72px',
              background: 'linear-gradient(135deg,#fff 0%,#ddd6fe 50%,#f9a8d4 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
            {bigNumber}
          </p>
          <p className="text-xl font-bold tracking-[0.25em]" style={{ color: '#f472b6' }}>
            OFF
          </p>
        </div>
      </div>

      {/* Nombre + summary */}
      <div className="relative text-center px-6 pb-5">
        {promo.name && (
          <p className="text-lg font-bold text-white mb-1 leading-tight">{promo.name}</p>
        )}
        {promo.summary && (
          <p className="text-sm font-semibold" style={{ color: '#c4b5fd' }}>{promo.summary}</p>
        )}
      </div>

      {/* Filtros (qué aplica) */}
      {hasFilters && (
        <div className="relative px-6 pb-5 flex flex-wrap justify-center gap-2">
          {promo.category_name  && <FilterChip icon="📦" label={promo.category_name} />}
          {promo.age_group_name && <FilterChip icon="👤" label={promo.age_group_name} />}
          {promo.season_name    && <FilterChip icon="🌸" label={promo.season_name} />}
          {promo.gender_name    && <FilterChip icon="✦"  label={promo.gender_name} />}
        </div>
      )}

      {/* Separador */}
      <div className="mx-6 mb-4" style={{ height: '1px', background: 'rgba(124,58,237,0.3)' }} />

      {/* Días + vigencia */}
      <div className="relative px-6 pb-4 flex flex-col gap-2 text-center">
        <div>
          <p className="text-[9px] font-bold uppercase tracking-[0.3em] mb-0.5"
            style={{ color: '#8b5cf6' }}>Válido</p>
          <p className="text-sm font-semibold" style={{ color: '#ddd6fe' }}>{daysText}</p>
        </div>
        {hasDates && (
          <div>
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] mb-0.5"
              style={{ color: '#8b5cf6' }}>Período</p>
            <p className="text-sm font-semibold" style={{ color: '#ddd6fe' }}>
              {promo.start_date ? formatDate(promo.start_date) : '—'} al{' '}
              {promo.end_date ? formatDate(promo.end_date) : '—'}
            </p>
          </div>
        )}
      </div>

      {/* Condiciones */}
      {promo.detail && (
        <>
          <div className="mx-6 mb-3" style={{ height: '1px', background: 'rgba(124,58,237,0.2)' }} />
          <div className="relative px-6 pb-5">
            <p className="text-[9px] font-bold uppercase tracking-[0.3em] mb-1.5"
              style={{ color: '#8b5cf6' }}>Condiciones</p>
            <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(221,214,254,0.65)' }}>
              {promo.detail}
            </p>
          </div>
        </>
      )}

      {/* Barra inferior */}
      <div className="h-1.5 w-full mt-2 shrink-0"
        style={{ background: 'linear-gradient(90deg,#7c3aed,#ec4899,#7c3aed)' }} />
    </div>
  )
}

function FilterChip({ icon, label }: { icon: string; label: string }) {
  return (
    <span
      className="flex items-center gap-1 text-[11px] font-semibold px-3 py-1 rounded-full"
      style={{
        background: 'rgba(109,40,217,0.25)',
        border: '1px solid rgba(124,58,237,0.35)',
        color: '#ddd6fe',
      }}
    >
      <span>{icon}</span> {label}
    </span>
  )
}

// ── Print flyer ───────────────────────────────────────────────────────────────
function buildFlyerHtml(promo: Promotion, logoUrl: string | null, storeName: string | null): string {
  const isPercent  = promo.discount_type === 'percentage'
  const bigNumber  = isPercent ? `${promo.value}%` : `$${promo.value.toLocaleString('es-AR')}`
  const daysText   = promo.days_of_week === '1234567' ? 'Todos los días' : daysLabel(promo.days_of_week)
  const hasDates   = !!(promo.start_date || promo.end_date)

  const filterBadges = [
    promo.category_name  && `<span class="badge">📦 ${promo.category_name}</span>`,
    promo.age_group_name && `<span class="badge">👤 ${promo.age_group_name}</span>`,
    promo.season_name    && `<span class="badge">🌸 ${promo.season_name}</span>`,
    promo.gender_name    && `<span class="badge">✦ ${promo.gender_name}</span>`,
  ].filter(Boolean).join('')

  const logoHtml = logoUrl
    ? `<img src="${logoUrl}" alt="${storeName ?? ''}" class="logo" />`
    : `<div class="logo-placeholder"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2"><path d="M20.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.18 8.18 0 004.78 1.52V6.75a4.85 4.85 0 01-1.01-.06z"/></svg></div>`

  const condHtml = promo.detail
    ? `<div class="divider"></div>
       <div class="section">
         <p class="section-label">Condiciones</p>
         <p class="cond-text">${promo.detail}</p>
       </div>`
    : ''

  const datesHtml = hasDates
    ? `<div class="info-item">
         <p class="info-label">Período</p>
         <p class="info-value">${promo.start_date ? formatDate(promo.start_date) : '—'} al ${promo.end_date ? formatDate(promo.end_date) : '—'}</p>
       </div>`
    : ''

  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${promo.name || promo.summary || 'Promoción'}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,800;0,9..40,900&display=swap');
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    width:100vw; min-height:100vh;
    display:flex; align-items:center; justify-content:center;
    background:#1e1b4b;
    font-family:'DM Sans',ui-sans-serif,system-ui,sans-serif;
    -webkit-print-color-adjust:exact; print-color-adjust:exact;
  }
  @page { size:A5 portrait; margin:0; }
  @media print { body { background:#1e1b4b; } }

  .flyer {
    width:380px;
    background:linear-gradient(160deg,#0b0b14 0%,#110e2e 45%,#0b0b14 100%);
    color:#fff; position:relative; overflow:hidden;
  }
  .top-bar, .bot-bar {
    height:6px; width:100%;
    background:linear-gradient(90deg,#7c3aed,#ec4899,#7c3aed);
  }
  .glow1 {
    position:absolute; top:-60px; left:-60px; width:240px; height:240px;
    border-radius:50%; opacity:0.22;
    background:radial-gradient(circle,#7c3aed,transparent);
    pointer-events:none;
  }
  .glow2 {
    position:absolute; top:-30px; right:-30px; width:180px; height:180px;
    border-radius:50%; opacity:0.12;
    background:radial-gradient(circle,#ec4899,transparent);
    pointer-events:none;
  }
  .header { display:flex; flex-direction:column; align-items:center; padding:28px 24px 20px; gap:8px; position:relative; }
  .logo { height:52px; width:auto; object-fit:contain; }
  .logo-placeholder {
    width:52px; height:52px; border-radius:50%;
    background:linear-gradient(135deg,#7c3aed,#ec4899);
    display:flex; align-items:center; justify-content:center;
  }
  .store-name {
    font-size:10px; font-weight:700; letter-spacing:0.3em;
    text-transform:uppercase; color:#a78bfa;
  }

  .discount-box {
    margin:0 24px 20px; border-radius:16px; padding:1px; position:relative;
    background:linear-gradient(135deg,#7c3aed,#ec4899,#7c3aed);
  }
  .discount-inner {
    background:rgba(11,11,20,0.9); border-radius:15px;
    padding:24px 24px 20px; text-align:center;
  }
  .disc-eyebrow {
    font-size:9px; font-weight:700; letter-spacing:0.4em;
    text-transform:uppercase; color:#a78bfa; margin-bottom:8px;
  }
  .disc-number {
    font-size:80px; font-weight:900; line-height:1;
    background:linear-gradient(135deg,#fff 0%,#ddd6fe 50%,#f9a8d4 100%);
    -webkit-background-clip:text; -webkit-text-fill-color:transparent;
    background-clip:text; margin-bottom:4px;
  }
  .disc-off {
    font-size:22px; font-weight:700; letter-spacing:0.25em; color:#f472b6;
  }

  .promo-title { text-align:center; padding:0 24px 20px; position:relative; }
  .promo-name { font-size:17px; font-weight:700; margin-bottom:4px; }
  .promo-summary { font-size:13px; font-weight:600; color:#c4b5fd; }

  .badges { display:flex; flex-wrap:wrap; justify-content:center; gap:8px; padding:0 24px 20px; position:relative; }
  .badge {
    font-size:11px; font-weight:600; padding:4px 12px; border-radius:999px;
    background:rgba(109,40,217,0.25); border:1px solid rgba(124,58,237,0.35);
    color:#ddd6fe;
  }

  .divider { margin:0 24px 16px; height:1px; background:rgba(124,58,237,0.3); }
  .info-row { display:flex; justify-content:center; gap:32px; padding:0 24px 16px; position:relative; }
  .info-item { text-align:center; }
  .info-label { font-size:9px; font-weight:700; letter-spacing:0.3em; text-transform:uppercase; color:#8b5cf6; margin-bottom:2px; }
  .info-value { font-size:13px; font-weight:600; color:#c4b5fd; }

  .section { padding:0 24px 20px; position:relative; }
  .section-label { font-size:9px; font-weight:700; letter-spacing:0.3em; text-transform:uppercase; color:#8b5cf6; margin-bottom:6px; }
  .cond-text { font-size:10px; line-height:1.6; color:rgba(196,181,253,0.65); }
</style>
</head>
<body>
<div class="flyer">
  <div class="glow1"></div>
  <div class="glow2"></div>
  <div class="top-bar"></div>

  <div class="header">
    ${logoHtml}
    ${storeName ? `<p class="store-name">${storeName}</p>` : ''}
  </div>

  <div class="discount-box">
    <div class="discount-inner">
      <p class="disc-eyebrow">DESCUENTO ESPECIAL</p>
      <p class="disc-number">${bigNumber}</p>
      <p class="disc-off">OFF</p>
    </div>
  </div>

  ${(promo.name || promo.summary) ? `
  <div class="promo-title">
    ${promo.name ? `<p class="promo-name">${promo.name}</p>` : ''}
    ${promo.summary ? `<p class="promo-summary">${promo.summary}</p>` : ''}
  </div>` : ''}

  ${filterBadges ? `<div class="badges">${filterBadges}</div>` : ''}

  <div class="divider"></div>

  <div class="info-row">
    <div class="info-item">
      <p class="info-label">Válido</p>
      <p class="info-value">${daysText}</p>
    </div>
    ${datesHtml}
  </div>

  ${condHtml}

  <div class="bot-bar"></div>
</div>
<script>window.onload = function() { window.print() }</script>
</body>
</html>`
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function PromotionsPanel() {
  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [stats, setStats]           = useState<Stats | null>(null)
  const [loading, setLoading]       = useState(true)
  const [statsLoading, setStatsLoading] = useState(true)

  // Lookups
  const [categories, setCategories] = useState<LookupItem[]>([])
  const [ageGroups,  setAgeGroups]  = useState<LookupItem[]>([])
  const [seasons,    setSeasons]    = useState<LookupItem[]>([])
  const [genders,    setGenders]    = useState<LookupItem[]>([])

  // Dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing]       = useState<Promotion | null>(null)
  const [form, setForm]             = useState<FormState>({ ...EMPTY_FORM })
  const [saving, setSaving]         = useState(false)

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<Promotion | null>(null)

  // Flyer
  const [flyerPromo,   setFlyerPromo  ] = useState<Promotion | null>(null)
  const [businessLogo, setBusinessLogo] = useState<string | null>(null)
  const [businessName, setBusinessName] = useState<string | null>(null)

  // ── Fetch ────────────────────────────────────────────────────────────────
  const loadPromotions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/promotions')
      if (!res.ok) throw new Error(await res.text())
      setPromotions(await res.json())
    } catch (e) { toast.error(`Error: ${e}`) }
    finally { setLoading(false) }
  }, [])

  const loadStats = useCallback(async () => {
    setStatsLoading(true)
    try {
      const res = await fetch('/api/roulette/stats')
      if (res.ok) setStats(await res.json())
    } finally { setStatsLoading(false) }
  }, [])

  const loadLookups = useCallback(async () => {
    const [cat, age, sea, gen] = await Promise.all([
      fetch('/api/categories').then(r => r.json()),
      fetch('/api/age-groups').then(r => r.json()),
      fetch('/api/seasons').then(r => r.json()),
      fetch('/api/genders').then(r => r.json()),
    ])
    setCategories(cat); setAgeGroups(age); setSeasons(sea); setGenders(gen)
  }, [])

  useEffect(() => {
    loadPromotions()
    loadStats()
    loadLookups()
    // Cargar logo y nombre del negocio para el flyer
    fetch('/api/settings')
      .then(r => r.ok ? r.json() : {})
      .then(d => {
        if (d.business_logo) setBusinessLogo(d.business_logo)
        if (d.business_name) setBusinessName(d.business_name)
      })
      .catch(() => {})
  }, [loadPromotions, loadStats, loadLookups])

  // ── Toggle active ────────────────────────────────────────────────────────
  async function toggleActive(p: Promotion) {
    const res = await fetch(`/api/promotions/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !p.active }),
    })
    if (res.ok) {
      setPromotions(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))
    } else {
      toast.error('Error al actualizar')
    }
  }

  // ── Form helpers ─────────────────────────────────────────────────────────
  function sf(field: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM })
    setDialogOpen(true)
  }

  function openEdit(p: Promotion) {
    setEditing(p)
    setForm({
      name:                 p.name ?? '',
      summary:              p.summary ?? '',
      detail:               p.detail ?? '',
      discount_type:        p.discount_type,
      value:                String(p.value),
      days_of_week:         p.days_of_week,
      category_id:          p.category_id ? String(p.category_id) : '',
      age_group_id:         p.age_group_id ? String(p.age_group_id) : '',
      season_id:            p.season_id ? String(p.season_id) : '',
      gender_id:            p.gender_id ? String(p.gender_id) : '',
      start_date:           p.start_date ? p.start_date.slice(0, 10) : '',
      end_date:             p.end_date   ? p.end_date.slice(0, 10)   : '',
      roulette_weight:      String(p.roulette_weight),
      roulette_daily_limit: p.roulette_daily_limit ? String(p.roulette_daily_limit) : '',
      roulette_only:        p.roulette_only,
      estimated_savings:    p.estimated_savings ? String(p.estimated_savings) : '',
      active:               p.active,
    })
    setDialogOpen(true)
  }

  async function handleSave() {
    if (!form.value || isNaN(parseFloat(form.value))) {
      toast.error('Valor del descuento requerido'); return
    }
    if (!form.days_of_week) {
      toast.error('Seleccioná al menos un día'); return
    }
    setSaving(true)
    try {
      const payload = {
        name:                 form.name    || null,
        summary:              form.summary || null,
        detail:               form.detail  || null,
        discount_type:        form.discount_type,
        value:                parseFloat(form.value),
        days_of_week:         form.days_of_week,
        category_id:          form.category_id  ? parseInt(form.category_id)  : null,
        age_group_id:         form.age_group_id ? parseInt(form.age_group_id) : null,
        season_id:            form.season_id    ? parseInt(form.season_id)    : null,
        gender_id:            form.gender_id    ? parseInt(form.gender_id)    : null,
        start_date:           form.start_date   || null,
        end_date:             form.end_date     || null,
        roulette_weight:      parseInt(form.roulette_weight) || 10,
        roulette_daily_limit: form.roulette_daily_limit ? parseInt(form.roulette_daily_limit) : null,
        roulette_only:        form.roulette_only,
        estimated_savings:    form.estimated_savings ? parseFloat(form.estimated_savings) : 0,
        active:               form.active,
      }

      const url    = editing ? `/api/promotions/${editing.id}` : '/api/promotions'
      const method = editing ? 'PATCH' : 'POST'
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al guardar'); return }

      toast.success(editing ? 'Promoción actualizada' : 'Promoción creada')
      setDialogOpen(false)
      loadPromotions()
      loadStats()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const res = await fetch(`/api/promotions/${deleteTarget.id}`, { method: 'DELETE' })
    const d   = await res.json()
    if (res.ok) {
      toast.success('Promoción eliminada')
      setDeleteTarget(null)
      loadPromotions()
      loadStats()
    } else {
      toast.error(d.error ?? 'Error al eliminar')
    }
  }

  // ── Print flyer ───────────────────────────────────────────────────────────
  async function handlePrintFlyer(p: Promotion) {
    // Asegurarse de que el logo sea un data-URL autocontenido
    let logoDataUrl: string | null = null
    if (businessLogo) {
      if (businessLogo.startsWith('data:')) {
        // Ya es base64 (guardado así en la DB) → usar directamente
        logoDataUrl = businessLogo
      } else {
        // Es una URL o path → fetch y convertir
        try {
          const src  = businessLogo.startsWith('http')
            ? businessLogo
            : `${window.location.origin}${businessLogo}`
          const res  = await fetch(src)
          const blob = await res.blob()
          logoDataUrl = await new Promise<string>(resolve => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result as string)
            reader.readAsDataURL(blob)
          })
        } catch { /* sin logo — no es crítico */ }
      }
    }
    const html = buildFlyerHtml(p, logoDataUrl, businessName)
    const win  = window.open('', '_blank', 'width=480,height=720,left=200,top=100')
    if (!win) { toast.error('Popup bloqueado — habilitá las ventanas emergentes'); return }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <div className="flex items-center gap-2">
        <Tag className="h-5 w-5 text-violet-600" />
        <h1 className="text-xl font-bold text-gray-800">Promociones</h1>
      </div>

      <Tabs defaultValue="promos">
        <TabsList>
          <TabsTrigger value="promos" className="flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5" />Promociones
          </TabsTrigger>
          <TabsTrigger value="kpis" className="flex items-center gap-1.5">
            <BarChart3 className="h-3.5 w-3.5" />KPIs Ruleta
          </TabsTrigger>
        </TabsList>

        {/* ── Pestaña ABM ─────────────────────────────────────────────────── */}
        <TabsContent value="promos" className="space-y-3 mt-4">
          <div className="flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {promotions.filter(p => p.active).length} activas ·{' '}
              {promotions.filter(p => !p.active).length} inactivas
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={loadPromotions} disabled={loading}>
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-3.5 w-3.5 mr-1" />Nueva promo
              </Button>
            </div>
          </div>

          <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Nombre / Resumen</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Descuento</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Días</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Vigencia</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-600">Filtros</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600">Peso</th>
                  <th className="text-center px-3 py-2.5 font-medium text-gray-600">Activa</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                  </td></tr>
                )}
                {!loading && promotions.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-gray-400">
                    No hay promociones
                  </td></tr>
                )}
                {promotions.map(p => (
                  <tr key={p.id} className={`hover:bg-gray-50 transition-colors ${!p.active ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p.name || '—'}</p>
                      {p.summary && <p className="text-xs text-gray-500">{p.summary}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className={
                        p.discount_type === 'percentage'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-green-100 text-green-700'
                      }>
                        {p.discount_type === 'percentage'
                          ? <Percent className="h-2.5 w-2.5 mr-1" />
                          : <DollarSign className="h-2.5 w-2.5 mr-1" />}
                        {discountLabel(p)}
                      </Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">{daysLabel(p.days_of_week)}</td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      {p.start_date || p.end_date
                        ? `${formatDate(p.start_date)} → ${formatDate(p.end_date)}`
                        : 'Sin límite'}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {p.category_name  && <Badge variant="outline" className="text-[10px]">{p.category_name}</Badge>}
                        {p.age_group_name && <Badge variant="outline" className="text-[10px]">{p.age_group_name}</Badge>}
                        {p.season_name    && <Badge variant="outline" className="text-[10px]">{p.season_name}</Badge>}
                        {p.gender_name    && <Badge variant="outline" className="text-[10px]">{p.gender_name}</Badge>}
                        {!p.category_id && !p.age_group_id && !p.season_id && !p.gender_id && (
                          <span className="text-[10px] text-gray-400">Todos los productos</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs font-mono bg-gray-100 px-1.5 py-0.5 rounded">
                          {p.roulette_weight}
                        </span>
                        {p.roulette_only && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 whitespace-nowrap">
                            🎡 Solo Ruleta
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Switch checked={p.active} onCheckedChange={() => toggleActive(p)} />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-violet-400 hover:text-violet-700 hover:bg-violet-50"
                          title="Ver flyer"
                          onClick={() => setFlyerPromo(p)}
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(p)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-red-400 hover:text-red-600 hover:bg-red-50"
                          onClick={() => setDeleteTarget(p)}
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
        </TabsContent>

        {/* ── Pestaña KPIs ────────────────────────────────────────────────── */}
        <TabsContent value="kpis" className="mt-4">
          <div className="flex justify-end mb-3">
            <Button size="sm" variant="outline" onClick={loadStats} disabled={statsLoading}>
              <RefreshCw className={`h-3.5 w-3.5 ${statsLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {statsLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
            </div>
          ) : stats ? (
            <div className="space-y-6">
              {/* Row 1 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Promos activas"   value={stats.active_promotions}   color="violet" />
                <KpiCard label="Promos inactivas" value={stats.inactive_promotions} color="amber" />
                <KpiCard label="Clientes totales"   value={stats.total_customers}    color="blue" />
                <KpiCard label="Clientes verificados" value={stats.verified_customers} color="green" />
              </div>
              {/* Row 2 */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard label="Giros este mes"    value={stats.spins_this_month}   color="violet"
                         sub={`${stats.spins_today} hoy`} />
                <KpiCard label="Premios este mes"  value={stats.prizes_this_month}  color="green" />
                <KpiCard label="Tasa de acierto"   value={`${stats.win_rate}%`}     color="blue" />
                <KpiCard label="Códigos generados" value={stats.total_codes}        color="amber"
                         sub={`${stats.used_codes} usados`} />
              </div>
              {/* Top promo */}
              {stats.top_promotion && (
                <div className="bg-gradient-to-r from-violet-600 to-violet-800 rounded-xl p-5 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="h-5 w-5 text-yellow-300" />
                    <p className="font-semibold text-sm">Promo más ganada este mes</p>
                  </div>
                  <p className="text-2xl font-bold">{stats.top_promotion.name || stats.top_promotion.summary}</p>
                  <p className="text-violet-200 text-sm mt-1">
                    {stats.top_promotion.wins} {stats.top_promotion.wins === 1 ? 'vez ganada' : 'veces ganada'}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-12">Sin datos disponibles</p>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Create / Edit Dialog ─────────────────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar promoción' : 'Nueva promoción'}</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-2">
            {/* Nombre */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Nombre (título pegadizo)</Label>
              <Input placeholder="Ej: Super Promo Invierno" value={form.name} onChange={sf('name')} />
            </div>

            {/* Resumen */}
            <div className="space-y-1.5">
              <Label>Resumen <span className="text-red-500">*</span></Label>
              <Input placeholder="Ej: BUZOS 10% OFF" value={form.summary} onChange={sf('summary')} />
              <p className="text-[11px] text-gray-400">Se muestra en la ruleta</p>
            </div>

            {/* Tipo + Valor */}
            <div className="space-y-1.5">
              <Label>Descuento <span className="text-red-500">*</span></Label>
              <div className="flex gap-2">
                <Select value={form.discount_type} onValueChange={v => setForm(f => ({ ...f, discount_type: v }))}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">% Porcentaje</SelectItem>
                    <SelectItem value="fixed_amount">$ Monto fijo</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number" min="0" placeholder="Valor"
                  value={form.value} onChange={sf('value')}
                  className="flex-1"
                />
              </div>
            </div>

            {/* Días */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Días de la semana activos</Label>
              <DaySelector
                value={form.days_of_week}
                onChange={v => setForm(f => ({ ...f, days_of_week: v }))}
              />
              <p className="text-[11px] text-gray-400">
                Se usa para auto-aplicar en ventas. La ruleta ignora el día de la semana.
              </p>
            </div>

            {/* Detalle */}
            <div className="sm:col-span-2 space-y-1.5">
              <Label>Detalle / Letra chica</Label>
              <Textarea
                placeholder="Condiciones, exclusiones, etc."
                value={form.detail} onChange={sf('detail')}
                rows={2}
              />
            </div>

            {/* Filtros de productos */}
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={form.category_id || '__all'} onValueChange={v => setForm(f => ({ ...f, category_id: v === '__all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas las categorías</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Grupo de edad</Label>
              <Select value={form.age_group_id || '__all'} onValueChange={v => setForm(f => ({ ...f, age_group_id: v === '__all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos</SelectItem>
                  {ageGroups.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Temporada</Label>
              <Select value={form.season_id || '__all'} onValueChange={v => setForm(f => ({ ...f, season_id: v === '__all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todas</SelectItem>
                  {seasons.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Género</Label>
              <Select value={form.gender_id || '__all'} onValueChange={v => setForm(f => ({ ...f, gender_id: v === '__all' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Todos</SelectItem>
                  {genders.map(g => <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Vigencia */}
            <div className="space-y-1.5">
              <Label>Fecha inicio</Label>
              <Input type="date" value={form.start_date} onChange={sf('start_date')} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha fin</Label>
              <Input type="date" value={form.end_date} onChange={sf('end_date')} />
            </div>

            {/* Ruleta */}
            <div className="space-y-1.5">
              <Label>Peso en ruleta (1–100)</Label>
              <Input
                type="number" min="1" max="100"
                placeholder="10"
                value={form.roulette_weight}
                onChange={sf('roulette_weight')}
              />
              <p className="text-[11px] text-gray-400">Menor = más difícil de ganar</p>
            </div>
            <div className="space-y-1.5">
              <Label>Límite de premios por día</Label>
              <Input
                type="number" min="1"
                placeholder="Sin límite"
                value={form.roulette_daily_limit}
                onChange={sf('roulette_daily_limit')}
              />
            </div>

            {/* Ahorro estimado */}
            <div className="space-y-1.5">
              <Label>Ahorro estimado por compra ($)</Label>
              <Input
                type="number" min="0"
                placeholder="0"
                value={form.estimated_savings}
                onChange={sf('estimated_savings')}
              />
            </div>

            {/* Solo Ruleta */}
            <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
              <Switch
                checked={form.roulette_only}
                onCheckedChange={v => setForm(f => ({ ...f, roulette_only: v }))}
                className="mt-0.5 data-[state=checked]:bg-amber-500"
              />
              <div>
                <Label className="cursor-pointer font-semibold text-amber-900">🎡 Solo para RULETA</Label>
                <p className="text-[11px] text-amber-700 mt-0.5">
                  Esta promo aparece únicamente en la ruleta. No se auto-aplica en el POS ni se muestra en la Tienda.
                </p>
              </div>
            </div>

            {/* Activa */}
            <div className="flex items-center gap-3 pt-2">
              <Switch
                checked={form.active}
                onCheckedChange={v => setForm(f => ({ ...f, active: v }))}
              />
              <Label className="cursor-pointer">Promoción activa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear promoción'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Flyer Dialog ───────────────────────────────────────────────────── */}
      <Dialog open={!!flyerPromo} onOpenChange={o => !o && setFlyerPromo(null)}>
        <DialogContent className="p-0 bg-[#0b0b14] border-violet-800/50 max-w-[400px] gap-0">
          {/* Title oculto para accesibilidad (screen readers) */}
          <DialogTitle className="sr-only">
            {flyerPromo ? (flyerPromo.name || flyerPromo.summary || 'Flyer de promoción') : 'Flyer de promoción'}
          </DialogTitle>

          {/* Contenedor flex — independiente del grid interno de shadcn */}
          <div className="flex flex-col" style={{ maxHeight: '90vh' }}>

            {/* Toolbar — no scrollea */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-violet-900/50">
              <span className="text-sm font-semibold text-violet-300">Vista previa del flyer</span>
              {flyerPromo && (
                <Button
                  size="sm"
                  onClick={() => handlePrintFlyer(flyerPromo)}
                  className="h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Imprimir / PDF
                </Button>
              )}
            </div>

            {/* Flyer — scrollea si no entra */}
            <div className="overflow-y-auto" style={{ flex: '1 1 auto', minHeight: 0 }}>
              {flyerPromo && (
                <PromoFlyer
                  promo={flyerPromo}
                  logoUrl={businessLogo}
                  storeName={businessName}
                />
              )}
            </div>

            {/* Tip — no scrollea */}
            <div className="shrink-0 px-4 py-2.5 border-t border-violet-900/50 text-center">
              <p className="text-[10px] text-violet-500">
                Tip: elegí <strong className="text-violet-400">"Guardar como PDF"</strong> en la ventana de impresión para compartir en redes
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={o => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar promoción?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deleteTarget?.name || deleteTarget?.summary}</strong>.
              Si tiene historial en la ruleta, no se podrá eliminar (desactivala en su lugar).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
