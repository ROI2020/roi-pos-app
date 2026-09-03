/**
 * lib/proxy-image.ts
 *
 * Helper para envolver URLs de CDN externas (CJ/AliExpress) en nuestra
 * propia ruta proxy, ocultando la URL de origen al usuario final.
 *
 * Uso: toProxyUrl(cdnUrl)  →  /api/images/proxy?u=<base64url>
 *
 * Encoding: btoa() + conversión manual a base64url.
 *   - btoa() es API nativa en browser Y en Node.js 16+: sin polyfills, sin Buffer.
 *   - base64url oculta la URL de CJ (no es decodificable a simple vista).
 *   - El route del proxy (server-only) decodifica con Buffer.from(u, 'base64url').
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
 * Convierte un string a base64url usando btoa (compatible browser + Node.js 16+).
 * base64url = base64 sin padding, con - en lugar de + y _ en lugar de /
 */
function toBase64Url(str: string): string {
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g,  '')
}

/**
 * Envuelve una URL de CDN en nuestra ruta proxy.
 * Si no es una URL CDN conocida, la devuelve sin modificar.
 * Si es null/undefined, devuelve null.
 */
export function toProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (!isCDNUrl(url)) return url
  return `/api/images/proxy?u=${toBase64Url(url)}`
}

/**
 * Envuelve un array de URLs de CDN en proxy URLs.
 */
export function toProxyUrls(urls: string[]): string[] {
  return urls.map(u => toProxyUrl(u) ?? u)
}
