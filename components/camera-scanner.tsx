"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface CameraScannerProps {
  open:    boolean
  onClose: () => void
  onScan:  (value: string) => void
}

type Status = 'idle' | 'loading' | 'active' | 'error'

// ID fijo para el div que html5-qrcode necesita
const SCANNER_DIV_ID = 'roipos-qr-scanner'

export function CameraScanner({ open, onClose, onScan }: CameraScannerProps) {
  const scannerRef = useRef<unknown>(null)
  const detected   = useRef(false)

  const [status,   setStatus  ] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const stop = useCallback(async () => {
    if (!scannerRef.current) return
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      const s = scannerRef.current as InstanceType<typeof Html5Qrcode>
      if (s.isScanning) await s.stop()
      s.clear()
    } catch { /* noop */ }
    scannerRef.current = null
    setStatus('idle')
  }, [])

  // Debe llamarse desde un onClick directo (iOS/Android requieren gesto del usuario)
  const start = useCallback(async () => {
    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setStatus('error')
      setErrorMsg('La cámara solo funciona con HTTPS. Usá la versión online del sistema.')
      return
    }

    setStatus('loading')
    setErrorMsg('')
    detected.current = false

    try {
      const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode')

      // formatsToSupport va en el constructor (no en start)
      const scanner = new Html5Qrcode(SCANNER_DIV_ID, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        verbose: false,
      })
      scannerRef.current = scanner

      await scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          // Caja cuadrada: buena para QR y aceptable para 1D
          qrbox: (w: number, h: number) => {
            const side = Math.round(Math.min(w, h) * 0.7)
            return { width: side, height: side }
          },
          aspectRatio: 4 / 3,
        },
        (decodedText: string) => {
          if (detected.current) return
          detected.current = true
          onScan(decodedText)
          onClose()
        },
        undefined  // error frame por frame — silencioso
      )

      setStatus('active')

    } catch (err: unknown) {
      scannerRef.current = null
      setStatus('error')
      const msg = String((err as Error)?.message ?? err ?? '').toLowerCase()
      if (/permission|notallowed|not allowed|denied/i.test(msg)) {
        setErrorMsg(
          'Permiso de cámara denegado.\n' +
          'En Ajustes del teléfono → Aplicaciones → Navegador → Permisos → Cámara → Permitir.\n' +
          'Luego volvé y tocá "Activar cámara".'
        )
      } else if (/notfound|no camera|devicenotfound/i.test(msg)) {
        setErrorMsg('No se encontró ninguna cámara en este dispositivo.')
      } else {
        setErrorMsg(`No se pudo acceder a la cámara: ${(err as Error)?.message ?? String(err)}`)
      }
    }
  }, [onScan, onClose])

  useEffect(() => {
    if (open) {
      setStatus('idle')
      setErrorMsg('')
      detected.current = false
    } else {
      stop()
    }
    return () => { stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-violet-600" />
            Escanear código
          </DialogTitle>
          <DialogDescription className="sr-only">
            Apuntá la cámara al código QR o de barras del producto
          </DialogDescription>
        </DialogHeader>

        <div className="relative bg-black">
          {/*
            html5-qrcode inyecta su video + canvas de análisis aquí.
            Ocultamos los controles propios de la lib con CSS.
          */}
          <div
            id={SCANNER_DIV_ID}
            className="w-full aspect-[4/3] overflow-hidden
              [&_video]:w-full [&_video]:h-full [&_video]:object-cover
              [&_canvas]:absolute [&_canvas]:inset-0 [&_canvas]:w-full [&_canvas]:h-full [&_canvas]:pointer-events-none
              [&_img]:hidden
              [&_select]:hidden
              [&_button]:hidden"
          />

          {/* Overlay: botón de inicio */}
          {status === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <Camera className="h-10 w-10 text-violet-400" />
              <button
                onClick={start}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Activar cámara
              </button>
              <p className="text-xs text-gray-400">Lee QR y códigos de barras</p>
            </div>
          )}

          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="text-white text-sm animate-pulse">Iniciando cámara…</span>
            </div>
          )}

          {/* Marco de encuadre cuadrado (QR) */}
          {status === 'active' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-[65%] aspect-square">
                <div className="absolute top-0    left-0  w-5 h-5 border-t-2 border-l-2 border-violet-400 rounded-tl" />
                <div className="absolute top-0    right-0 w-5 h-5 border-t-2 border-r-2 border-violet-400 rounded-tr" />
                <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-violet-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-violet-400 rounded-br" />
              </div>
            </div>
          )}
        </div>

        {status === 'error' && (
          <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-t leading-snug space-y-2 whitespace-pre-line">
            <p>{errorMsg}</p>
            <button
              onClick={start}
              className="text-violet-700 font-medium underline underline-offset-2"
            >
              Reintentar
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
          <p className="text-xs text-gray-400">
            {status === 'active' ? 'Apuntá al QR o código de barras' : 'Lector de códigos'}
          </p>
          <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
