'use client'

import { ReactNode } from 'react'
import { usePlan } from '@/contexts/PlanContext'
import { toast } from 'sonner'

// ── PlanGate ─────────────────────────────────────────────────
// Componente principal. Controla visibilidad según plan.
//
// Uso básico (ocultar si no tiene acceso):
//   <PlanGate code="branch.multi">
//     <MultiBranchPanel />
//   </PlanGate>
//
// Uso con lock (mostrar card de upgrade en vez de ocultar):
//   <PlanGate code="kpi.rotation" mode="locked">
//     <RotacionKPI />
//   </PlanGate>
//
// Override de display_mode de la BD:
//   <PlanGate code="ai.descriptions" forceMode="locked">
//     <AIDescriptions />
//   </PlanGate>

interface PlanGateProps {
  code: string
  children: ReactNode
  /** Qué mostrar cuando está oculto (display_mode='hidden'). Default: nada */
  fallback?: ReactNode
  /**
   * Sobrescribir el display_mode de la BD para este render puntual.
   * Útil cuando el componente necesita mostrar el lock en un lugar específico.
   */
  forceMode?: 'hidden' | 'locked'
  /** Nombre del plan requerido para el mensaje de upgrade (ej: "Boutique") */
  requiredPlanName?: string
}

export function PlanGate({
  code,
  children,
  fallback = null,
  forceMode,
  requiredPlanName,
}: PlanGateProps) {
  const { can, displayMode, requiredPlan, isLoaded, plan } = usePlan()

  // Mientras carga, no renderizar nada (evita flash de contenido bloqueado)
  if (!isLoaded) return null

  // Tiene acceso → renderizar normalmente
  if (can(code)) return <>{children}</>

  const mode = forceMode ?? displayMode(code)

  if (mode === 'locked') {
    const feature = plan.features[code]
    return (
      <PlanLockCard
        code={code}
        requiredPlanName={requiredPlanName ?? requiredPlan(code) ?? undefined}
        featureName={feature?.name}
        featureDescription={feature?.description}
      />
    )
  }

  // display_mode === 'hidden'
  return <>{fallback}</>
}

// ── PlanLockCard ─────────────────────────────────────────────
// Card de upgrade que se muestra cuando display_mode='locked'.
// Reemplaza el contenido sin exponerlo.

interface PlanLockCardProps {
  code: string
  requiredPlanName?: string
  featureName?: string
  featureDescription?: string
}

function PlanLockCard({ code, requiredPlanName, featureName, featureDescription }: PlanLockCardProps) {
  const planLabel = requiredPlanName ? `Plan ${requiredPlanName}` : 'un plan superior'

  function handleClick() {
    toast('Puede subir de Plan para acceder a esta Funcionalidad', { duration: 3000 })
  }

  return (
    <div
      data-plan-gate={code}
      onClick={handleClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        gap: '4px',
        padding: '16px 18px',
        border: '1px dashed #e2e8f0',
        borderRadius: '8px',
        background: '#f8fafc',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
      onMouseLeave={e => (e.currentTarget.style.background = '#f8fafc')}
    >
      {featureName && (
        <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>
          {featureName}
        </span>
      )}
      {featureDescription && (
        <span style={{ fontSize: '12px', color: '#94a3b8', lineHeight: '1.4' }}>
          {featureDescription}
        </span>
      )}
      <span style={{ fontSize: '11px', color: '#cbd5e1', marginTop: featureName || featureDescription ? '4px' : 0 }}>
        Disponible en {planLabel}
      </span>
    </div>
  )
}

// ── usePlanCan ───────────────────────────────────────────────
// Hook para lógica condicional sin necesidad del componente wrapper.
//
// Uso:
//   const canMultiBranch = usePlanCan('branch.multi')
//   if (!canMultiBranch) return <SucursalUnica />

export function usePlanCan(code: string): boolean {
  const { can } = usePlan()
  return can(code)
}
