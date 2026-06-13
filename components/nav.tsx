"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import {
  ShoppingBag, Tags, Warehouse, LayoutDashboard, Printer,
  ShoppingCart, Settings, Package, ArrowLeftRight, TrendingUp, ChevronDown,
  FileSpreadsheet, Store, Menu, LogOut,
} from "lucide-react"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet"
import { getSession, clearSession, type UserSession } from "@/lib/session"

const MAIN_LINKS = [
  { href: "/",            label: "Compras", Icon: ShoppingBag    },
  { href: "/venta",       label: "Ventas",  Icon: ShoppingCart   },
  { href: "/movimientos", label: "Cajas",   Icon: ArrowLeftRight },
]

const INVENTORY_LINKS = [
  { href: "/productos",     label: "Productos",            Icon: Package         },
  { href: "/clasificacion", label: "Clasificar",           Icon: Tags            },
  { href: "/asignacion",    label: "Asignación",           Icon: Warehouse       },
  { href: "/etiquetas",     label: "Etiquetas",            Icon: Printer         },
  { href: "/importacion",   label: "Importar Excel",       Icon: FileSpreadsheet },
]

const ANALYTICS_LINKS = [
  { href: "/rendimiento", label: "Rendimiento", Icon: TrendingUp      },
  { href: "/dashboard",   label: "Dashboard",   Icon: LayoutDashboard },
]

const ALL_SECONDARY = [
  { section: "Inventario", links: INVENTORY_LINKS },
  { section: "Análisis",   links: ANALYTICS_LINKS },
  { section: "Otros", links: [
    { href: "/tienda",        label: "Tienda",        Icon: Store    },
    { href: "/configuracion", label: "Configuración", Icon: Settings },
  ]},
]

