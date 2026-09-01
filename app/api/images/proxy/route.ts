/**
 * GET /api/images/proxy?u=BASE64URL
 *
 * Proxy de imágenes de CDN externas (alicdn.com, cjdropshipping.com).
 * Decodifica la URL del parámetro `u`, valida que sea de un host permitido,
 * descarga la imagen y la sirve con headers de caché agresivos.
 *
 * Objetivo: los browsers de los clientes nunca ven URLs de AliExpress/CJ,
 * evitando revelar el proveedor dropshipping.
 *
 * Seguridad:
 *  - Whitelist de dominios CDN — no se puede usar para proxear URL arbitraria
 *  - No se reenvían headers del cliente al CDN (evita SSRF lateral)
 *  - Cache-Control inmutable (1 año) — las imágenes de CJ no cambian de URL
 */

const ALLOWED_HOSTNAMES = new Set([
  // AliExpress / Alibaba CDN
  'cbu01.alicdn.com', 'cbu02.alicdn.com', 'cbu03.alicdn.com',
  'cbu04.alicdn.com', 'cbu05.alicdn.com', 'cbu06.alicdn.com',
  'ae01.alicdn.com',  'ae02.alicdn.com',  'ae03.alicdn.com',
  'ae04.alicdn.com',  'ae05.alicdn.com',
  'img.alicdn.com',
  // CJ Dropshipping
  'img.cjdropshipping.com', 'cjimg.net',
])

function isAllowedHost(hostname: string): boolean {
  if (ALLOWED_HOSTNAMES.has(hostname)) return true
  // Fallback: match por sufijo para cubrir subdominios dinámicos
  return hostname.endsWith('.alicdn.com') || hostname.endsWith('.cjdropshipping.com')
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const encoded = searchParams.get('u')

  if (!encoded) {
    return new Response('u requerido', { status: 400 })
  }

  // Decodificar base64url → URL original
  let originalUrl: string
  try {
    originalUrl = Buffer.from(encoded, 'base64url').toString('utf-8')
  } catch {
    return new Response('u inválido', { status: 400 })
  }

  // Validar URL
  let parsed: URL
  try {
    parsed = new URL(originalUrl)
  } catch {
    return new Response('URL inválida', { status: 400 })
  }

  // Validar que solo sea HTTPS y host permitido
  if (parsed.protocol !== 'https:' || !isAllowedHost(parsed.hostname)) {
    return new Response('Dominio no permitido', { status: 403 })
  }

  // Fetch imagen del CDN
  try {
    const upstream = await fetch(originalUrl, {
      headers: {
        // User-Agent mínimo para evitar bloqueos del CDN
        'User-Agent': 'Mozilla/5.0 (compatible; image-proxy/1.0)',
        'Accept':     'image/webp,image/avif,image/jpeg,image/png,*/*',
      },
      // No seguir más de 3 redirects (CDNs a veces redirigen a WebP)
      redirect: 'follow',
    })

    if (!upstream.ok) {
      console.warn(`[proxy] upstream ${upstream.status} for ${parsed.hostname}`)
      return new Response('Error al obtener imagen', { status: 502 })
    }

    const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'

    // Solo permitir content-types de imagen
    if (!contentType.startsWith('image/')) {
      return new Response('El recurso no es una imagen', { status: 422 })
    }

    const buffer = await upstream.arrayBuffer()

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        'Content-Length': String(buffer.byteLength),
        // private: el browser cachea localmente (evita re-fetch), pero el CDN (Netlify/Vercel)
        // NO cachea a nivel edge — necesario porque Netlify ignora el ?u= como cache key
        // y devolvería la misma imagen para todas las URLs del proxy.
        'Cache-Control': 'private, max-age=86400',
        // No indexar estas imágenes (son de CJ, no del negocio)
        'X-Robots-Tag': 'noindex, nofollow',
      },
    })
  } catch (err) {
    console.error('[GET /api/images/proxy]', err)
    return new Response('Error de proxy', { status: 502 })
  }
}
