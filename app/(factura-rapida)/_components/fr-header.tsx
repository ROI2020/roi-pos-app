"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { clearSession } from "@/lib/session"
import { LogOut, Settings, FileText, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"

const NAV_LINKS = [
  { href: "/setup",     label: "Configuración", icon: Settings  },
  { href: "/emitir",   label: "Emitir",        icon: FileText  },
  { href: "/historial",label: "Historial",      icon: Clock     },
]

export function FRHeader({ businessName }: { businessName: string }) {
  const pathname = usePathname()
  const router   = useRouter()

  function signOut() {
    clearSession()
    router.push('/sin-acceso')
  }

  return (
    <>
      <header className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <span className="text-sm font-bold text-violet-700 tracking-tight">ROISOL</span>
          <span className="text-slate-300">·</span>
          <span className="text-sm font-semibold text-slate-700">Factura Rápida</span>
        </div>
        <span className="text-xs text-slate-500 hidden sm:block truncate max-w-[160px]">{businessName}</span>
        <Button variant="ghost" size="sm" onClick={signOut} className="gap-1.5 text-slate-500 hover:text-slate-700">
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline text-xs">Salir</span>
        </Button>
      </header>

      <nav className="bg-white border-b px-2 flex items-center gap-0">
        {NAV_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              pathname === href
                ? "border-violet-600 text-violet-700"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  )
}
