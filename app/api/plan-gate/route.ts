import { NextResponse } from 'next/server'
import { getBusinessPlanInfo, getAllFeatureAccess } from '@/lib/plan-gate'

// GET /api/plan-gate
// Devuelve el nivel del plan activo + mapa completo de accesos por feature.
// Lo consume el PlanContext en el cliente (se llama una sola vez al cargar la app).
export async function GET() {
  try {
    const planInfo = await getBusinessPlanInfo(1)
    const features = await getAllFeatureAccess(planInfo.planLevel)

    return NextResponse.json({
      planId:             planInfo.planId,
      planName:           planInfo.planName,
      planLevel:          planInfo.planLevel,
      monthlySalesLimit:  planInfo.monthlySalesLimit,
      userQuantity:       planInfo.userQuantity,
      branchQuantity:     planInfo.branchQuantity,
      validUntil:         planInfo.validUntil,
      status:             planInfo.status,
      features,
    })
  } catch (err) {
    console.error('[plan-gate] GET error:', err)
    // Fail open: devuelve nivel 1 para no bloquear la app
    return NextResponse.json({
      planId: 1,
      planName: 'Showroom',
      planLevel: 1,
      monthlySalesLimit: 50,
      userQuantity: 1,
      branchQuantity: 1,
      validUntil: null,
      status: 'active',
      features: {},
    })
  }
}
