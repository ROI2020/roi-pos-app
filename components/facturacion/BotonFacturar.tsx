'use client'

import { useFacturacion } from '@/hooks/useFacturacion'
import type { FacturacionOutput } from '@/lib/facturacion/types'

interface BotonFacturarProps {
  ventaId: string
  cuitEmisor: string
  onFacturaEmitida?: (output: FacturacionOutput) => void
}

export function BotonFacturar({ ventaId, cuitEmisor, onFacturaEmitida }: BotonFacturarProps) {
  const { estado, resultado, error, facturar, reset } = useFacturacion({
    ventaId,
    cuitEmisor,
    onSuccess: onFacturaEmitida,
  })

  if (estado === 'idle') {
    return (
      <button
        onClick={facturar}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
      >
        Emitir factura B
      </button>
    )
  }

  if (estado === 'loading') {
    return (
      <button
        disabled
        className="rounded-md bg-blue-400 px-4 py-2 text-sm font-medium text-white cursor-not-allowed"
      >
        Emitiendo...
      </button>
    )
  }

  if (estado === 'success' && resultado) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm">
          <p className="font-semibold text-green-800">Factura emitida</p>
          <p className="text-green-700">CAE: {resultado.cae}</p>
          <p className="text-green-700">Nº: {resultado.nroComprobante}</p>
          {resultado.pdfUrl && (
            <div className="flex gap-3 mt-1 flex-wrap">
              <a
                href={resultado.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                PDF A4
              </a>
              <a
                href={`${resultado.pdfUrl}?formato=ticket`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-violet-600 underline"
              >
                Ticket 80mm
              </a>
            </div>
          )}
        </div>
        <button
          onClick={reset}
          className="rounded-md border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
        >
          Nueva factura
        </button>
      </div>
    )
  }

  if (estado === 'error' && error) {
    return (
      <div className="space-y-2">
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm">
          <p className="font-semibold text-red-800">Error al facturar</p>
          <p className="text-red-700">{error.mensaje}</p>
          {error.categoria === 'arca' && error.codigoAfip && (
            <p className="text-red-500 text-xs">Código AFIP: {error.codigoAfip}</p>
          )}
        </div>
        <button
          onClick={facturar}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
        >
          Reintentar
        </button>
      </div>
    )
  }

  return null
}
