"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, FlipHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface CameraScannerProps {
  open: boolean
  onClose: () => void
  /** Llamado con el valor del código detectado */
  onScan: (value: string) => void
}

type Status = 'idle' | 'loading' | 'active' | 'error'

export function CameraScanner({ open, onClose, onScan }: CameraScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const [cameras,   setCameras  ] = useState<MediaDeviceInfo[]>([])
  const [cameraIdx, setCameraIdx] = useState(0)
  const [status,    setStatus   ] = useState<Status>('idle')
  const [errorMsg,  setErrorMsg ] = useState('')

  // ── Cargar lista de cámaras al montar (lazy import) ───────────────────────
  useEffect(() => {
    import('@zxing/browser').then(({ BrowserCodeReader }) => {
      BrowserCodeReader.listVideoInputDevices()
        .then(devices => {
          setCameras(devices)
          // Preferir cámara trasera
          const back = devices.findIndex(d =>
            /back|rear|environment/i.test(d.label)
          )
          if (back >= 0) setCameraIdx(back)
        })
        .catch(() => {})
    })
  }, [])

  // ── Detener stream activo ─────────────────────────────────────────────────
  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    setStatus('idle')
  }, [])

  // ── Iniciar escaneo ───────────────────────────────────────────────────────
  const start = useCallback(async () => {
    if (!videoRef.current) return
    setStatus('loading')
    setErrorMsg('')
    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader   = new BrowserMultiFormatReader()
      const deviceId = cameras[cameraIdx]?.deviceId ?? undefined

      const controls = await reader.decodeFromVideoDevice(
        deviceId,
        videoRef.current,
        (result, _err, ctrl) => {
          if (result) {
            ctrl.stop()
            controlsRef.current = null
            onScan(result.getText())
            onClose()
          }
          // NotFoundException = sin código en el cuadro → normal, ignorar
        }
      )
      controlsRef.current = controls
      setStatus('active')
    } catch (err: unknown) {
      setStatus('error')
      const msg = String((err as Error)?.message ?? '')
      if (/permission|notallowed/i.test(msg)) {
        setErrorMsg('Permiso de cámara denegado. Permitilo en la configuración del navegador.')
      } else if (/notfound|no camera/i.test(msg)) {
        setErrorMsg('No se encontró ninguna cámara disponible.')
      } else {
        setErrorMsg('No se pudo acceder a la cámara.')
      }
    }
  }, [cameras, cameraIdx, onScan, onClose])

  // ── Abrir / cerrar diálogo ────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      start()
    } else {
      stop()
    }
    return () => { stop() }
  // start/stop se recrean si cambia cameraIdx, ese efecto está abajo
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Reiniciar al cambiar de cámara ────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    stop()
    // pequeño delay para liberar el stream anterior antes de pedir el nuevo
    const t = setTimeout(() => { start() }, 150)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraIdx])

  const switchCamera = () => {
    if (cameras.length < 2) return
    setCameraIdx(i => (i + 1) % cameras.length)
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden gap-0">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Camera className="h-4 w-4 text-violet-600" />
            Escanear código de barras
          </DialogTitle>
        </DialogHeader>

        {/* Video */}
        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="w-full aspect-[4/3] object-cover"
            playsInline    /* iOS: no fullscreen automático */
            muted
          />

          {/* Visor */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[58%] h-[28%]">
              {/* Esquinas */}
              <div className="absolute top-0 left-0   w-5 h-5 border-t-2 border-l-2 border-violet-400 rounded-tl" />
              <div className="absolute top-0 right-0  w-5 h-5 border-t-2 border-r-2 border-violet-400 rounded-tr" />
              <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-violet-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-violet-400 rounded-br" />
              {/* Línea de scan */}
              <div className="absolute inset-x-3 top-1/2 h-0.5 bg-violet-400/75 animate-pulse" />
            </div>
          </div>

          {/* Overlay de inicio */}
          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="text-white text-sm animate-pulse">Iniciando cámara…</span>
            </div>
          )}
        </div>

        {/* Mensaje de error */}
        {status === 'error' && (
          <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-t">
            {errorMsg}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
          <p className="text-xs text-gray-400">Apuntá al código de barras</p>
          <div className="flex gap-2">
            {cameras.length > 1 && (
              <Button
                variant="outline" size="sm"
                onClick={switchCamera}
                className="gap-1.5 h-8 text-xs"
              >
                <FlipHorizontal className="h-3.5 w-3.5" />
                Cambiar cámara
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose} className="h-8 text-xs">
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
