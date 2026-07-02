import { create } from 'xmlbuilder2'
import { createClientAsync as soapCreateClient } from 'node-soap'
import pool from '@/lib/db'
import { firmarTRA } from './xml'

const WSAA_WSDL = {
  homo: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
  prod: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
}

/**
 * Normaliza un PEM que puede llegar en distintos formatos desde variables de entorno:
 *  - Formato correcto con saltos reales            → sin cambios
 *  - Con \n literal (Netlify, GitHub Actions)      → convierte a saltos reales
 *  - Con \r\n literal (Windows)                    → convierte a saltos reales
 *  - Una sola línea sin cabecera (base64 puro)     → reconstruye con cabecera
 *  - Una sola línea con cabecera pero sin saltos   → reformatea con líneas de 64 chars
 */
function normalizePem(raw: string, header: string): string {
  // Paso 1: reemplazar secuencias literales \n y \r\n
  let pem = raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').trim()

  // Paso 2: si todavía no tiene saltos de línea, reconstruir desde base64 puro
  if (!pem.includes('\n')) {
    const begin = `-----BEGIN ${header}-----`
    const end   = `-----END ${header}-----`
    // Extraer solo los caracteres base64 (sin cabecera ni espacios)
    const b64   = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    const lines = b64.match(/.{1,64}/g) ?? []
    pem = `${begin}\n${lines.join('\n')}\n${end}`
  }

  return pem
}

// Modelo B: certificado único de ROISOL cargado en variables de entorno.
function getCertificadoRoisol(): { certPem: string; keyPem: string } {
  const rawCert = process.env.ARCA_CERT_PEM ?? ''
  const rawKey  = process.env.ARCA_KEY_PEM  ?? ''
  if (!rawCert || !rawKey) {
    throw new Error('Certificado ARCA no configurado. Definir ARCA_CERT_PEM y ARCA_KEY_PEM.')
  }
  const keyHeader = rawKey.includes('RSA') ? 'RSA PRIVATE KEY' : 'PRIVATE KEY'
  const certPem   = normalizePem(rawCert, 'CERTIFICATE')
  const keyPem    = normalizePem(rawKey, keyHeader)

  // Log de diagnóstico — confirma el formato al arrancar (visible en Netlify → Functions → Log)
  console.log('[ARCA-PEM] cert primera línea:', certPem.split('\n')[0])
  console.log('[ARCA-PEM] key primera línea:', keyPem.split('\n')[0])
  console.log('[ARCA-PEM] cert #líneas:', certPem.split('\n').length)

  return { certPem, keyPem }
}

// Obtiene un token WSAA vigente para el CUIT dado.
// Prioridad: ARCA_MOCK > cache DB > autenticación real.
export async function obtenerToken(
  cuit: string,
  ambiente: 'homo' | 'prod'
): Promise<{ token: string; sign: string }> {
  console.log('[ARCA-WSAA] obtenerToken llamado, cuit:', cuit, 'ambiente:', ambiente, 'MOCK:', process.env.ARCA_MOCK)
  if (process.env.ARCA_MOCK === 'true') {
    return { token: 'MOCK_TOKEN_HOMO', sign: 'MOCK_SIGN_HOMO' }
  }

  // 1. Buscar token vigente en DB — incluye ambiente para no mezclar homo/prod
  // Non-fatal: si la columna ambiente no existe todavía, continuamos sin cache
  try {
    const cached = await pool.query<{ token: string; sign: string }>(
      `SELECT token, sign
       FROM wsaa_tokens
       WHERE cuit = $1 AND service = 'wsfe' AND ambiente = $2 AND activo = true
         AND expiration_time > NOW() + INTERVAL '10 minutes'`,
      [cuit, ambiente]
    )
    if (cached.rows[0]) return cached.rows[0]
  } catch (cacheErr) {
    console.warn('[ARCA-WSAA] Cache lookup falló (puede ser schema issue):', String(cacheErr))
    // Continuar sin cache — llamamos a WSAA de todas formas
  }

  // 2. Construir TRA XML
  const now = new Date()
  const exp = new Date(now.getTime() + 12 * 60 * 60 * 1000) // 12 h

  const traXml = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('loginTicketRequest', { version: '1.0' })
      .ele('header')
        .ele('uniqueId').txt(String(Math.floor(now.getTime() / 1000))).up()
        .ele('generationTime').txt(now.toISOString()).up()
        .ele('expirationTime').txt(exp.toISOString()).up()
      .up()
      .ele('service').txt('wsfe').up()
    .end({ prettyPrint: false })

  // 3. Firmar TRA
  const { certPem, keyPem } = getCertificadoRoisol()
  let cms: string
  try {
    cms = firmarTRA(traXml, certPem, keyPem)
  } catch (signErr) {
    console.error('[ARCA-WSAA] Error firmando TRA:', signErr)
    throw new Error(`Error firmando TRA con el certificado: ${String(signErr)}`)
  }

  // 4. Llamar LoginCms en WSAA (con timeout de 20 s para conexiones internacionales)
  console.log(`[ARCA-WSAA] Conectando a WSAA ${ambiente} para CUIT ${cuit}…`)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let client: any
  try {
    client = await soapCreateClient(WSAA_WSDL[ambiente], {
      wsdl_options: { timeout: 20000 },
    })
  } catch (wsdlErr) {
    console.error(`[ARCA-WSAA] No se pudo cargar WSDL ${ambiente}:`, wsdlErr)
    throw new Error(`No se pudo cargar WSDL WSAA (${ambiente}): ${String(wsdlErr)}`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result]: any[] = await (client as any).LoginCmsAsync({ in0: cms })
  const responseXml: string = result?.LoginCmsReturn ?? ''
  console.log('[ARCA-WSAA] LoginCms OK, longitud respuesta:', responseXml.length)

  // 5. Extraer token y sign
  const token = responseXml.match(/<token>([\s\S]*?)<\/token>/)?.[1]?.trim()
  const sign  = responseXml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]?.trim()
  if (!token || !sign) {
    throw new Error(`WSAA no retornó token/sign. Respuesta: ${responseXml.slice(0, 300)}`)
  }

  // 6. Persistir en DB — non-fatal: si falla el cache, el token sigue siendo válido
  console.log('[ARCA-WSAA] Intentando guardar token en DB para CUIT:', cuit, 'ambiente:', ambiente)
  try {
    await pool.query(
      `DELETE FROM wsaa_tokens WHERE cuit = $1 AND service = 'wsfe' AND ambiente = $2`,
      [cuit, ambiente]
    )
    console.log('[ARCA-WSAA] DELETE OK, ejecutando INSERT...')
    const insRes = await pool.query(
      `INSERT INTO wsaa_tokens (cuit, service, token, sign, generation_time, expiration_time, activo, ambiente)
       VALUES ($1, 'wsfe', $2, $3, $4, $5, true, $6)
       RETURNING id`,
      [cuit, token, sign, now, exp, ambiente]
    )
    console.log('[ARCA-WSAA] Token guardado en DB, id:', insRes.rows[0]?.id)
  } catch (dbErr) {
    console.error('[ARCA-WSAA] ERROR guardando token:', String(dbErr))
  }

  return { token, sign }
}