export default function Nav() {
  const path    = usePathname()
  const router  = useRouter()
  const [businessName, setBusinessName] = useState<string | null>(null)
  const [businessLogo, setBusinessLogo] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [session, setSessionState] = useState<UserSession | null>(null)

  // Todos los hooks ANTES de cualquier return condicional
  useEffect(() => { setSessionState(getSession()) }, [])

  useEffect(() => {
    if (path === '/tienda' || path === '/login') return
    fetch('/api/settings')
      .then(r => r.json())
      .then((d: Record<string, string | null>) => {
        setBusinessName(d.business_name ?? null)
        setBusinessLogo(d.business_logo ?? null)
      })
      .catch(() => {})
  }, [path])

  if (path === '/tienda' || path === '/login') return null

  const isAdmin = session?.role === 'administrador'

  function logout() {
    clearSession()
    router.push('/login')
  }

  const inventoryActive = INVENTORY_LINKS.some(l => l.href === path)
  const analyticsActive = ANALYTICS_LINKS.some(l => l.href === path)

  return (
    <>
      {/* ── NAV DESKTOP ──────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white border-b shadow-sm hidden md:block">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-1">

          <div className="flex items-center gap-2 mr-4 shrink-0">
            {businessLogo
              ? <img src={businessLogo} alt="logo" className="h-7 w-7 object-contain rounded" />
              : <img src="/icon.svg" alt="ROIPOS" className="h-7 w-7 object-contain" />
            }
            <span className="font-bold text-gray-800 text-sm tracking-tight">
              {businessName ?? 'ROI POS'}
            </span>
          </div>

          {/* Ventas siempre visible */}
          <Link href="/venta"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${path === '/venta' ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
            <ShoppingCart className="h-4 w-4" />Ventas
          </Link>

          {/* Productos visible para vendedor y encargado (no-admin) */}
          {!isAdmin && (
            <Link href="/productos"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${path === '/productos' ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
              <Package className="h-4 w-4" />Productos
            </Link>
          )}

          {/* Solo admin */}
          {isAdmin && <>
            <Link href="/"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${path === '/' ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
              <ShoppingBag className="h-4 w-4" />Compras
            </Link>

            <Link href="/movimientos"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${path === '/movimientos' ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
              <ArrowLeftRight className="h-4 w-4" />Cajas
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${inventoryActive ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
                  <Package className="h-4 w-4" />Inventario<ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {INVENTORY_LINKS.map(({ href, label, Icon }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} className={`flex items-center gap-2 w-full ${path === href ? 'text-violet-700 font-medium' : ''}`}>
                      <Icon className="h-4 w-4" />{label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                  ${analyticsActive ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
                  <TrendingUp className="h-4 w-4" />Análisis<ChevronDown className="h-3.5 w-3.5 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                {ANALYTICS_LINKS.map(({ href, label, Icon }) => (
                  <DropdownMenuItem key={href} asChild>
                    <Link href={href} className={`flex items-center gap-2 w-full ${path === href ? 'text-violet-700 font-medium' : ''}`}>
                      <Icon className="h-4 w-4" />{label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <Link href="/configuracion"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${path === '/configuracion' ? "bg-violet-100 text-violet-700" : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"}`}>
              <Settings className="h-4 w-4" />Config
            </Link>
          </>}

          {/* Avatar + logout */}
          <div className="ml-auto flex items-center gap-2">
            {session?.avatar_url && (
              <img src={session.avatar_url} alt={session.name}
                className="h-7 w-7 rounded-full ring-2 ring-violet-200" />
            )}
            <span className="text-xs text-gray-500 hidden lg:block max-w-[120px] truncate">
              {session?.name}
            </span>
            <button onClick={logout}
              className="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Cerrar sesión">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </nav>

      {/* ── HEADER MOBILE ────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white border-b shadow-sm flex md:hidden items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          {session?.avatar_url
            ? <img src={session.avatar_url} alt={session.name} className="h-7 w-7 rounded-full ring-2 ring-violet-200" />
            : <img src="/icon.svg" alt="ROIPOS" className="h-7 w-7 object-contain" />
          }
          <span className="font-bold text-gray-800 text-sm tracking-tight max-w-[120px] truncate">
            {session?.name ?? businessName ?? 'ROI POS'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={logout} className="p-2 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50">
            <LogOut className="h-4 w-4" />
          </button>
          {isAdmin && (
            <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
              <SheetTrigger asChild>
                <button className="p-2 rounded-md text-gray-500 hover:bg-gray-100">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 p-0">
                <SheetHeader className="px-4 py-4 border-b">
                  <SheetTitle className="text-left text-sm font-bold text-gray-800">
                    {businessName ?? 'ROI POS'}
                  </SheetTitle>
                </SheetHeader>
                <div className="overflow-y-auto h-full pb-8">
                  {ALL_SECONDARY.map(({ section, links }) => (
                    <div key={section}>
                      <p className="px-4 pt-4 pb-1 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {section}
                      </p>
                      {links.map(({ href, label, Icon }) => (
                        <Link key={href} href={href} onClick={() => setDrawerOpen(false)}
                          className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors
                            ${path === href ? "bg-violet-50 text-violet-700 border-r-2 border-violet-600" : "text-gray-600 hover:bg-gray-50"}`}>
                          <Icon className="h-4 w-4 shrink-0" />{label}
                        </Link>
                      ))}
                    </div>
                  ))}
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </header>

      {/* ── BOTTOM TAB BAR MOBILE ────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg flex md:hidden">
        <Link href="/venta"
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors
            ${path === '/venta' ? "text-violet-700" : "text-gray-400"}`}>
          <ShoppingCart className={`h-5 w-5 ${path === '/venta' ? "text-violet-600" : ""}`} />
          Ventas
        </Link>
        {/* Productos para no-admin */}
        {!isAdmin && (
          <Link href="/productos"
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors
              ${path === '/productos' ? "text-violet-700" : "text-gray-400"}`}>
            <Package className={`h-5 w-5 ${path === '/productos' ? "text-violet-600" : ""}`} />
            Productos
          </Link>
        )}
        {isAdmin && <>
          <Link href="/"
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors
              ${path === '/' ? "text-violet-700" : "text-gray-400"}`}>
            <ShoppingBag className={`h-5 w-5 ${path === '/' ? "text-violet-600" : ""}`} />
            Compras
          </Link>
          <Link href="/movimientos"
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors
              ${path === '/movimientos' ? "text-violet-700" : "text-gray-400"}`}>
            <ArrowLeftRight className={`h-5 w-5 ${path === '/movimientos' ? "text-violet-600" : ""}`} />
            Cajas
          </Link>
          <Link href="/productos"
            className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium transition-colors
              ${inventoryActive ? "text-violet-700" : "text-gray-400"}`}>
            <Package className={`h-5 w-5 ${inventoryActive ? "text-violet-600" : ""}`} />
            Stock
          </Link>
          <button onClick={() => setDrawerOpen(true)}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[10px] font-medium text-gray-400">
            <Menu className="h-5 w-5" />
            Más
          </button>
        </>}
      </nav>

    </>
  )
}
