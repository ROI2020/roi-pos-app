export interface ItemFactura {
  descripcion: string
  cantidad: number
  precioUnitario: number    // precio final (monotributista no discrimina IVA)
  unidadMedida?: number     // código AFIP, default 7 = "unidades"
}

export interface FacturacionInput {
  emisor: {
    cuit: string
    puntoVenta: number
    razonSocial: string
    condicionIva: 'monotributo' | 'responsable_inscripto'
  }
  receptor: {
    cuit?: string
    razonSocial?: string
    domicilio?: string
    condicionIva: 'consumidor_final' | 'responsable_inscripto' | 'exento'
  }
  comprobante: {
    fecha: string           // YYYYMMDD
    items: ItemFactura[]
    importeTotal: number
    importeNeto: number
    importeIva: number      // 0 para monotributista
    concepto: 1 | 2 | 3    // 1=productos 2=servicios 3=ambos
  }
  meta: {
    origenId: string
    origenSistema: 'roipos' | 'whatsapp' | 'externo' | 'batch'
    operadorId?: string
  }
}

export interface FacturacionOutput {
  cae: string
  caeVencimiento: string
  nroComprobante: number
  facturaId: string
  pdfUrl: string
}

export type CategoriaError = 'validacion' | 'arca' | 'red' | 'interno'

export interface ErrorFacturacion {
  categoria: CategoriaError
  mensaje: string
  codigoAfip?: number
  detalle?: string
}

export type EstadoFacturacion = 'idle' | 'loading' | 'success' | 'error'
