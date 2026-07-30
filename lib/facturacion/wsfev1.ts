import { Agent as HttpsAgent, request as httpsRequest } from 'https'
import type { FacturacionInput, ErrorFacturacion } from './types'

const WSFE_ENDPOINT = {
  homo: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx',
  prod: 'https://servicios1.afip.gov.ar/wsfev1/service.asmx',
}

interface Auth {
  token: string
  sign: string
  cuit: string
}

// Extrae el contenido de una etiqueta XML (primera ocurrencia, ignora namespace)
function xmlTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, 'i'))
  return m?.[1]?.trim() ?? ''
}

// Extrae todas las ocurrencias de una etiqueta
function xmlTags(xml: string, tag: string): string[] {
  const re = new RegExp(`<(?:[\\w]+:)?${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[\\w]+:)?${tag}>`, 'gi')
  const results: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) results.push(m[1].trim())
  return results
}

function wsfeFetch(soapBody: string, ambiente: 'homo' | 'prod', action: string): Promise<string> {
  const url = WSFE_ENDPOINT[ambiente]
  console.log('[ARCA-WSFE] →', action, url)

  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const bodyBuf = Buffer.from(soapBody, 'utf-8')
    // servicios1.afip.gov.ar usa DH keys débiles rechazadas por OpenSSL moderno — SECLEVEL=0 las permite
    const agent = new HttpsAgent({ ciphers: 'DEFAULT@SECLEVEL=0' })

    const req = httpsRequest(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'text/xml; charset=utf-8',
          'SOAPAction': `http://ar.gov.afip.dif.FEV1/${action}`,
          'Content-Length': bodyBuf.length,
        },
        agent,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', (c: Buffer) => chunks.push(c))
        res.on('end', () => {
          const xml = Buffer.concat(chunks).toString('utf-8')
          if ((res.statusCode ?? 0) >= 400) {
            console.error('[ARCA-WSFE] HTTP', res.statusCode, xml.slice(0, 600))
            reject(new Error(`WSFE HTTP ${res.statusCode}: ${xml.slice(0, 300)}`))
          } else {
            console.log('[ARCA-WSFE] ✓', action, 'len:', xml.length)
            resolve(xml)
          }
        })
      }
    )

    req.on('error', (err: Error) => {
      console.error('[ARCA-WSFE] Request error:', String(err))
      reject(err)
    })

    req.setTimeout(30000, () => {
      req.destroy()
      reject(new Error('WSFE timeout 30s'))
    })

    req.write(bodyBuf)
    req.end()
  })
}

function authXml(auth: Auth): string {
  const cuit = auth.cuit.replace(/-/g, '')
  return `<ar:Auth><ar:Token>${auth.token}</ar:Token><ar:Sign>${auth.sign}</ar:Sign><ar:Cuit>${cuit}</ar:Cuit></ar:Auth>`
}

const AR_NS = 'xmlns:ar="http://ar.gov.afip.dif.FEV1/"'

