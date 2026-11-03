import pool from '@/lib/db'
import type { FacturacionInput, ItemFactura, ErrorFacturacion } from '../types'

interface SaleRow {
  sale_id: number
  total_amount: string
  discount_amount: string
  sold_at: Date
  cuit: string
  razon_social: string
  condicion_iva: string
  punto_venta: number
  unit_price: string
  product_name: string
  color: string
  size: string
}

// Construye un FacturacionInput completo a partir de una venta ROIPOS.
// El motor nunca sabe de dónde vienen los datos — esto es la única función
// que conoce el esquema de la DB de ROIPOS.
//
// El join a facturacion_config usa DOS columnas:
//   branches.cuit_emisor    = facturacion_config.cuit
//   branches.arca_pos_number = facturacion_config.punto_venta
// Esto garantiza que la sucursal de la venta esté explícitamente vinculada
// al CUIT y punto de venta configurados en ARCA.
export async function adaptarVentaROIPOS(
  saleId: number,
  cuitEmisor: string
): Promise<FacturacionInput> {
  // Un único query: venta + ítems + config ARCA, validando sucursal por las dos columnas
  const ventaResult = await pool.query<SaleRow>(
    `SELECT
       s.id                  AS sale_id,
       s.total_amount,
       s.discount_amount,
       s.sold_at,
       fc.cuit,
       fc.razon_social,
       fc.condicion_iva,
       fc.punto_venta,
       sd.unit_price,
       p.name                AS product_name,
       pv.color,
       pv.size
     FROM sales s
     JOIN branches b
       ON b.id = s.branch_id
      AND b.cuit_emisor = $2
     JOIN facturacion_config fc
       ON fc.cuit          = b.cuit_emisor
      AND fc.punto_venta   = b.arca_pos_number
      AND fc.activo        = true
     JOIN sale_details sd     ON sd.sale_id = s.id
     JOIN product_variants pv ON pv.id = sd.product_variant_id
     JOIN products p          ON p.id = pv.product_id
     WHERE s.id = $1`,
    [saleId, cuitEmisor]
  )

  if (!ventaResult.rows.length) {
    // Diferenciar entre "venta no existe" y "sucursal sin CUIT configurado"
    const ventaExiste = await pool.query(
      `SELECT 1 FROM sales WHERE id = $1`, [saleId]
    )
    const err: ErrorFacturacion = ventaExiste.rows.length
      ? {
          categoria: 'validacion',
          mensaje: `La sucursal de la venta ${saleId} no tiene configurado el CUIT ${cuitEmisor} en ARCA`,
        }
      : {
          categoria: 'validacion',
          mensaje: `Venta ${saleId} no encontrada o sin ítems`,
        }
    throw err
  }

  const primera = ventaResult.rows[0]
  const importeTotal = parseFloat(primera.total_amount)
  const descuento = parseFloat(primera.discount_amount)

  // Construir ítems desde sale_details
  const items: ItemFactura[] = ventaResult.rows.map(row => ({
    descripcion: `${row.product_name} - ${row.color} T.${row.size}`,
    cantidad: 1,
    precioUnitario: parseFloat(row.unit_price),
    unidadMedida: 7, // unidades
  }))

  // Si hay descuento, añadirlo como ítem negativo para que el total cuadre en el PDF
  if (descuento > 0) {
    items.push({
      descripcion: 'Descuento',
      cantidad: 1,
      precioUnitario: -descuento,
      unidadMedida: 7,
    })
  }

  // Fecha en formato YYYYMMDD.
  // Restricciones de ARCA:
  //   1. No puede ser anterior a hoy - 4 días (error 10148).
  //   2. No puede ser anterior a la fecha del comprobante previo del mismo punto de venta
  //      (ARCA exige orden cronológico).
  //
  // Solución: usar el MÁXIMO de (fechaVenta, hoy-4, fechaÚltimaFactura).
  // Así se respeta la fecha real de la venta cuando es reciente, y se avanza al mínimo
  // necesario cuando la venta es antigua o ya hay facturas con fecha posterior.
  //
  // IMPORTANTE — timezone: sold_at es TIMESTAMP WITHOUT TIME ZONE que almacena UTC.
  // Node.js en prod corre en UTC, así que SIEMPRE convertir a ART antes de armar la fecha.
  const ART = 'America/Argentina/Buenos_Aires'
  function toARTDate(d: Date): string {
    return new Intl.DateTimeFormat('sv-SE', { timeZone: ART }).format(d)
  }

  const fechaVentaStr = toARTDate(new Date(primera.sold_at))
  const fechaHoyStr   = toARTDate(new Date())

  // Fecha más antigua que ARCA acepta: hoy - 4 días
  const hoyBase = new Date(fechaHoyStr + 'T12:00:00Z')
  hoyBase.setUTCDate(hoyBase.getUTCDate() - 4)
  const fechaMinimaStr = hoyBase.toISOString().slice(0, 10)

  // Fecha de la última factura emitida para este punto de venta (orden cronológico)
  const { rows: ultimaRows } = await pool.query<{ fecha: string }>(
    `SELECT TO_CHAR(fecha_cbte, 'YYYY-MM-DD') AS fecha
     FROM facturas
     WHERE cuit_emisor = $1 AND punto_venta = $2 AND tipo_cbte = 11 AND estado = 'emitida'
     ORDER BY nro_comprobante DESC LIMIT 1`,
    [primera.cuit, primera.punto_venta],
  )
  const fechaUltimaStr = ultimaRows[0]?.fecha ?? '1900-01-01'

  // MAX de los tres: garantiza que cumple todas las restricciones
  const fechaEfectiva = [fechaVentaStr, fechaMinimaStr, fechaUltimaStr].sort().at(-1)!
  const fecha = fechaEfectiva.replace(/-/g, '')  // "YYYYMMDD"

  const condIva = primera.condicion_iva as 'monotributo' | 'responsable_inscripto'

  return {
    emisor: {
      cuit: primera.cuit,
      puntoVenta: primera.punto_venta,
      razonSocial: primera.razon_social,
      condicionIva: condIva,
    },
    receptor: {
      // Consumidor final por defecto — se puede extender pasando datos del receptor
      condicionIva: 'consumidor_final',
    },
    comprobante: {
      fecha,
      items,
      importeTotal,
      // Monotributista: todo el importe es neto, IVA = 0
      importeNeto: importeTotal,
      importeIva: 0,
      concepto: 1, // productos
    },
    meta: {
      origenId: String(saleId),
      origenSistema: 'roipos',
    },
  }
}
