'use client'

import type { FacturacionOutput } from '@/lib/facturacion/types'

interface ResultadoFacturaProps {
  output: FacturacionOutput
}

export function ResultadoFactura({ output }: ResultadoFacturaProps) {
  return (
    <div className="rounded-md border border-green-200 bg-green-50 p-4 space-y-2 text-sm">
      <h3 className="font-semibold text-green-800">Comprobante autorizado por AFIP</h3>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-green-700">
        <span className="font-medium">CAE</span>
        <span className="font-mono">{output.cae}</span>

        <span className="font-medium">Nº comprobante</span>
        <span>{output.nroComprobante}</span>

        <span className="font-medium">Vencimiento CAE</span>
        <span>{output.caeVencimiento}</span>
      </div>

      {output.pdfUrl && (
        <div className="flex gap-3 mt-2 flex-wrap">
          <a
            href={output.pdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-blue-600 underline hover:text-blue-800"
          >
            PDF A4
          </a>
          <a
            href={`${output.pdfUrl}?formato=ticket`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-violet-600 underline hover:text-violet-800"
          >
            Imprimir ticket (80mm)
          </a>
        </div>
      )}
    </div>
  )
}
