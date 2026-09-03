import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { DM_Sans } from 'next/font/google'
import Script from 'next/script'
import { Toaster } from '@/components/ui/sonner'
import Nav from '@/components/nav'
import { PlanProvider } from '@/contexts/PlanContext'
import { ThemeProvider } from '@/components/theme-provider'
import './globals.css'


// ── Fuente del sistema ─────────────────────────────────────────────────────────
// Para cambiar a Roboto: reemplazá DM_Sans por Roboto y actualizá el nombre.
const dmSans = DM_Sans({
  subsets: ['latin'],
  weight:  ['400', '500', '600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: 'ROIPOS',
  description: 'Sistema de Punto de Venta',
  icons: {
    icon: '/favicon.png',
    apple: '/roipos-logo-180x180.png',
  },
  // Permite que Google use imágenes de alta resolución (>1024px) al rastrear el sitio.
  // Requerido por Google Merchant Center para reconocer imágenes de calidad.
  // Genera: <meta name="googlebot" content="index, follow, max-image-preview:large">
  robots: {
    index:  true,
    follow: true,
    googleBot: {
      index:                true,
      follow:               true,
      'max-image-preview':  'large',
    },
  },
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const hdrs = await headers()
  const isFacturaRapida = hdrs.get('x-is-factura-rapida') === 'true'
  // x-store-base lo setea el middleware en todas las requests /tienda/* y /store/*
  // Cuando está presente, estamos sirviendo la tienda pública → sin nav de admin
  const isStore = !!hdrs.get('x-store-base')
  // GA4 ID por negocio — viene del middleware vía settings.catalog_ga4_measurement_id
  // Solo se inyecta en producción (localhost no tiene ga4Id para no contaminar métricas)
  const ga4Id   = hdrs.get('x-ga4-id') ?? null

  const showAdminShell = !isFacturaRapida && !isStore

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Google Analytics 4 — por negocio, solo en tienda pública, solo en producción */}
        {isStore && ga4Id && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
              strategy="afterInteractive"
            />
            <Script id="ga4-init" strategy="afterInteractive">{`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${ga4Id}');
            `}</Script>
          </>
        )}
      </head>
      <body className={`${dmSans.className} antialiased`} suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <PlanProvider>
            {showAdminShell && <Nav />}
            {isFacturaRapida
              ? <div>{children}</div>
              : showAdminShell
                ? <main className="pb-20 md:pb-0">{children}</main>
                : <>{children}</>
            }
            <Toaster richColors position="top-right" />
            {showAdminShell && (
              <div className="no-print fixed bottom-3 left-3 z-40 select-none pointer-events-none flex items-center gap-2">
                <div className="h-10 w-10 rounded-full overflow-hidden shadow-md ring-2 ring-white opacity-80 shrink-0">
                  <img src="/roipos-logo-180x180.png" alt="ROIPOS" className="h-full w-full object-cover" />
                </div>
                <span
                  className="text-sm font-semibold tracking-tight opacity-70 drop-shadow-sm"
                  style={{ fontFamily: "'Inter', sans-serif", color: '#4338ca' }}
                >
                  ROIPOS
                </span>
              </div>
            )}
          </PlanProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
