'use client'

import { PlanGate } from "@/components/PlanGate"
import PurchaseRoiReport from "@/components/purchase-roi-report"

export default function RendimientoPage() {
  return (
    <PlanGate code="kpi.performance" forceMode="locked">
      <PurchaseRoiReport />
    </PlanGate>
  )
}
