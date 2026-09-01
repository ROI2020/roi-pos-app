/**
 * lib/proxy-image.ts
 *
 * Helper para envolver URLs de CDN externas (CJ/AliExpress) en nuestra
 * propia ruta proxy, evitando que el browser vea URLs de alicdn.com
 * y revelando así el proveedor dropshipping.
 *
 * Uso: toProxyUrl(cdnUrl)  →  /api/images/proxy?u=BASE64URL
 * URLs que no son de CDN conocidas se devuelven sin modificar.
 */

/** Sufijos de host permitidos para proxying */
const CDN_HOSTS = [
  'alicdn.com',
  'cjdropshipping.com',
  'cjimg.net',
]

function isCDNUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url)
    return CDN_HOSTS.some(h => hostname === h || hostname.endsWith(`.${h}`))
  } catch {
    return false
  }
}

/**
 * Envuelve una URL de CDN en nuestra ruta proxy.
 * Si no es una URL CDN conocida, la devuelve sin modificar.
 * Si es null/undefined, devuelve null.
 */
export function toProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (!isCDNUrl(url)) return url
  const encoded = Buffer.from(url, 'utf-8').toString('base64url')
  return `/api/images/proxy?u=${encoded}`
}

/**
 * Envuelve un array de URLs de CDN en proxy URLs.
 */
export function toProxyUrls(urls: string[]): string[] {
  return urls.map(u => toProxyUrl(u) ?? u)
}
