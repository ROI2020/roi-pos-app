"use client"

/**
 * InfoBar — Barra de íconos informativos debajo del banner.
 *
 * Los ítems se configuran en settings como "catalog_info_items",
 * un texto con una línea por ítem en formato:  icon|Texto a mostrar
 *
 * Iconos disponibles (nombre → Lucide):
 *   truck          →  Envío gratuito
 *   shield-check   →  Compra segura
 *   credit-card    →  Pago con tarjeta
 *   shopping-bag   →  Comprá ahora, pagá después
 *   mail           →  Soporte por email
 *   tag            →  Ofertas exclusivas
 *   clock          →  Horario / respuesta rápida
 *   package        →  Embalaje protegido
 *   refresh-cw     →  Devoluciones / cambios
 *   gift           →  Regalos / sorpresas
 *   star           →  Calidad garantizada
 *   zap            →  Entrega express
 *   lock           →  Pago 100% seguro
 *   phone          →  Atención telefónica
 *   globe          →  Envíos a todo el país
 *   award          →  Marca premium
 *   heart          →  Hecho con amor
 *   check-circle   →  Producto verificado
 */

import {
  Truck, ShieldCheck, CreditCard, ShoppingBag, Mail, Tag,
  Clock, Package, RefreshCw, Gift, Star, Zap, Lock, Phone,
  Globe, Award, Heart, CheckCircle,
  type LucideIcon,
} from 'lucide-react'

const ICON_MAP: Record<string, LucideIcon> = {
  'truck':        Truck,
  'shield-check': ShieldCheck,
  'credit-card':  CreditCard,
  'shopping-bag': ShoppingBag,
  'mail':         Mail,
  'tag':          Tag,
  'clock':        Clock,
  'package':      Package,
  'refresh-cw':   RefreshCw,
  'gift':         Gift,
  'star':         Star,
  'zap':          Zap,
  'lock':         Lock,
  'phone':        Phone,
  'globe':        Globe,
  'award':        Award,
  'heart':        Heart,
  'check-circle': CheckCircle,
}

export interface InfoItem {
  icon: string
  text: string
}

export default function InfoBar({ items }: { items: InfoItem[] }) {
  if (!items.length) return null

  return (
    <div className="store-surface border-b">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap sm:justify-center gap-x-8 gap-y-2.5">
          {items.map((item, i) => {
            const Icon = ICON_MAP[item.icon] ?? Tag
            return (
              <div key={i} className="flex items-center gap-2">
                <Icon className="h-4 w-4 store-text-primary shrink-0" />
                <span className="text-xs font-medium store-text-muted leading-tight">
                  {item.text}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/**
 * Parsea el texto crudo del setting "catalog_info_items".
 * Cada línea tiene formato:  icon|Texto a mostrar
 * Las líneas vacías o sin separador `|` se ignoran.
 */
export function parseInfoItems(raw: string | null | undefined): InfoItem[] {
  if (!raw) return []
  return raw
    .split('\n')
    .map(line => {
      const sep = line.indexOf('|')
      if (sep === -1) return null
      const icon = line.slice(0, sep).trim().toLowerCase()
      const text = line.slice(sep + 1).trim()
      if (!icon || !text) return null
      return { icon, text }
    })
    .filter((x): x is InfoItem => x !== null)
}
