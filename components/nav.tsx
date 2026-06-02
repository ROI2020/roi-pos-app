"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import {
  ShoppingBag, Tags, Warehouse, LayoutDashboard, Printer,
  ShoppingCart, Settings, Package, ArrowLeftRight, TrendingUp, ChevronDown,
  FileSpreadsheet, Store,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

const MAIN_LINKS = [
  { href: "/",            label: "Compras", Icon: ShoppingBag    },
  { href: "/venta",       label: "Ventas",  Icon: ShoppingCart   },
  { href: "/movimientos", label: "Cajas",   Icon: ArrowLeftRight },
]

const INVENTORY_LINKS = [
  { href: "/productos",     label: "Productos",            Icon: Package         },
  { href: "/clasificacion", label: "Clasificar Productos", Icon: Tags            },
  { href: "/asignacion",    label: "Asignación de Stock",  Icon: Warehouse       },
  { href: "/etiquetas",     label: "Etiquetas",            Icon: Printer         },
  { href: "/importacion",   label: "Importar Excel",       Icon: FileSpreadsheet },
]

const ANALYTICS_LINKS = [
  { href: "/rendimiento", label: "Rendimiento", Icon: TrendingUp      },
  { href: "/dashboard",   label: "Dashboard",   Icon: LayoutDashboard },
]

export default function Nav() {
  const path = usePathname()

  // La tienda pública tiene su propio header — ocultar el nav interno
  if (path === '/tienda') return null
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [businessLogo, setBusinessLogo] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then((d: Record<string, string | null>) => {
        setBusinessName(d.business_name ?? null)
        setBusinessLogo(d.business_logo ?? null)
      })
      .catch(() => {})
  }, [])

  const inventoryActive = INVENTORY_LINKS.some(l => l.href === path)
  const analyticsActive = ANALYTICS_LINKS.some(l => l.href === path)

  return (
    <nav className="sticky top-0 z-50 bg-white border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-1">

        {/* Logo / nombre del negocio */}
        <div className="flex items-center gap-2 mr-4 shrink-0">
          {businessLogo
            ? <img src={businessLogo} alt="logo" className="h-7 w-7 object-contain rounded" />
            : <img src="/icon.svg" alt="ROIPOS" className="h-7 w-7 object-contain" />
          }
          <span className="font-bold text-gray-800 text-sm tracking-tight">
            {businessName ?? 'ROI POS'}
          </span>
        </div>

        {/* Links principales */}
        {MAIN_LINKS.map(({ href, label, Icon }) => {
          const active = path === href
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
                transition-colors
                ${active
                  ? "bg-violet-100 text-violet-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          )
        })}

        {/* Dropdown: Inventario */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${inventoryActive
                  ? "bg-violet-100 text-violet-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
            >
              <Package className="h-4 w-4" />
              Inventario
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            {INVENTORY_LINKS.map(({ href, label, Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link
                  href={href}
                  className={`flex items-center gap-2 w-full ${path === href ? 'text-violet-700 font-medium' : ''}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Dropdown: Análisis */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${analyticsActive
                  ? "bg-violet-100 text-violet-700"
                  : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                }`}
            >
              <TrendingUp className="h-4 w-4" />
              Análisis
              <ChevronDown className="h-3.5 w-3.5 opacity-60" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {ANALYTICS_LINKS.map(({ href, label, Icon }) => (
              <DropdownMenuItem key={href} asChild>
                <Link
                  href={href}
                  className={`flex items-center gap-2 w-full ${path === href ? 'text-violet-700 font-medium' : ''}`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tienda pública */}
        <Link
          href="/tienda"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
            transition-colors text-gray-500 hover:text-gray-700 hover:bg-gray-100"
        >
          <Store className="h-4 w-4" />
          Tienda
        </Link>

        {/* Configuración — al final */}
        <Link
          href="/configuracion"
          className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium
            transition-colors ml-auto
            ${path === '/configuracion'
              ? "bg-violet-100 text-violet-700"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
        >
          <Settings className="h-4 w-4" />
          Configuración
        </Link>

      </div>
    </nav>
  )
}
