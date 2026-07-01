'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from 'react'

// ── Tipos ────────────────────────────────────────────────────
export type DisplayMode = 'hidden' | 'locked'

export interface FeatureAccess {
  allowed: boolean
  displayMode: DisplayMode
  name?: string
  description?: string
  requiredPlanName?: string
}

export interface PlanInfo {
  planId: number
  planName: string
  planLevel: number
  monthlySalesLimit: number
  userQuantity: number    // -1 = ilimitado
  branchQuantity: number  // -1 = ilimitado
  validUntil: string | null
  status: string
  features: Record<string, FeatureAccess>
}

interface PlanContextValue {
  plan: PlanInfo
  isLoaded: boolean
  /** true si el plan está vencido o cancelado */
  isExpired: boolean
  /** Devuelve true si el negocio tiene acceso a la feature */
  can: (code: string) => boolean
  /** Devuelve cómo mostrar una feature bloqueada */
  displayMode: (code: string) => DisplayMode
  /** Devuelve el nombre del plan mínimo requerido (para mensajes de upgrade) */
  requiredPlan: (code: string) => string | null
  /** Recarga el plan desde el servidor (útil tras un cambio de plan) */
  refresh: () => Promise<void>
}

// ── Defaults (estado antes de que cargue) ───────────────────
const DEFAULT_PLAN: PlanInfo = {
  planId: 1,
  planName: 'Showroom',
  planLevel: 1,
  monthlySalesLimit: 50,
  userQuantity: 1,
  branchQuantity: 1,
  validUntil: null,
  status: 'active',
  features: {},
}

const PlanContext = createContext<PlanContextValue>({
  plan: DEFAULT_PLAN,
  isLoaded: false,
  isExpired: false,
  can: () => true,
  displayMode: () => 'hidden',
  requiredPlan: () => null,
  refresh: async () => {},
})

// ── Provider ─────────────────────────────────────────────────
export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, setPlan] = useState<PlanInfo>(DEFAULT_PLAN)
  const [isLoaded, setIsLoaded] = useState(false)

  const load = async () => {
    try {
      const res = await fetch('/api/plan-gate', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as PlanInfo
      setPlan(data)
    } catch {
      // Fail open: si falla el fetch, dejamos el default (nivel 1)
    } finally {
      setIsLoaded(true)
    }
  }

  useEffect(() => { load() }, [])

  const isExpired =
    plan.status === 'expired' ||
    plan.status === 'cancelled' ||
    (!!plan.validUntil && new Date(plan.validUntil) < new Date())

  const can = (code: string): boolean => {
    const feature = plan.features[code]
    if (!feature) return true   // no registrada → libre acceso
    return feature.allowed
  }

  const displayMode = (code: string): DisplayMode => {
    return plan.features[code]?.displayMode ?? 'hidden'
  }

  const requiredPlan = (code: string): string | null => {
    const feature = plan.features[code]
    if (!feature || feature.allowed) return null
    return feature.requiredPlanName ?? null
  }

  return (
    <PlanContext.Provider
      value={{ plan, isLoaded, isExpired, can, displayMode, requiredPlan, refresh: load }}
    >
      {children}
    </PlanContext.Provider>
  )
}

// ── Hook de consumo ──────────────────────────────────────────
export const usePlan = () => useContext(PlanContext)
