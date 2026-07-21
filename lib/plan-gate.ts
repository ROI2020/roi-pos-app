import { NextResponse } from 'next/server'
import pool from '@/lib/db'

export type DisplayMode = 'hidden' | 'locked'

export interface FeatureAccess {
  allowed: boolean
  displayMode: DisplayMode
  name?: string              // nombre legible de la funcionalidad
  description?: string       // descripción de la funcionalidad
  requiredPlanName?: string  // nombre del plan mínimo requerido (solo cuando !allowed)
}

export interface BusinessPlanInfo {
  planId: number
  planName: string
  planLevel: number
  monthlySalesLimit: number
  userQuantity: number       // -1 = ilimitado
  branchQuantity: number     // -1 = ilimitado
  validUntil: string | null
  status: string
}

// Devuelve la info del plan activo del negocio.
// Si no tiene plan configurado, cae a Showroom (nivel 1) como default seguro.
export async function getBusinessPlanInfo(businessId = 1): Promise<BusinessPlanInfo> {
  const { rows } = await pool.query<{
    plan_id: number
    plan_name: string
    plan_level: number
    monthly_sales_limit: number
    user_quantity: number
    branch_quantity: number
    valid_until: string
    status: string
  }>(
    `SELECT
       p.id              AS plan_id,
       p.name            AS plan_name,
       p.level           AS plan_level,
       p.monthly_sales_limit,
       p.user_quantity,
       p.branch_quantity,
       bp.valid_until,
       bp.status
     FROM business b
     JOIN business_plan bp ON bp.id = b.active_subscription_id
     JOIN plans p           ON p.id = bp.plan_id
     WHERE b.id = $1`,
    [businessId]
  )

  if (!rows.length) {
    // Sin plan configurado (migración no ejecutada o active_subscription_id NULL).
    // Fail open con nivel máximo para no bloquear al operador.
    return {
      planId: 0,
      planName: 'Sin plan',
      planLevel: 10,
      monthlySalesLimit: -1,
      userQuantity: -1,
      branchQuantity: -1,
      validUntil: null,
      status: 'active',
    }
  }

  const r = rows[0]
  return {
    planId: r.plan_id,
    planName: r.plan_name,
    planLevel: r.plan_level,
    monthlySalesLimit: r.monthly_sales_limit,
    userQuantity: r.user_quantity,
    branchQuantity: r.branch_quantity,
    validUntil: r.valid_until,
    status: r.status,
  }
}

// Chequea UNA feature puntual. Útil en server components y API routes.
export async function checkFeature(
  functionCode: string,
  planLevel: number
): Promise<FeatureAccess> {
  const { rows } = await pool.query<{
    min_plan_level: number
    display_mode: DisplayMode
  }>(
    `SELECT min_plan_level, display_mode
     FROM functionalities
     WHERE function_code = $1 AND is_active = true`,
    [functionCode]
  )

  if (!rows.length) {
    // Feature no registrada → acceso libre (fail open)
    return { allowed: true, displayMode: 'hidden' }
  }

  return {
    allowed: planLevel >= rows[0].min_plan_level,
    displayMode: rows[0].display_mode,
  }
}

// Chequea TODAS las features activas de una vez.
// Usada por el endpoint /api/plan-gate para alimentar el contexto React.
export async function getAllFeatureAccess(
  planLevel: number
): Promise<Record<string, FeatureAccess>> {
  const { rows } = await pool.query<{
    function_code:      string
    name:               string
    description:        string
    min_plan_level:     number
    display_mode:       DisplayMode
    required_plan_name: string
  }>(
    `SELECT f.function_code, f.name, f.description, f.min_plan_level, f.display_mode,
            p.name AS required_plan_name
     FROM functionalities f
     LEFT JOIN plans p ON p.level = f.min_plan_level
     WHERE f.is_active = true`
  )

  const result: Record<string, FeatureAccess> = {}
  for (const row of rows) {
    const allowed = planLevel >= row.min_plan_level
    result[row.function_code] = {
      allowed,
      displayMode:      row.display_mode,
      name:             row.name,
      description:      row.description || undefined,
      requiredPlanName: allowed ? undefined : row.required_plan_name,
    }
  }
  return result
}

// Verifica una feature y devuelve un NextResponse 403 si no está permitida, o null si sí.
// Uso en API routes: const blocked = await requireFeature('feature.code'); if (blocked) return blocked
export async function requireFeature(
  functionCode: string,
  businessId = 1
): Promise<NextResponse | null> {
  try {
    const planInfo = await getBusinessPlanInfo(businessId)
    const access   = await checkFeature(functionCode, planInfo.planLevel)
    if (access.allowed) return null
    return NextResponse.json({ error: 'Plan insuficiente para esta funcionalidad' }, { status: 403 })
  } catch {
    return null // fail open
  }
}

// Chequea si el negocio alcanzó el límite de ventas del mes.
// Cuenta directamente desde la tabla sales (sin caché).
export async function hasReachedMonthlySalesLimit(businessId = 1): Promise<{
  reached: boolean
  current: number
  limit: number
}> {
  const [planInfo, salesCount] = await Promise.all([
    getBusinessPlanInfo(businessId),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count
       FROM sales
       WHERE business_id = $1
         AND date_trunc('month', created_at) = date_trunc('month', NOW())`,
      [businessId]
    ),
  ])

  const current = parseInt(salesCount.rows[0]?.count ?? '0', 10)
  const limit = planInfo.monthlySalesLimit

  return { reached: current >= limit, current, limit }
}
