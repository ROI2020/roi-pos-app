import type { FacturacionInput, ErrorFacturacion } from '../types'

// Valida y retorna el FacturacionInput tal cual.
// Punto de entrada para llamadas desde WhatsApp, batch, o sistemas externos
// que ya construyeron el input con la estructura correcta.
export function adaptarDirecto(input: FacturacionInput): FacturacionInput {
  const errores = validarInput(input)
  if (errores.length > 0) {
    const err: ErrorFacturacion = {
      categoria: 'validacion',
      mensaje: errores.join('; '),
    }
    throw err
  }
  return input
}

function validarInput(input: FacturacionInput): string[] {
  const errs: string[] = []

  if (!input.emisor?.cuit) errs.push('emisor.cuit requerido')
  if (!input.emisor?.puntoVenta) errs.push('emisor.puntoVenta requerido')
  if (!input.emisor?.razonSocial) errs.push('emisor.razonSocial requerido')

  if (!input.receptor?.condicionIva) errs.push('receptor.condicionIva requerido')

  if (!input.comprobante?.fecha || !/^\d{8}$/.test(input.comprobante.fecha))
    errs.push('comprobante.fecha inválida (debe ser YYYYMMDD)')

  if (!input.comprobante?.items?.length)
    errs.push('comprobante.items no puede estar vacío')

  if (!input.comprobante?.importeTotal || input.comprobante.importeTotal <= 0)
    errs.push('comprobante.importeTotal debe ser > 0')

  if (input.comprobante?.importeNeto < 0)
    errs.push('comprobante.importeNeto no puede ser negativo')

  if (!input.meta?.origenId) errs.push('meta.origenId requerido')
  if (!input.meta?.origenSistema) errs.push('meta.origenSistema requerido')

  // Si tiene receptor con CUIT, validar que no sea consumidor_final
  if (input.receptor?.cuit && input.receptor.condicionIva === 'consumidor_final')
    errs.push('receptor con CUIT no puede ser consumidor_final')

  return errs
}
