import { create } from 'xmlbuilder2'
import pool from '@/lib/db'
import { firmarTRA } from './xml'

const WSAA_ENDPOINT = {
  homo: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms',
  prod: 'https://wsaa.afip.gov.ar/ws/services/LoginCms',
}

function normalizePem(raw: string, header: string): string {
  let pem = raw.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').trim()
  if (!pem.includes('\n')) {
    const begin = `-----BEGIN ${header}-----`
    const end   = `-----END ${header}-----`
    const b64   = pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')
    const lines = b64.match(/.{1,64}/g) ?? []
    pem = `${begin}\n${lines.join('\n')}\n${end}`
  }
  return pem
}

function getCertificadoRoisol(): { certPem: string; keyPem: string } {
  const rawCert = process.env.ARCA_CERT_PEM ?? ''
  const rawKey  = process.env.ARCA_KEY_PEM  ?? ''
  if (!rawCert || !rawKey) {
    throw new Error('Certificado ARCA no configurado. Definir ARCA_CERT_PEM y ARCA_KEY_PEM.')
  }
  const keyHeader = rawKey.includes('RSA') ? 'RSA PRIVATE KEY' : 'PRIVATE KEY'
  const certPem   = normalizePem(rawCert, 'CERTIFICATE')
  const keyPem    = normalizePem(rawKey, keyHeader)

  console.log('[ARCA-PEM] cert primera línea:', certPem.split('\n')[0])
  console.log('[ARCA-PEM] key primera línea:', keyPem.split('\n')[0])
  console.log('[ARCA-PEM] cert #líneas:', certPem.split('\n').length)

  return { certPem, keyPem }
}

export async function obtenerToken(
  cuit: string,
  ambiente: 'homo' | 'prod'
): Promise<{ token: string; sign: string }> {
  console.log('[ARCA-WSAA] obtenerToken llamado, cuit:', cuit, 'ambiente:', ambiente, 'MOCK:', process.env.ARCA_MOCK)
  if (process.env.ARCA_MOCK === 'true') {
    return { token: 'MOCK_TOKEN_HOMO', sign: 'MOCK_SIGN_HOMO' }
  }

  // 1. Buscar token vigente en DB
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
    console.warn('[ARCA-WSAA] Cache lookup falló:', String(cacheErr))
  }

  // 2. Construir TRA XML
  const now = new Date()
  // generationTime 2 minutos atrás: compensa diferencias de reloj con servidores AFIP
  // AFIP rechaza timestamps "en el futuro" con un margen muy corto (~0-5 min)
  const genTime = new Date(now.getTime() - 2 * 60 * 1000)
  const exp     = new Date(now.getTime() + 12 * 60 * 60 * 1000)

  // Formato UTC sin milisegundos — el más compatible con Apache Axis de AFIP
  const toAfipDate = (d: Date) => d.toISOString().slice(0, 19) + 'Z'

  const traXml = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('loginTicketRequest', { version: '1.0' })
      .ele('header')
        .ele('uniqueId').txt(String(Math.floor(now.getTime() / 1000))).up()
        .ele('generationTime').txt(toAfipDate(genTime)).up()
        .ele('expirationTime').txt(toAfipDate(exp)).up()
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

  // 4. Llamar LoginCms vía SOAP directo (sin node-soap)
  console.log(`[ARCA-WSAA] Conectando a WSAA ${ambiente} para CUIT ${cuit}…`)
  // AFIP WSAA usa Apache Axis RPC/encoded — requiere encodingStyle y xsi:type en el parámetro
  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
  xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:ser="http://wsaa.view.sua.dvadac.desein.afip.gov.ar"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <soapenv:Header/>
  <soapenv:Body>
    <ser:loginCms soapenv:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
      <in0 xsi:type="xsd:string">${cms}</in0>
    </ser:loginCms>
  </soapenv:Body>
</soapenv:Envelope>`

  let responseXml: string
  try {
    const resp = await fetch(WSAA_ENDPOINT[ambiente], {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': '""',
      },
      body: soapBody,
      signal: AbortSignal.timeout(20000),
    })
    if (!resp.ok) {
      const errText = await resp.text()
      console.error('[ARCA-WSAA] Fault completo:', errText.slice(0, 1000))
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 500)}`)
    }
    responseXml = await resp.text()
    console.log('[ARCA-WSAA] LoginCms OK, longitud respuesta:', responseXml.length)
  } catch (fetchErr) {
    console.error(`[ARCA-WSAA] No se pudo conectar a WSAA ${ambiente}:`, fetchErr)
    throw new Error(`No se pudo conectar con WSAA (${ambiente}): ${String(fetchErr)}`)
  }

  // 5. Extraer token y sign
  // loginCmsReturn contiene el ticket XML como texto HTML-escapado — hay que decodificarlo
  const returnContent = responseXml.match(/<loginCmsReturn>([\s\S]*?)<\/loginCmsReturn>/)?.[1] ?? responseXml
  const ticketXml = returnContent
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
  const token = ticketXml.match(/<token>([\s\S]*?)<\/token>/)?.[1]?.trim()
  const sign  = ticketXml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]?.trim()
  if (!token || !sign) {
    throw new Error(`WSAA no retornó token/sign. Ticket: ${ticketXml.slice(0, 300)}`)
  }

  // 6. Persistir en DB — non-fatal
  console.log('[ARCA-WSAA] Intentando guardar token en DB para CUIT:', cuit, 'ambiente:', ambiente)
  try {
    await pool.query(
      `DELETE FROM wsaa_tokens WHERE cuit = $1 AND service = 'wsfe' AND ambiente = $2`,
      [cuit, ambiente]
    )
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
