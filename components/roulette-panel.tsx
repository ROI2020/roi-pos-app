"use client"

import React, {
  useState, useEffect, useRef, useCallback,
} from "react"
import {
  Search, Plus, ShieldCheck, Loader2, Gift,
  PartyPopper, Frown, QrCode, RotateCcw, Phone, FlaskConical,
} from "lucide-react"
import { toast }    from "sonner"
import { getSession } from "@/lib/session"
import { Button }   from "@/components/ui/button"
import { Input }    from "@/components/ui/input"
import { Label }    from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge }    from "@/components/ui/badge"
import QRCode       from "qrcode"
import { TermsDialog } from "@/components/terms-dialog"

// ── Types ─────────────────────────────────────────────────────────────────────
interface Customer {
  id:                  number
  name:                string
  phone:               string
  verified:            boolean
  consent_policies:    boolean
  last_roulette_month: string | null
}

interface RouletteSegment {
  type:         'prize' | 'no_prize'
  promotion_id: number | null
  label:        string
  summary:      string
  discount_type: string | null
  value:        number | null
  weight:       number
}

interface SpinResult {
  result:          'prize' | 'no_prize'
  winning_index:   number
  segments:        RouletteSegment[]
  discount_code:   string | null
  discount_expiry: string | null   // ISO date — 30 días desde el giro
  promotion: {
    name:           string
    discount_type:  string
    value:          number
    detail:         string | null
    category_name:  string | null
    age_group_name: string | null
    season_name:    string | null
    gender_name:    string | null
  } | null
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normaliza un teléfono al formato WA argentino: 549 + área + local (13 dígitos).
 * Maneja los formatos más comunes:
 *   5491131005865  → 5491131005865   (ya completo)
 *   54 9 11 3100 5865 → 5491131005865  (espacios/+)
 *   01131005865    → 5491131005865   (con 0 inicial)
 *   1131005865     → 5491131005865   (área + local, 10 dígitos)
 *   541131005865   → 5491131005865   (fijo → agregar 9)
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

  // Cualquier otro caso (incompleto): retornar solo dígitos
  return d
}

/** Devuelve true cuando el número normalizado parece completo. */
function isPhoneComplete(normalized: string): boolean {
  return normalized.startsWith('549') && normalized.length === 13
}

// ── Colores de segmentos ───────────────────────────────────────────────────────
const SEG_COLORS = [
  '#7C3AED', '#DB2777', '#D97706', '#059669',
  '#2563EB', '#DC2626', '#0D9488', '#EA580C',
  '#7E22CE', '#BE185D',
]
const NO_PRIZE_COLOR = '#94A3B8'

