import type { Metadata } from 'next'

export const metadata: Metadata = {
  // Meta tag de verificación de Pinterest
  // Aparece en el <head> de todas las páginas bajo /tienda
  other: {
    'p:domain_verify': 'a4275ed5f962b5ca74b4a1049334d769',
  },
}

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
