import { readFileSync } from 'fs'
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

/** @type {import('next').NextConfig} */
const nextConfig = {
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

export default nextConfig
