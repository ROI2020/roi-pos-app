import type { Metadata } from 'next'
import { CartProvider } from './_context/cart-context'

export const metadata: Metadata = {
  other: {
    'p:domain_verify': 'a4275ed5f962b5ca74b4a1049334d769',
  },
}

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return <CartProvider>{children}</CartProvider>
}
