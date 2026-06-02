import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import Nav from '@/components/nav'
import './globals.css'

const _geist = Geist({ subsets: ['latin'] })
const _geistMono = Geist_Mono({ subsets: ['latin'] })

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
          {children}
          <Toaster richColors position="top-right" />
          {/* Logo ROIPOS — esquina inferior izquierda */}
          <div className="fixed bottom-3 left-3 z-40 select-none pointer-events-none">
            <div className="h-10 w-10 rounded-full overflow-hidden shadow-md ring-2 ring-white opacity-80">
              <img src="/roipos-logo-180x180.png" alt="ROIPOS" className="h-full w-full object-cover" />
            </div>
          </div>
        </ThemeProvider>
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
