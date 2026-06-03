import type { Metadata } from 'next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Nav from '@/components/nav'
import './globals.css'

export const metadata: Metadata = {
  title: 'ROIPOS',
  description: 'Sistema de Punto de Venta',
  icons: {
    icon: '/favicon.png',
    apple: '/roipos-logo-180x180.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <Nav />
          <main className="pb-20 md:pb-0">
            {children}
          </main>
          <Toaster richColors position="top-right" />
          {/* Logo ROIPOS — esquina inferior izquierda */}
          <div className="fixed bottom-3 left-3 z-40 select-none pointer-events-none flex items-center gap-2">
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
        </ThemeProvider>
      </body>
    </html>
  )
}
