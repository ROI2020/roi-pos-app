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

  // Fecha de la venta en formato YYYYMMDD
  const fechaVenta = new Date(primera.sold_at)
  const fecha = [
    fechaVenta.getFullYear(),
    String(fechaVenta.getMonth() + 1).padStart(2, '0'),
    String(fechaVenta.getDate()).padStart(2, '0'),
  ].join('')

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