// ── Canvas wheel drawing ───────────────────────────────────────────────────────
function drawWheel(
  canvas: HTMLCanvasElement,
  segments: RouletteSegment[],
  rotation: number,
  logoImg?: HTMLImageElement | null,
) {
  const ctx    = canvas.getContext('2d')!
  const W      = canvas.width
  const H      = canvas.height
  const cx     = W / 2
  const cy     = H / 2
  const radius = cx - 6

  ctx.clearRect(0, 0, W, H)

  // Outer ring — dorado
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.35)'
  ctx.shadowBlur  = 20
  ctx.beginPath()
  ctx.arc(cx, cy, radius + 4, 0, 2 * Math.PI)
  const ringGrad = ctx.createLinearGradient(cx - radius, cy - radius, cx + radius, cy + radius)
  ringGrad.addColorStop(0,   '#f5c842')
  ringGrad.addColorStop(0.5, '#fde68a')
  ringGrad.addColorStop(1,   '#d97706')
  ctx.fillStyle = ringGrad
  ctx.fill()
  ctx.restore()

  const totalWeight = segments.reduce((s, seg) => s + seg.weight, 0)
  let angle = rotation - Math.PI / 2 // start from top

  segments.forEach((seg, i) => {
    const arcSize = (seg.weight / totalWeight) * 2 * Math.PI

    // ── Sector ────────────────────────────────────────────────────────────
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, radius, angle, angle + arcSize)
    ctx.closePath()

    // Gradient fill
    const midAngle = angle + arcSize / 2
    const gx1 = cx + (radius * 0.3) * Math.cos(midAngle)
    const gy1 = cy + (radius * 0.3) * Math.sin(midAngle)
    const gx2 = cx + radius * Math.cos(midAngle)
    const gy2 = cy + radius * Math.sin(midAngle)
    const grad = ctx.createLinearGradient(gx1, gy1, gx2, gy2)
    const baseColor = seg.type === 'no_prize' ? NO_PRIZE_COLOR : SEG_COLORS[i % SEG_COLORS.length]
    grad.addColorStop(0, baseColor + 'DD')
    grad.addColorStop(1, baseColor)
    ctx.fillStyle = grad
    ctx.fill()

    // Divisiones en dorado
    ctx.strokeStyle = '#f5c842'
    ctx.lineWidth   = 2.5
    ctx.stroke()

    // ── Label ─────────────────────────────────────────────────────────────
    if (arcSize > 0.12) {
      ctx.save()
      ctx.translate(cx, cy)
      ctx.rotate(midAngle)

      // Shadow for legibility
      ctx.shadowColor = 'rgba(0,0,0,0.6)'
      ctx.shadowBlur  = 4

      ctx.fillStyle   = '#ffffff'
      ctx.textAlign   = 'right'
      ctx.textBaseline = 'middle'

      const maxLen = radius - 24
      const emoji  = seg.type === 'no_prize' ? '😔 ' : '🎁 '

      // Smaller font for tight segments
      const fontSize = arcSize > 0.4 ? 13 : arcSize > 0.2 ? 11 : 9
      ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`

      // Truncate if too long
      let text = emoji + seg.label
      while (ctx.measureText(text).width > maxLen && text.length > 4) {
        text = text.slice(0, -1)
      }
      if (text !== emoji + seg.label) text += '…'

      ctx.fillText(text, radius - 10, 0)
      ctx.restore()
    }

    angle += arcSize
  })

  // ── Center hub ─────────────────────────────────────────────────────────────
  const hubRadius = 36
  ctx.save()
  ctx.beginPath()
  ctx.arc(cx, cy, hubRadius, 0, 2 * Math.PI)
  const hubGrad = ctx.createRadialGradient(cx - 8, cy - 8, 2, cx, cy, hubRadius)
  hubGrad.addColorStop(0, '#fde68a')
  hubGrad.addColorStop(0.6, '#f5c842')
  hubGrad.addColorStop(1, '#b45309')
  ctx.fillStyle = hubGrad
  ctx.shadowColor = 'rgba(0,0,0,0.30)'
  ctx.shadowBlur  = 10
  ctx.fill()
  ctx.strokeStyle = '#92400e'
  ctx.lineWidth   = 2
  ctx.stroke()
  ctx.restore()

  // ── Logo dentro del hub ─────────────────────────────────────────────────────
  if (logoImg) {
    const innerR = hubRadius - 6   // deja margen del anillo
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, innerR, 0, 2 * Math.PI)
    ctx.clip()
    ctx.drawImage(logoImg, cx - innerR, cy - innerR, innerR * 2, innerR * 2)
    ctx.restore()
  }
}

// ── Easing ────────────────────────────────────────────────────────────────────
function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 4)
}

// ── Flow steps ────────────────────────────────────────────────────────────────
type Step =
  | 'search'       // buscar o registrar cliente
  | 'register'     // formulario de registro rápido
  | 'verify'       // pendiente de verificación
  | 'ready'        // cliente verificado y elegible
  | 'spinning'     // girando
  | 'result'       // resultado

// ── Component ─────────────────────────────────────────────────────────────────
export default function RoulettePanel() {
  // ── State ──────────────────────────────────────────────────────────────────
  const [step, setStep]             = useState<Step>('search')
  const [phone, setPhone]           = useState('')
  const [searching, setSearching]   = useState(false)
  const [customer, setCustomer]     = useState<Customer | null>(null)

  // Register form
  const [regName, setRegName]           = useState('')
  const [regPhone, setRegPhone]         = useState('')
  const [regPolicies, setRegPolicies]   = useState(false)
  const [regNews, setRegNews]           = useState(false)
  const [regImages, setRegImages]       = useState(false)
  const [registering, setRegistering]   = useState(false)

  // Verify
  const [verifyCode, setVerifyCode]   = useState('')
  const [waLink, setWaLink]           = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl]     = useState<string | null>(null)
  const [confirming, setConfirming]   = useState(false)
  const [generating, setGenerating]   = useState(false)

  // Wheel
  const canvasRef                   = useRef<HTMLCanvasElement>(null)
  const rotationRef                 = useRef(0)
  const rafRef                      = useRef<number>(0)
  const [segments, setSegments]     = useState<RouletteSegment[]>([])
  const [spinning, setSpinning]     = useState(false)
  const [spinResult, setSpinResult] = useState<SpinResult | null>(null)

  // Business logo + nombre (para hub de la ruleta, QR y términos)
  const [businessLogo, setBusinessLogo]   = useState<string | null>(null)
  const [businessName, setBusinessName]   = useState<string | null>(null)
  const logoImgRef                        = useRef<HTMLImageElement | null>(null)

  // Modal del cupón imprimible
  const [couponOpen, setCouponOpen] = useState(false)

  const currentMonth = new Date().toISOString().slice(0, 7)
  const isAdmin = getSession()?.role === 'administrador'

  // ── Cargar logo del negocio ────────────────────────────────────────────────
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((s: Record<string, string | null>) => {
        if (s.business_name) setBusinessName(s.business_name)
        const logo = s.business_logo
        if (!logo) return
        setBusinessLogo(logo)
        const img = new window.Image()
        img.onload = () => {
          logoImgRef.current = img
          // Redibujar la ruleta si ya hay segmentos cargados
          const canvas = canvasRef.current
          if (canvas && segments.length > 0) {
            drawWheel(canvas, segments, rotationRef.current, img)
          }
        }
        img.src = logo
      })
      .catch(() => { /* sin logo → usa hub blanco */ })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draw idle wheel ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || segments.length === 0) return
    drawWheel(canvas, segments, rotationRef.current, logoImgRef.current)
  }, [segments])

  // ── Load preview segments on mount ────────────────────────────────────────
  useEffect(() => {
    fetch('/api/promotions?active=true')
      .then(r => r.json())
      .then((promos: { id: number; summary: string | null; discount_type: string; value: number; roulette_weight: number }[]) => {
        const segs: RouletteSegment[] = [
          ...promos.map((p, i) => ({
            type:         'prize' as const,
            promotion_id: p.id,
            label:        p.summary || (p.discount_type === 'percentage' ? `${p.value}% OFF` : `$${p.value} OFF`),
            summary:      p.summary ?? '',
            discount_type: p.discount_type,
            value:        p.value,
            weight:       p.roulette_weight,
          })),
          { type: 'no_prize', promotion_id: null, label: '¡Mejor suerte!', summary: '', discount_type: null, value: null, weight: 15 },
          { type: 'no_prize', promotion_id: null, label: '¡Mejor suerte!', summary: '', discount_type: null, value: null, weight: 15 },
        ]
        setSegments(segs)
      })
      .catch(() => {})
  }, [])

  // ── Search customer ────────────────────────────────────────────────────────
  async function handleSearch() {
    if (!phone.trim()) { toast.error('Ingresá el teléfono'); return }
    const normPhone = normalizePhone(phone.trim()) || phone.trim()
    setSearching(true)
    try {
      const res  = await fetch(`/api/customers?q=${encodeURIComponent(normPhone)}&limit=5`)
      const data = await res.json() as Customer[]
      const found = data.find(c => c.phone === normPhone)

      if (found) {
        setCustomer(found)
        if (!found.verified) {
          setStep('verify')
          await generateVerifyCode(found.id)
        } else if (found.last_roulette_month === currentMonth) {
          toast.info(`${found.name} ya participó este mes 😊`)
          setStep('ready') // muestra el mensaje de "ya participó"
        } else {
          setStep('ready')
        }
      } else {
        // No encontrado → pre-cargar el teléfono en el formulario
        setRegPhone(phone.trim())
        setRegName('')
        setRegPolicies(false)
        setRegNews(false)
        setRegImages(false)
        setStep('register')
      }
    } finally {
      setSearching(false)
    }
  }

  // ── Register quick ────────────────────────────────────────────────────────
  async function handleRegister() {
    if (!regName.trim())  { toast.error('Nombre requerido'); return }
    if (!regPhone.trim()) { toast.error('Teléfono requerido'); return }
    if (!regPolicies)     { toast.error('El cliente debe aceptar las políticas'); return }

    const normPhone = normalizePhone(regPhone.trim()) || regPhone.trim()
    if (!isPhoneComplete(normPhone)) {
      toast.error('El teléfono parece incompleto. Incluí código de país y área (ej: 549 11 3100-5865)')
      return
    }

    setRegistering(true)
    try {
      const res  = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:             regName.trim(),
          phone:            normPhone,
          consent_policies: regPolicies,
          consent_news:     regNews,
          consent_images:   regImages,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error ?? 'Error al registrar'); return }
      setCustomer(data)
      setStep('verify')
      await generateVerifyCode(data.id)
    } finally {
      setRegistering(false)
    }
  }

  // ── Generate verification code + QR ───────────────────────────────────────
  async function generateVerifyCode(customerId: number) {
    setGenerating(true)
    try {
      const res  = await fetch(`/api/customers/${customerId}/code`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) return
      setVerifyCode(data.code)
      setWaLink(data.wa_link)
      if (data.wa_link) {
        const url = await QRCode.toDataURL(data.wa_link, {
          width:                220,
          margin:               2,
          errorCorrectionLevel: 'H',
          color: { dark: '#1e293b', light: '#ffffff' },
        })
        setQrDataUrl(url)
      }
    } finally {
      setGenerating(false)
    }
  }

  // ── Confirm verify ────────────────────────────────────────────────────────
  async function handleConfirmVerify() {
    if (!customer) return
    setConfirming(true)
    try {
      const res = await fetch(`/api/customers/${customer.id}/verify`, { method: 'POST' })
      if (res.ok) {
        setCustomer(c => c ? { ...c, verified: true } : c)
        toast.success('✅ Cliente verificado')
        setStep('ready')
      } else {
        toast.error('Error al verificar')
      }
    } finally {
      setConfirming(false)
    }
  }

  // ── Admin: reset mes para pruebas ─────────────────────────────────────────
  async function handleAdminReset() {
    if (!customer) return
    try {
      const res = await fetch(`/api/customers/${customer.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_roulette_month: null }),
      })
      if (res.ok) {
        setCustomer(c => c ? { ...c, last_roulette_month: null } : c)
        setSpinResult(null)
        setStep('ready')
        toast.success('Mes reseteado — el cliente puede girar de nuevo')
      } else {
        toast.error('Error al resetear')
      }
    } catch {
      toast.error('Error al resetear')
    }
  }

  // ── Spin ──────────────────────────────────────────────────────────────────
  async function handleSpin() {
    if (!customer) return
    setSpinning(true)
    setStep('spinning')

    try {
      const res  = await fetch('/api/roulette/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: customer.id }),
      })
      const data = await res.json() as SpinResult
      if (!res.ok) {
        toast.error((data as { error?: string }).error ?? 'Error al girar')
        setStep('ready')
        setSpinning(false)
        return
      }

      // Actualizar segmentos con los del server (puede haber filtrado por daily_limit)
      setSegments(data.segments)
      setSpinResult(data)

      // Animar la ruleta hasta el segmento ganador
      animateTo(data.winning_index, data.segments, () => {
        setSpinning(false)
        setStep('result')
      })
    } catch (e) {
      toast.error(`Error: ${e}`)
      setStep('ready')
      setSpinning(false)
    }
  }

  // ── Wheel animation ────────────────────────────────────────────────────────
  function animateTo(winIdx: number, segs: RouletteSegment[], onDone: () => void) {
    const canvas = canvasRef.current
    if (!canvas) { onDone(); return }

    const totalWeight = segs.reduce((s, seg) => s + seg.weight, 0)

    // Calcular ángulo del centro del segmento ganador (desde el inicio del wheel)
    let cumWeight = 0
    for (let i = 0; i < winIdx; i++) cumWeight += segs[i].weight
    const segWeight   = segs[winIdx].weight
    const centerFrac  = (cumWeight + segWeight / 2) / totalWeight
    const centerAngle = centerFrac * 2 * Math.PI

    // Para que ese segmento quede arriba (bajo el pointer):
    // rotation + centerAngle = 0 (mod 2π)  →  rotation = -centerAngle
    // Queremos rotación positiva con N=5 vueltas adicionales
    const current   = rotationRef.current
    const needed    = (2 * Math.PI - (centerAngle + current % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
    const target    = current + 5 * 2 * Math.PI + needed

    const DURATION  = 4500
    const startTime = performance.now()
    const startRot  = current

    function frame(now: number) {
      const t      = Math.min((now - startTime) / DURATION, 1)
      const eased  = easeOut(t)
      const rot    = startRot + (target - startRot) * eased
      rotationRef.current = rot
      drawWheel(canvas!, segs, rot, logoImgRef.current)

      if (t < 1) {
        rafRef.current = requestAnimationFrame(frame)
      } else {
        rotationRef.current = rot
        onDone()
      }
    }
    rafRef.current = requestAnimationFrame(frame)
  }

  // ── Reset ─────────────────────────────────────────────────────────────────
  function reset() {
    setStep('search')
    setPhone('')
    setCustomer(null)
    setSpinResult(null)
    setVerifyCode('')
    setWaLink(null)
    setQrDataUrl(null)
    setRegName('')
    setRegPhone('')
    setRegPolicies(false)
    setRegNews(false)
    setRegImages(false)
    cancelAnimationFrame(rafRef.current)
  }

  // ── Imprimir cupón en ventana nueva ───────────────────────────────────────
  function printCoupon() {
    if (!spinResult?.discount_code) return
    const promo    = spinResult.promotion
    const discLabel = promo
      ? (promo.discount_type === 'percentage'
          ? `${promo.value}% OFF`
          : `$${promo.value.toLocaleString('es-AR')} OFF`)
      : ''
    const expiryStr = spinResult.discount_expiry
      ? new Date(spinResult.discount_expiry).toLocaleDateString('es-AR', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : null
    const logoTag = businessLogo
      ? `<img src="${businessLogo}" alt="logo" style="width:64px;height:64px;object-fit:contain;margin:0 auto 8px;display:block;">`
      : ''

    // Filtros que aplican al cupón
    const filters = [
      promo?.category_name  && `Categoría: ${promo.category_name}`,
      promo?.age_group_name && `Edad: ${promo.age_group_name}`,
      promo?.season_name    && `Temporada: ${promo.season_name}`,
      promo?.gender_name    && `Género: ${promo.gender_name}`,
    ].filter(Boolean) as string[]

    const filtersHtml = filters.length
      ? `<div class="filters"><div class="lbl">Aplica a</div>${
          filters.map(f => `<span class="badge">${f}</span>`).join(' ')
        }</div>`
      : '<div class="filters-all">Válido para todos los productos del local</div>'

    const detailHtml = promo?.detail
      ? `<div class="detail"><div class="lbl">Condiciones</div><p>${promo.detail}</p></div>`
      : ''

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Cupón · ${spinResult.discount_code}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:Arial,Helvetica,sans-serif;background:#fff;display:flex;
         align-items:flex-start;justify-content:center;padding:24px}
    .coupon{width:320px;border:2.5px dashed #7c3aed;border-radius:16px;
            padding:28px 24px;text-align:center}
    .emoji{font-size:44px;margin-bottom:6px}
    .won{font-size:20px;font-weight:900;color:#1e293b;margin-bottom:4px}
    .discount{font-size:30px;font-weight:900;color:#7c3aed;margin-bottom:2px}
    .promo-name{font-size:14px;font-weight:700;color:#1e293b;margin-bottom:2px}
    .promo-sub{font-size:12px;color:#64748b;margin-bottom:16px}
    hr{border:none;border-top:1.5px dashed #e2e8f0;margin:14px 0}
    .lbl{font-size:9px;font-weight:700;text-transform:uppercase;
         letter-spacing:.12em;color:#94a3b8;margin-bottom:6px}
    .code{font-family:'Courier New',monospace;font-size:28px;font-weight:900;
          letter-spacing:.22em;background:#f5f3ff;color:#1e293b;
          padding:10px 16px;border-radius:8px;margin-bottom:12px;display:inline-block}
    .expiry{font-size:13px;font-weight:700;color:#7c3aed;margin-bottom:4px}
    .fine{font-size:11px;color:#94a3b8;margin-bottom:12px}
    .filters{margin-top:2px;margin-bottom:8px}
    .filters-all{font-size:11px;color:#64748b;margin-bottom:8px;font-style:italic}
    .badge{display:inline-block;background:#f5f3ff;color:#7c3aed;
           font-size:10px;font-weight:700;padding:2px 7px;border-radius:99px;
           margin:2px;border:1px solid #ddd6fe}
    .detail{text-align:left;background:#fafafa;border-radius:8px;
            padding:10px 12px;margin-top:4px}
    .detail p{font-size:11px;color:#475569;line-height:1.5}
    @media print{body{padding:0}}
  </style>
</head>
<body>
  <div class="coupon">
    ${logoTag}
    <div class="emoji">🎉</div>
    <div class="won">¡Ganaste!</div>
    <div class="discount">${discLabel}</div>
    ${promo?.name ? `<div class="promo-name">${promo.name}</div>` : ''}
    <hr>
    <div class="lbl">Código de descuento</div>
    <div class="code">${spinResult.discount_code}</div>
    ${expiryStr ? `<div class="expiry">📅 Válido hasta el ${expiryStr}</div>` : ''}
    <div class="fine">Un solo uso · Presentar al momento de pagar</div>
    <hr>
    ${filtersHtml}
    ${detailHtml}
  </div>
  <script>window.addEventListener('load', () => window.print())<\/script>
</body>
</html>`

    const w = window.open('', '_blank', 'width=420,height=640,menubar=no,toolbar=no')
    if (!w) { toast.error('Habilitá las ventanas emergentes para imprimir'); return }
    w.document.write(html)
    w.document.close()
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const alreadyPlayed = customer?.last_roulette_month === currentMonth

  // Previsualización del teléfono al registrar
  const regPhoneNorm    = normalizePhone(regPhone.trim())
  const regPhoneOk      = isPhoneComplete(regPhoneNorm)
  const regPhoneDirty   = regPhone.trim() !== ''

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0b0b14] via-[#0f0f1a] to-[#0b0b14] p-4 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* Title */}
        <div className="text-center mb-4 md:mb-6">
          <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight drop-shadow-lg">
            🎡 Ruleta de Promociones
          </h1>
          <p className="text-violet-300 text-sm mt-1">
            ¡Girá y ganá un descuento especial!
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start justify-center">

          {/* ── Left panel: customer flow ─────────────────────────────────── */}
          <div className="w-full lg:w-80 shrink-0">
            <div className="bg-white/8 backdrop-blur-sm border border-white/15 rounded-2xl p-5 space-y-4">

              {/* STEP: search */}
              {step === 'search' && (
                <div className="space-y-3">
                  <p className="text-white font-semibold text-sm">📱 Teléfono del cliente</p>
                  <Input
                    placeholder="Ej: 5493516123456"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/50 focus:bg-white/30"
                  />
                  <Button
                    onClick={handleSearch}
                    disabled={searching}
                    className="w-full bg-white text-violet-800 hover:bg-violet-50 font-bold"
                  >
                    {searching
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Buscando…</>
                      : <><Search className="h-4 w-4 mr-2" />Buscar cliente</>}
                  </Button>
                  <p className="text-violet-300 text-xs text-center">
                    Si no existe, lo registramos en el momento
                  </p>
                </div>
              )}

              {/* STEP: register */}
              {step === 'register' && (
                <div className="space-y-3">
                  <p className="text-white font-semibold text-sm">✍️ Registrar cliente nuevo</p>
                  <Input
                    placeholder="Nombre completo"
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/50"
                  />

                  {/* Phone con onBlur + aviso */}
                  <div className="space-y-1">
                    <Input
                      placeholder="Ej: 011 3100-5865  ó  +54 9 11…"
                      value={regPhone}
                      onChange={e => setRegPhone(e.target.value)}
                      onBlur={() => {
                        const n = normalizePhone(regPhone.trim())
                        if (n && n !== regPhone.trim()) setRegPhone(n)
                      }}
                      className="bg-white/20 border-white/30 text-white placeholder:text-white/50"
                    />
                    {regPhoneDirty && (
                      regPhoneOk
                        ? <p className="text-green-400 text-[11px]">✓ {regPhoneNorm}</p>
                        : <p className="text-amber-300 text-[11px]">
                            ⚠️ Incluí código de área (ej: 11 para CABA, 351 para Córdoba)
                          </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={regPolicies}
                        onCheckedChange={v => setRegPolicies(!!v)}
                        className="mt-0.5 border-white/50 data-[state=checked]:bg-violet-400"
                      />
                      <span className="text-white/90 text-xs leading-snug">
                        ✅ Acepta las{' '}
                        <TermsDialog
                          businessName={businessName}
                          trigger={
                            <button
                              type="button"
                              onClick={e => e.stopPropagation()}
                              className="font-bold underline underline-offset-2 hover:text-white transition-colors"
                            >
                              políticas y términos
                            </button>
                          }
                        />
                        {' '}(requerido)
                      </span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={regNews}
                        onCheckedChange={v => setRegNews(!!v)}
                        className="mt-0.5 border-white/50 data-[state=checked]:bg-violet-400"
                      />
                      <span className="text-white/80 text-xs">Recibir novedades y promos</span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={regImages}
                        onCheckedChange={v => setRegImages(!!v)}
                        className="mt-0.5 border-white/50 data-[state=checked]:bg-violet-400"
                      />
                      <span className="text-white/80 text-xs">Permitir subir fotos a redes</span>
                    </label>
                  </div>
                  <Button
                    onClick={handleRegister}
                    disabled={registering}
                    className="w-full bg-white text-violet-800 hover:bg-violet-50 font-bold"
                  >
                    {registering
                      ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registrando…</>
                      : <><Plus className="h-4 w-4 mr-2" />Registrar y continuar</>}
                  </Button>
                  <button onClick={reset} className="text-xs text-violet-300 underline w-full text-center">
                    ← Volver
                  </button>
                </div>
              )}

              {/* STEP: verify */}
              {step === 'verify' && (
                <div className="space-y-4">
                  <div>
                    <p className="text-white font-semibold text-sm">
                      📲 Verificar teléfono
                    </p>
                    <p className="text-violet-300 text-xs mt-0.5">
                      {customer?.name} · {customer?.phone}
                    </p>
                  </div>

                  {generating ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-8 w-8 animate-spin text-white/60" />
                    </div>
                  ) : (
                    <>
                      {/* Código grande */}
                      <div className="text-center">
                        <p className="text-violet-300 text-xs mb-1">Código a enviar</p>
                        <div className="text-3xl sm:text-4xl font-mono font-black tracking-[0.2em] sm:tracking-[0.3em] text-white bg-white/20 rounded-xl py-3">
                          {verifyCode}
                        </div>
                      </div>

                      {/* QR */}
                      {qrDataUrl ? (
                        <div className="flex flex-col items-center gap-2">
                          <p className="text-violet-300 text-xs text-center">
                            El cliente escanea → WhatsApp → envía el mensaje
                          </p>
                          <div className="relative inline-block">
                            <img src={qrDataUrl} alt="QR" className="w-44 h-44 rounded-xl" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="bg-white rounded-full p-1.5 w-11 h-11 flex items-center justify-center shadow-lg">
                                <img
                                  src={businessLogo || '/icon.svg'}
                                  alt="logo"
                                  className="w-7 h-7 object-contain"
                                />
                              </div>
                            </div>
                          </div>
                          {waLink && (
                            <a href={waLink} target="_blank" rel="noopener noreferrer"
                               className="text-xs text-violet-300 underline">
                              Abrir link de WhatsApp
                            </a>
                          )}
                        </div>
                      ) : (
                        <div className="bg-white/10 rounded-xl p-3 text-sm text-white/80 text-center">
                          El cliente debe enviar el código al WhatsApp del local.
                        </div>
                      )}

                      <Button
                        onClick={handleConfirmVerify}
                        disabled={confirming}
                        className="w-full bg-green-500 hover:bg-green-400 text-white font-bold"
                      >
                        <ShieldCheck className="h-4 w-4 mr-2" />
                        {confirming ? 'Verificando…' : '✓ Recibí el mensaje — Verificar'}
                      </Button>
                      <button
                        onClick={() => customer && generateVerifyCode(customer.id)}
                        className="text-xs text-violet-300 underline w-full text-center"
                        disabled={generating}
                      >
                        Regenerar código
                      </button>
                    </>
                  )}
                  <button onClick={reset} className="text-xs text-violet-300 underline w-full text-center">
                    ← Cancelar
                  </button>
                </div>
              )}

              {/* STEP: ready / spinning / result → show customer card */}
              {(step === 'ready' || step === 'spinning' || step === 'result') && customer && (
                <div className="space-y-3">
                  <div className="bg-white/20 rounded-xl p-3 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-white/30 flex items-center justify-center text-xl font-bold text-white shrink-0">
                      {customer.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">{customer.name}</p>
                      <p className="text-violet-300 text-xs flex items-center gap-1">
                        <Phone className="h-3 w-3" />{customer.phone}
                      </p>
                    </div>
                    <ShieldCheck className="h-4 w-4 text-green-400 ml-auto shrink-0" />
                  </div>

                  {alreadyPlayed ? (
                    <div className="space-y-2">
                      <div className="bg-amber-500/20 border border-amber-400/30 rounded-xl p-4 text-center">
                        <p className="text-2xl mb-1">😊</p>
                        <p className="text-white font-semibold text-sm">Ya participó este mes</p>
                        <p className="text-white/70 text-xs mt-1">Puede volver el próximo mes</p>
                      </div>
                      {isAdmin && (
                        <button
                          onClick={handleAdminReset}
                          className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-300/70 hover:text-amber-200 border border-amber-400/20 rounded-lg py-1.5 transition-colors"
                          title="Solo visible para administradores"
                        >
                          <FlaskConical className="h-3.5 w-3.5" />
                          Resetear para probar
                        </button>
                      )}
                    </div>
                  ) : step === 'ready' ? (
                    <Button
                      onClick={handleSpin}
                      className="w-full h-14 text-lg font-black bg-gradient-to-r from-yellow-400 to-orange-400
                                 hover:from-yellow-300 hover:to-orange-300 text-gray-900 shadow-lg shadow-orange-500/30
                                 transition-all hover:scale-105 active:scale-95"
                    >
                      🎡 ¡GIRAR!
                    </Button>
                  ) : step === 'spinning' ? (
                    <div className="text-center py-4">
                      <p className="text-white font-bold text-lg animate-pulse">¡Girando…! 🎉</p>
                    </div>
                  ) : null}

                  {step === 'result' && (
                    <div className="space-y-2">
                      <Button
                        onClick={reset}
                        variant="outline"
                        className="w-full bg-white/10 border-white/30 text-white hover:bg-white/20"
                      >
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Nuevo cliente
                      </Button>
                      {isAdmin && (
                        <button
                          onClick={handleAdminReset}
                          className="w-full flex items-center justify-center gap-1.5 text-xs text-amber-300/70 hover:text-amber-200 border border-amber-400/20 rounded-lg py-1.5 transition-colors"
                          title="Solo visible para administradores"
                        >
                          <FlaskConical className="h-3.5 w-3.5" />
                          Resetear y volver a girar
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Center: Wheel ──────────────────────────────────────────────── */}
          <div className="flex flex-col items-center gap-4 w-full">
            {/* Pointer + canvas en contenedor responsivo */}
            <div className="relative w-full max-w-[360px] mx-auto">
              <div
                className="absolute left-1/2 -translate-x-1/2 -top-1 z-10"
                style={{
                  width: 0, height: 0,
                  borderLeft:  '14px solid transparent',
                  borderRight: '14px solid transparent',
                  borderTop:   '28px solid #fbbf24',
                  filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.4))',
                }}
              />

              {/* width/height = resolución interna de dibujo (nítida).
                  CSS w-full + height:auto = escala proporcional en pantallas chicas. */}
              <canvas
                ref={canvasRef}
                width={360}
                height={360}
                className="rounded-full shadow-2xl shadow-black/40 w-full"
                style={{
                  height: 'auto',
                  filter: spinning ? 'brightness(1.05)' : 'brightness(1)',
                  transition: 'filter 0.3s',
                }}
              />
            </div>

            {/* Result card */}
            {step === 'result' && spinResult && (
              <div className={`w-full max-w-sm rounded-2xl p-5 text-center shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-500
                ${spinResult.result === 'prize'
                  ? 'bg-gradient-to-br from-yellow-400 to-orange-400 text-gray-900'
                  : 'bg-white/20 border border-white/30 text-white'}`}>

                {spinResult.result === 'prize' ? (
                  <>
                    <div className="text-5xl mb-2">🎉</div>
                    <p className="font-black text-2xl mb-1">¡Ganaste!</p>
                    <p className="font-bold text-lg">
                      {spinResult.promotion?.discount_type === 'percentage'
                        ? `${spinResult.promotion.value}% OFF`
                        : `$${spinResult.promotion?.value?.toLocaleString('es-AR')} OFF`}
                    </p>
                    {spinResult.promotion?.name && (
                      <p className="text-sm mt-0.5 opacity-80">{spinResult.promotion.name}</p>
                    )}

                    {/* Código */}
                    <div className="mt-4 bg-white/30 rounded-xl p-3 space-y-1.5">
                      <p className="text-xs font-semibold uppercase tracking-wider opacity-60">
                        Código de descuento
                      </p>
                      <p className="text-2xl sm:text-3xl font-mono font-black tracking-[0.15em] sm:tracking-[0.2em]">
                        {spinResult.discount_code}
                      </p>
                      <div className="pt-1 border-t border-black/10 space-y-0.5">
                        {spinResult.discount_expiry ? (
                          <p className="text-xs font-bold">
                            📅 Válido hasta el{' '}
                            {new Date(spinResult.discount_expiry).toLocaleDateString('es-AR', {
                              day: 'numeric', month: 'long', year: 'numeric',
                            })}
                          </p>
                        ) : null}
                        <p className="text-xs opacity-70">Un solo uso · Presentar al momento de pagar</p>
                      </div>
                    </div>

                    {/* Botón imprimir */}
                    <button
                      onClick={printCoupon}
                      className="mt-3 w-full flex items-center justify-center gap-2 text-xs font-bold
                                 bg-black/20 hover:bg-black/30 rounded-xl py-2.5 transition-colors"
                    >
                      🖨️ Imprimir cupón
                    </button>
                    <p className="text-xs opacity-50 mt-1">
                      También podés sacar una captura de pantalla
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-5xl mb-2">😔</div>
                    <p className="font-black text-2xl mb-1">¡Mejor suerte la próxima!</p>
                    <p className="text-white/70 text-sm">Podés volver el próximo mes</p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
