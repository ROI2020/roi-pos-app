'use client'

import { PlanGate } from "@/components/PlanGate"
import LabelPrinter from "@/components/label-printer"

export default function EtiquetasPage() {
  return (
    <PlanGate code="pos.label_print" forceMode="locked">
      <LabelPrinter />
    </PlanGate>
  )
}
