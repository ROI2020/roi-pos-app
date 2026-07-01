import { create } from 'xmlbuilder2'
import * as soap from 'node-soap'
import pool from '@/lib/db'
import { firmarTRA } from './xml'

const WSAA_WSDL = {
  homo: 'https://wsaahomo.afip.gov.ar/ws/services/LoginCms?wsdl',
  prod: 'https://wsaa.afip.gov.ar/ws/services/LoginCms?wsdl',
}

// Modelo B: certificado único de ROISOL cargado en variables de entorno.
// El `cuit` sigue siendo necesario para el TRA y para el cache en wsaa_tokens
// (cada cliente tiene su propio token aunque compartan el mismo cert firmante).
function getCertificadoRoisol(): { certPem: string; keyPem: string } {
  const certPem = process.env.ARCA_CERT_PEM
  const keyPem  = process.env.ARCA_KEY_PEM
  if (!certPem || !keyPem) {
    throw new Error(
      'Certificado ARCA no configurado. ' +
      'Definir ARCA_CERT_PEM y ARCA_KEY_PEM en variables de entorno.'
    )
  }
  return { certPem, keyPem }
}

// Obtiene un token WSAA vigente para el CUIT dado.
// Prioridad: ARCA_MOCK > cache DB > autenticación real.
export async function obtenerToken(
  cuit: string,
  ambiente: 'homo' | 'prod'
): Promise<{ token: string; sign: string }> {
  if (process.env.ARCA_MOCK === 'true') {
    return { token: 'MOCK_TOKEN_HOMO', sign: 'MOCK_SIGN_HOMO' }
  }

  // 1. Buscar token vigente en DB (expira en más de 10 minutos)
  const cached = await pool.query<{ token: string; sign: string }>(
    `SELECT token, sign
     FROM wsaa_tokens
     WHERE cuit = $1 AND service = 'wsfe' AND activo = true
       AND expiration_time > NOW() + INTERVAL '10 minutes'`,
    [cuit]
  )
  if (cached.rows[0]) return cached.rows[0]

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

  // 3. Firmar TRA con el certificado de ROISOL y obtener CMS en base64
  const { certPem, keyPem } = getCertificadoRoisol()
  const cms = firmarTRA(traXml, certPem, keyPem)

  // 4. Llamar LoginCms en WSAA
  const client = await soap.createClientAsync(WSAA_WSDL[ambiente])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result]: any[] = await (client as any).LoginCmsAsync({ in0: cms })
  const responseXml: string = result?.LoginCmsReturn ?? ''

  // 5. Extraer token y sign con regex (el schema de LoginTicketResponse no cambia)
  const token = responseXml.match(/<token>([\s\S]*?)<\/token>/)?.[1]?.trim()
  const sign  = responseXml.match(/<sign>([\s\S]*?)<\/sign>/)?.[1]?.trim()

  if (!token || !sign) {
    throw new Error(`WSAA no retornó token/sign. Respuesta: ${responseXml.slice(0, 300)}`)
  }

  // 6. Persistir en DB con UPSERT por (cuit, service)
  await pool.query(
    `INSERT INTO wsaa_tokens (cuit, service, token, sign, generation_time, expiration_time, activo)
     VALUES ($1, 'wsfe', $2, $3, $4, $5, true)
     ON CONFLICT (cuit, service) DO UPDATE SET
       token           = EXCLUDED.token,
       sign            = EXCLUDED.sign,
       generation_time = EXCLUDED.generation_time,
       expiration_time = EXCLUDED.expiration_time,
       activo          = true`,
    [cuit, token, sign, now, exp]
  )

  return { token, sign }
}
