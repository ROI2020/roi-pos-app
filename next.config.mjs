/** @type {import('next').NextConfig} */
const nextConfig = {
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
  },
}

export default nextConfig
