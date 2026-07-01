'use client'

import { useState, useCallback } from 'react'
import type {
  FacturacionInput,
  FacturacionOutput,
  ErrorFacturacion,
  EstadoFacturacion,
} from '@/lib/facturacion/types'

interface UseFacturacionOptions {
  ventaId?: string
  input?: FacturacionInput   // para llamadas directas desde UI
  cuitEmisor: string
  onSuccess?: (r: FacturacionOutput) => void
  onError?: (e: ErrorFacturacion) => void
}

interface UseFacturacionReturn {
  estado: EstadoFacturacion
  resultado: FacturacionOutput | null
  error: ErrorFacturacion | null
  facturar: () => Promise<void>
  reset: () => void
  cargando: boolean
  exitoso: boolean
  fallido: boolean
}

export function useFacturacion(opciones: UseFacturacionOptions): UseFacturacionReturn {
  const [estado, setEstado] = useState<EstadoFacturacion>('idle')
  const [resultado, setResultado] = useState<FacturacionOutput | null>(null)
  const [error, setError] = useState<ErrorFacturacion | null>(null)

  const facturar = useCallback(async () => {
    // Guard anti-doble-click
    if (estado === 'loading') return

    setEstado('loading')
    setError(null)
    setResultado(null)

    try {
      const body =
        opciones.ventaId
          ? { ventaId: opciones.ventaId, cuitEmisor: opciones.cuitEmisor }
          : { input: opciones.input }

      const res = await fetch('/api/facturacion/emitir', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        const err: ErrorFacturacion = data.error ?? {
          categoria: 'interno',
          mensaje: `Error HTTP ${res.status}`,
        }
        setError(err)
        setEstado('error')
        opciones.onError?.(err)
        return
      }

      const output = data as FacturacionOutput
      setResultado(output)
      setEstado('success')
      opciones.onSuccess?.(output)
    } catch {
      const err: ErrorFacturacion = {
        categoria: 'red',
        mensaje: 'No se pudo conectar con el servidor. Verificá tu conexión.',
      }
      setError(err)
      setEstado('error')
      opciones.onError?.(err)
    }
  }, [estado, opciones])

  const reset = useCallback(() => {
    setEstado('idle')
    setResultado(null)
    setError(null)
  }, [])

  return {
    estado,
    resultado,
    error,
    facturar,
    reset,
    cargando: estado === 'loading',
    exitoso:  estado === 'success',
    fallido:  estado === 'error',
  }
}
