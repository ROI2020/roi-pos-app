'use client'

import { PlanGate } from '@/components/PlanGate'
import ArcaConfigPanel from '@/components/arca/ArcaConfigPanel'

export default function ArcaSettingsPage() {
  return (
    <PlanGate code="arca.settings" forceMode="locked">
      <ArcaConfigPanel />
    </PlanGate>
  )
}
