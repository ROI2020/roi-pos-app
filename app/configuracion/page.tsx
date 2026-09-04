import { Suspense }    from "react"
import SettingsPanel  from "@/components/settings-panel"

export default function ConfiguracionPage() {
  return (
    <Suspense>
      <SettingsPanel />
    </Suspense>
  )
}
