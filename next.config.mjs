import { readFileSync } from 'fs'
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // node-soap usa CommonJS y no puede ser bundleado por webpack — debe cargarse en runtime
  serverExternalPackages: ['node-soap'],
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
    return config
  },
}

export default nextConfig
