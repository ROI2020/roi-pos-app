import { createClientAsync as soapCreateClient } from 'node-soap'
import type { Client } from 'node-soap'
import { parsearRespuestaFE } from './xml'
import type { FacturacionInput, ErrorFacturacion } from './types'

const WSFEV1_WSDL = {
  homo: 'https://wswhomo.afip.gov.ar/wsfev1/service.asmx?WSDL',
  prod: 'https://wsfev1.afip.gov.ar/service.asmx?WSDL',
}

// Cache de clientes SOAP por ambiente para evitar re-fetch del WSDL por request
let _clientHomo: Client | null = null
let _clientProd: Client | null = null

async function getClient(ambiente: 'homo' | 'prod'): Promise<Client> {
  if (ambiente === 'homo') {
    _clientHomo ??= await soapCreateClient(WSFEV1_WSDL.homo)
    return _clientHomo
  }
  _clientProd ??= await soapCreateClient(WSFEV1_WSDL.prod)
  return _clientProd
}

interface Auth {
  token: string
  sign: string
  cuit: string  // sin guiones
}

// Consulta el último nro de comprobante autorizado para un punto de venta + tipo.
export async function obtenerUltimoNroComprobante(
  auth: Auth,
  puntoVenta: number,
  tipoCbte: number,
  ambiente: 'homo' | 'prod'
): Promise<number> {
  if (process.env.ARCA_MOCK === 'true') return 0

  const client = await getClient(ambiente)
  const cuitSinGuiones = auth.cuit.replace(/-/g, '')

  const params = {
    Auth: { Token: auth.token, Sign: auth.sign, Cuit: cuitSinGuiones },
    PtoVta: puntoVenta,
    CbteTipo: tipoCbte,
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result]: any[] = await (client as any).FECompUltimoAutorizadoAsync(params)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res: any = result?.FECompUltimoAutorizadoResult ?? result

  const errRaw = res?.Errors?.Err
  if (errRaw) {
    const arr = Array.isArray(errRaw) ? errRaw : [errRaw]
    const err: ErrorFacturacion = {
      categoria: 'arca',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mensaje: arr.map((e: any) => e.Msg).join('; '),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      codigoAfip: arr[0] ? Number((arr[0] as any).Code) : undefined,
    }
    throw err
  }

  return Number(res?.CbteNro ?? 0)
}

// Solicita CAE a ARCA para un comprobante. Retorna CAE, fecha vto y nro asignado.
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

  const client = await getClient(ambiente)
  const cuitSinGuiones = input.emisor.cuit.replace(/-/g, '')

  // DocTipo y DocNro según condición del receptor (código AFIP)
  const docTipo = input.receptor.cuit ? 80 : 99
  const docNro  = input.receptor.cuit ? input.receptor.cuit.replace(/-/g, '') : '0'

  // Para monotributista: todo el importe es neto, IVA = 0
  const params = {
    Auth: { Token: auth.token, Sign: auth.sign, Cuit: cuitSinGuiones },
    FeCAEReq: {
      FeCabReq: {
        CantReg:  1,
        PtoVta:   input.emisor.puntoVenta,
        CbteTipo: 11, // Factura B
      },
      FeDetReq: {
        FECAEDetRequest: {
          Concepto:    input.comprobante.concepto,
          DocTipo:     docTipo,
          DocNro:      docNro,
          CbteDesde:   nroComprobante,
          CbteHasta:   nroComprobante,
          CbteFch:     input.comprobante.fecha,
          ImpTotal:    input.comprobante.importeTotal,
          ImpTotConc:  0,
          ImpNeto:     input.comprobante.importeTotal, // monotributista: todo es neto
          ImpOpEx:     0,
          ImpIVA:      0,
          ImpTrib:     0,
          MonId:       'PES',
          MonCotiz:    1,
        },
      },
    },
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [result]: any[] = await (client as any).FECAESolicitarAsync(params)
  const parsed = parsearRespuestaFE(result)

  if (parsed.resultado !== 'A') {
    const obs = parsed.obs ?? []
    const primerCod = obs[0]?.code
    const err: ErrorFacturacion = {
      categoria: 'arca',
      mensaje: obs.length
        ? obs.map(o => o.msg).join('; ')
        : `ARCA rechazó el comprobante (Resultado: ${parsed.resultado})`,
      codigoAfip: primerCod,
    }
    throw err
  }

  if (!parsed.cae || !parsed.caeVto || parsed.nroCbte === undefined) {
    const err: ErrorFacturacion = {
      categoria: 'arca',
      mensaje: 'ARCA aprobó pero no retornó CAE completo',
      detalle: JSON.stringify(result),
    }
    throw err
  }

  return {
    cae: parsed.cae,
    caeVto: parsed.caeVto,
    nroCbte: parsed.nroCbte,
    rawResponse: result,
  }
}
