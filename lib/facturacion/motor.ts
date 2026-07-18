import pool from '@/lib/db'
import { obtenerToken } from './wsaa'
import { obtenerUltimoNroComprobante, solicitarCAE } from './wsfev1'
import { adaptarDirecto } from './adapters/direct.adapter'
import type { FacturacionInput, FacturacionOutput, ErrorFacturacion } from './types'
// Códigos de error ARCA con mensajes en español
const ERRORES_ARCA: Record<number, string> = {
  10016: 'El comprobante ya fue autorizado anteriormente.',
  10040: 'El punto de venta no está habilitado para este CUIT.',
  10043: 'El CUIT no está autorizado a emitir este tipo de comprobante.',
  10148: 'Fecha de comprobante fuera del rango permitido.',
  600:   'Error interno de ARCA. Reintentá en unos minutos.',
  601:   'Servicio ARCA temporalmente no disponible.',
}

interface ConfigRow {
  cuit: string
  punto_venta: number
  razon_social: string
  condicion_iva: string
  ambiente: 'homo' | 'prod'
}

// Modelo B: certs en env vars — no hay nada que resolver desde DB
// getCertificadoRoisol() vive en wsaa.ts y se llama internamente en obtenerToken()

function mapearErrorArca(err: ErrorFacturacion): ErrorFacturacion {
  if (err.codigoAfip && ERRORES_ARCA[err.codigoAfip]) {
    return { ...err, mensaje: ERRORES_ARCA[err.codigoAfip] }
  }
  if (err.codigoAfip) {
    return {
      ...err,
      mensaje: `ARCA rechazó el comprobante (código ${err.codigoAfip}). Contactá soporte.`,
    }
  }
  return err
}

// Orquestador principal. Recibe FacturacionInput y retorna FacturacionOutput.
// No sabe de dónde vienen los datos ni qué sistema los originó.
export async function motorFacturacion(rawInput: FacturacionInput): Promise<FacturacionOutput> {
  // 1. Validar input
  const input = adaptarDirecto(rawInput)

  // 2. Leer config del emisor desde DB
  const cfgResult = await pool.query<ConfigRow>(
    `SELECT cuit, punto_venta, razon_social, condicion_iva, ambiente
     FROM facturacion_config
     WHERE cuit = $1 AND activo = true`,
    [input.emisor.cuit]
  )
  if (!cfgResult.rows.length) {
    const err: ErrorFacturacion = {
      categoria: 'validacion',
      mensaje: `No existe configuración ARCA activa para el CUIT ${input.emisor.cuit}`,
    }
    throw err
  }
  const cfg = cfgResult.rows[0]
  const ambiente = cfg.ambiente   // siempre del DB, no de env var global

  // 3. Obtener token WSAA (cert lo resuelve wsaa.ts desde ARCA_CERT_PEM / ARCA_KEY_PEM)
  const auth = await obtenerToken(input.emisor.cuit, ambiente)
  const authConCuit = { ...auth, cuit: input.emisor.cuit }

  // 4. Obtener último nro de comprobante y calcular el siguiente
  const ultimoNro = await obtenerUltimoNroComprobante(authConCuit, cfg.punto_venta, 11, ambiente)
  const nroComprobante = ultimoNro + 1

  // 5-6. Solicitar CAE a ARCA
  let cae: string, caeVto: string, nroCbte: number, rawResponse: unknown
  try {
    ;({ cae, caeVto, nroCbte, rawResponse } = await solicitarCAE(
      authConCuit,
      input,
      nroComprobante,
      ambiente
    ))
  } catch (e) {
    if ((e as ErrorFacturacion).categoria) {
      const mappedErr = mapearErrorArca(e as ErrorFacturacion)
      // Persistir intento fallido para debugging
      await persistirFactura({
        input,
        nroComprobante,
        estado: 'error',
        errorDetalle: mappedErr.mensaje,
        rawResponse: null,
      })
      throw mappedErr
    }
    const err: ErrorFacturacion = {
      categoria: 'red',
      mensaje: 'Error de red al comunicarse con ARCA.',
      detalle: String(e),
    }
    throw err
  }

  // 7. Parsear CAEFchVto de YYYYMMDD a ISO date string
  const caeVtoISO = `${caeVto.slice(0, 4)}-${caeVto.slice(4, 6)}-${caeVto.slice(6, 8)}`

  // 8. Persistir comprobante emitido
  const facturaId = await persistirFactura({
    input,
    nroComprobante: nroCbte,
    estado: 'emitida',
    cae,
    caeVto: caeVtoISO,
    rawResponse,
  })

  // 9. Retornar output
  return {
    cae,
    caeVencimiento: caeVtoISO,
    nroComprobante: nroCbte,
    facturaId,
    pdfUrl: `/api/facturacion/pdf/${facturaId}`,
  }
}

interface PersistirParams {
  input: FacturacionInput
  nroComprobante: number
  estado: 'emitida' | 'error'
  cae?: string
  caeVto?: string
  errorDetalle?: string
  rawResponse: unknown
}

async function persistirFactura(p: PersistirParams): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO facturas
       (venta_id, origen_sistema, cuit_emisor, punto_venta, tipo_cbte,
        nro_comprobante, fecha_cbte, cae, cae_vto,
        importe_total, receptor_cuit, receptor_nombre,
        estado, error_detalle, raw_request, raw_response,
        business_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
       (SELECT business_id FROM facturacion_config WHERE cuit = $3 AND activo = true LIMIT 1))
     RETURNING id`,
    [
      p.input.meta.origenId,
      p.input.meta.origenSistema,
      p.input.emisor.cuit,
      p.input.emisor.puntoVenta,
      11,
      p.nroComprobante,
      p.input.comprobante.fecha.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'),
      p.cae ?? null,
      p.caeVto ?? null,
      p.input.comprobante.importeTotal,
      p.input.receptor.cuit ?? null,
      p.input.receptor.razonSocial ?? null,
      p.estado,
      p.errorDetalle ?? null,
      JSON.stringify(p.input),
      p.rawResponse ? JSON.stringify(p.rawResponse) : null,
    ]
  )
  return rows[0].id
}
