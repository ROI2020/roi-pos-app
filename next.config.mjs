import { readFileSync } from 'fs'
import createNextIntlPlugin from 'next-intl/plugin'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// next-intl v4 requiere el plugin para conectar i18n/request.ts con Next.js.
// El plugin no modifica el ruteo — solo habilita el contexto server-side de
// next-intl necesario para SSR de componentes con useTranslations.
const withNextIntl = createNextIntlPlugin('./i18n/request.ts')

// ── Content-Security-Policy para rutas de la tienda pública ─────────────────
// PayPal Smart Buttons requiere 'unsafe-inline' y frames de paypal.com.
// El resto del sitio (panel admin) no tiene CSP para no interferir con el POS.
const TIENDA_CSP = [
  "default-src 'self'",
  // PayPal inyecta scripts inline; unsafe-inline es requerido por su SDK
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.paypal.com https://www.paypalobjects.com https://*.paypal.com",
  // Frames del modal de pago PayPal
  "frame-src 'self' https://www.paypal.com https://*.paypal.com",
  // Imágenes de productos (CDN CJ proxiado por /api/images/proxy) + PayPal logos
  "img-src 'self' data: blob: https://www.paypal.com https://www.paypalobjects.com",
  // Estilos: tema custom inline + Google Fonts
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // Fetch a nuestras APIs + PayPal REST API (sandbox y live)
  "connect-src 'self' https://www.paypal.com https://*.paypal.com https://api-m.sandbox.paypal.com https://api-m.paypal.com",
].join('; ')

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Tienda pública: checkout, catálogo, tracking, etc.
        source: '/(tienda|store)/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: TIENDA_CSP },
          { key: 'X-Content-Type-Options',  value: 'nosniff' },
          { key: 'X-Frame-Options',         value: 'SAMEORIGIN' },
        ],
      },
    ]
  },
  // Paquetes que no pueden ser bundleados por webpack (usan CommonJS, binarios nativos, etc.)
  // sharp y @img/* son arrastrados por quagga2 → ndarray-pixels en el path Node.js del scanner
  serverExternalPackages: ['node-soap', 'sharp'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Oculta el indicador "N" de desarrollo de Next.js
  devIndicators: false,
  // Exponer CUIT de ROISOL al cliente para mostrarlo en las instrucciones de delegación
  env: {
    NEXT_PUBLIC_ARCA_CUIT_ROISOL: process.env.ARCA_CUIT_ROISOL,
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_DATE: new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', ''),
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // node-soap usa require dinámico internamente y no puede ser bundleado
      config.externals = Array.isArray(config.externals)
        ? [...config.externals, 'node-soap']
        : [config.externals, 'node-soap'].filter(Boolean)
    }

    // sharp y @img/* (binarios nativos .so / .node) son arrastrados por
    // @ericblade/quagga2 → ndarray-pixels → sharp en su path de Node.js.
    // Webpack no puede parsear binarios nativos, así que los marcamos externos
    // tanto para el bundle del cliente como del servidor.
    const nativeExternals = ['sharp', /^@img\//]
    config.externals = Array.isArray(config.externals)
      ? [...config.externals, ...nativeExternals]
      : [config.externals, ...nativeExternals].filter(Boolean)

    return config
  },
}

export default withNextIntl(nextConfig)