export async function obtenerUltimoNroComprobante(
  auth: Auth,
  puntoVenta: number,
  tipoCbte: number,
  ambiente: 'homo' | 'prod'
): Promise<number> {
  if (process.env.ARCA_MOCK === 'true') return 0

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ${AR_NS}>
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECompUltimoAutorizado>
      ${authXml(auth)}
      <ar:PtoVta>${puntoVenta}</ar:PtoVta>
      <ar:CbteTipo>${tipoCbte}</ar:CbteTipo>
    </ar:FECompUltimoAutorizado>
  </soapenv:Body>
</soapenv:Envelope>`

  console.log('[ARCA-WSFE] FECompUltimoAutorizado PtoVta:', puntoVenta, 'CbteTipo:', tipoCbte, 'CUIT:', auth.cuit.replace(/-/g,''))
  const xml = await wsfeFetch(soapBody, ambiente, 'FECompUltimoAutorizado')
  console.log('[ARCA-WSFE] FECompUltimoAutorizado respuesta:', xml.slice(0, 800))

  // Verificar errores
  const errContent = xmlTag(xmlTag(xml, 'Errors'), 'Err')
  if (errContent) {
    const code = Number(xmlTag(errContent, 'Code'))
    const msg  = xmlTag(errContent, 'Msg')
    console.error('[ARCA-WSFE] Error:', code, msg)
    const err: ErrorFacturacion = { categoria: 'arca', mensaje: msg, codigoAfip: code || undefined }
    throw err
  }

  return Number(xmlTag(xml, 'CbteNro') || '0')
}

export async function solicitarCAE(
  auth: Auth,
  input: FacturacionInput,
  nroComprobante: number,
  ambiente: 'homo' | 'prod'
): Promise<{ cae: string; caeVto: string; nroCbte: number; rawResponse: unknown }> {
  if (process.env.ARCA_MOCK === 'true') {
    const mockCae = '12345678901234'
    const mockVto = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 10).replace(/-/g, '')
    return { cae: mockCae, caeVto: mockVto, nroCbte: nroComprobante, rawResponse: { mock: true } }
  }

  const docTipo = input.receptor.cuit ? 80 : 99
  const docNro  = input.receptor.cuit ? input.receptor.cuit.replace(/-/g, '') : '0'

  // Concepto 2 o 3 (servicios) exige FchServDesde, FchServHasta y FchVtoPago.
  // Se deriva del mes de la fecha del comprobante.
  const concepto = input.comprobante.concepto
  let servicioXml = ''
  if (concepto === 2 || concepto === 3) {
    const fecha = input.comprobante.fecha // YYYYMMDD
    const year  = parseInt(fecha.slice(0, 4))
    const month = parseInt(fecha.slice(4, 6))
    const desde = `${fecha.slice(0, 6)}01`
    const lastDay = new Date(year, month, 0).getDate()
    const hasta = `${fecha.slice(0, 6)}${String(lastDay).padStart(2, '0')}`
    servicioXml = `
            <ar:FchServDesde>${desde}</ar:FchServDesde>
            <ar:FchServHasta>${hasta}</ar:FchServHasta>
            <ar:FchVtoPago>${hasta}</ar:FchVtoPago>`
  }

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" ${AR_NS}>
  <soapenv:Header/>
  <soapenv:Body>
    <ar:FECAESolicitar>
      ${authXml(auth)}
      <ar:FeCAEReq>
        <ar:FeCabReq>
          <ar:CantReg>1</ar:CantReg>
          <ar:PtoVta>${input.emisor.puntoVenta}</ar:PtoVta>
          <ar:CbteTipo>11</ar:CbteTipo>
        </ar:FeCabReq>
        <ar:FeDetReq>
          <ar:FECAEDetRequest>
            <ar:Concepto>${concepto}</ar:Concepto>
            <ar:DocTipo>${docTipo}</ar:DocTipo>
            <ar:DocNro>${docNro}</ar:DocNro>
            <ar:CbteDesde>${nroComprobante}</ar:CbteDesde>
            <ar:CbteHasta>${nroComprobante}</ar:CbteHasta>
            <ar:CbteFch>${input.comprobante.fecha}</ar:CbteFch>
            <ar:ImpTotal>${input.comprobante.importeTotal}</ar:ImpTotal>
            <ar:ImpTotConc>0</ar:ImpTotConc>
            <ar:ImpNeto>${input.comprobante.importeTotal}</ar:ImpNeto>
            <ar:ImpOpEx>0</ar:ImpOpEx>
            <ar:ImpIVA>0</ar:ImpIVA>
            <ar:ImpTrib>0</ar:ImpTrib>
            <ar:MonId>PES</ar:MonId>
            <ar:MonCotiz>1</ar:MonCotiz>${servicioXml}
          </ar:FECAEDetRequest>
        </ar:FeDetReq>
      </ar:FeCAEReq>
    </ar:FECAESolicitar>
  </soapenv:Body>
</soapenv:Envelope>`

  const xml = await wsfeFetch(soapBody, ambiente, 'FECAESolicitar')

  const detXml  = xmlTag(xml, 'FECAEDetResponse')
  const resultado = xmlTag(detXml, 'Resultado') || xmlTag(xml, 'Resultado') || 'R'
  const cae     = xmlTag(detXml, 'CAE')
  const caeVto  = xmlTag(detXml, 'CAEFchVto')
  const nroCbte = Number(xmlTag(detXml, 'CbteDesde') || String(nroComprobante))

  // Observaciones del comprobante
  const obsItems = xmlTags(xmlTag(detXml, 'Observaciones'), 'Obs')
  const obs = obsItems.map(o => ({ code: Number(xmlTag(o, 'Code')), msg: xmlTag(o, 'Msg') }))

  // Errores generales
  const errItems = xmlTags(xmlTag(xml, 'Errors'), 'Err')
  const errs = errItems.map(e => ({ code: Number(xmlTag(e, 'Code')), msg: xmlTag(e, 'Msg') }))

  if (resultado !== 'A') {
    const all = [...obs, ...errs]
    const err: ErrorFacturacion = {
      categoria: 'arca',
      mensaje: all.length
        ? all.map(o => o.msg).join('; ')
        : `ARCA rechazó el comprobante (Resultado: ${resultado})`,
      codigoAfip: all[0]?.code,
    }
    throw err
  }

  if (!cae || !caeVto) {
    const err: ErrorFacturacion = {
      categoria: 'arca',
      mensaje: 'ARCA aprobó pero no retornó CAE completo',
      detalle: xml.slice(0, 500),
    }
    throw err
  }

  return { cae, caeVto, nroCbte, rawResponse: { xml: xml.slice(0, 2000) } }
}
