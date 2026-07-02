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
  onScan: (value: string) => void
}

type Status = 'idle' | 'loading' | 'active' | 'error'

export function CameraScanner({ open, onClose, onScan }: CameraScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const [cameras,   setCameras  ] = useState<MediaDeviceInfo[]>([])
  const [cameraIdx, setCameraIdx] = useState(-1)  // -1 = usar facingMode:environment
  const [status,    setStatus   ] = useState<Status>('idle')
  const [errorMsg,  setErrorMsg ] = useState('')

  // ── Cargar cámaras cuando se ABRE el diálogo ──────────────────────────────
  // Se hace en open=true para que los labels ya estén disponibles (post-permiso)
  useEffect(() => {
    if (!open) return
    import('@zxing/browser').then(({ BrowserCodeReader }) => {
      BrowserCodeReader.listVideoInputDevices()
        .then(devices => {
          setCameras(devices)
          const back = devices.findIndex(d => /back|rear|environment/i.test(d.label))
          if (back >= 0) setCameraIdx(back)
          // Si no encontramos por label, cameraIdx queda -1 → usará facingMode:environment
        })
        .catch(() => {})
    })
  }, [open])

  // ── Detener stream activo ─────────────────────────────────────────────────
  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  // ── Iniciar escaneo ───────────────────────────────────────────────────────
  const start = useCallback(async () => {
    const video = videoRef.current
    if (!video) return

    if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
      setStatus('error')
      setErrorMsg('La cámara solo funciona con HTTPS. Usá la versión online del sistema.')
      return
    }

    setStatus('loading')
    setErrorMsg('')

    try {
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader   = new BrowserMultiFormatReader()
      const deviceId = cameraIdx >= 0 ? cameras[cameraIdx]?.deviceId : undefined

      // Callback compartido entre ambas ramas
      const onResult: Parameters<typeof reader.decodeFromVideoDevice>[2] = (result, _err, ctrl) => {
        if (result) {
          ctrl.stop()
          controlsRef.current = null
          onScan(result.getText())
          onClose()
        }
      }

      let controls: { stop: () => void }

      if (deviceId) {
        // Cámara seleccionada por el usuario via "Cambiar cámara"
        controls = await reader.decodeFromVideoDevice(deviceId, video, onResult)
      } else {
        // Sin deviceId conocido → pedir cámara trasera explícitamente.
        // ZXing con deviceId=undefined usa { video: true } que en muchos Android
        // abre la cámara DELANTERA por defecto.
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } } },
          video,
          onResult,
        )
      }

      controlsRef.current = controls

      // Forzar play() — en PWA el autoplay puede quedar pendiente
      // incluso con el atributo autoPlay en el elemento
      video.play().catch(() => {})

      setStatus('active')
    } catch (err: unknown) {
      setStatus('error')
      const msg = String((err as Error)?.message ?? err ?? '').toLowerCase()
      if (/permission|notallowed/.test(msg)) {
        setErrorMsg(
          'Permiso de cámara denegado. ' +
          'En Chrome: Menú → Ajustes del sitio → Cámara → Permitir. ' +
          'En Safari: Ajustes → Safari → Cámara → Preguntar.'
        )
      } else if (/notfound|no camera|devicenotfound/.test(msg)) {
        setErrorMsg('No se encontró ninguna cámara en este dispositivo.')
      } else if (/overconstrained|constraint/.test(msg)) {
        // facingMode no compatible → reintentar con la primera cámara disponible
        setCameraIdx(0)
      } else {
        setErrorMsg(`No se pudo acceder a la cámara: ${(err as Error)?.message ?? err}`)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Reiniciar cuando cambia la cámara seleccionada ───────────────────────
  useEffect(() => {
    if (!open) return
    stop()
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

        <div className="relative bg-black">
          {/*
            autoPlay + muted + playsInline son los tres atributos requeridos
            para que el stream de getUserMedia se renderice en un <video> dentro
            de una PWA instalada. Sin autoPlay el video queda en negro aunque
            srcObject esté asignado y play() haya sido llamado.
          */}
          <video
            ref={videoRef}
            className="w-full aspect-[4/3] object-cover"
            autoPlay
            playsInline
            muted
          />

          {/* Visor de encuadre */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-[58%] h-[28%]">
              <div className="absolute top-0 left-0   w-5 h-5 border-t-2 border-l-2 border-violet-400 rounded-tl" />
              <div className="absolute top-0 right-0  w-5 h-5 border-t-2 border-r-2 border-violet-400 rounded-tr" />
              <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-violet-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-violet-400 rounded-br" />
              <div className="absolute inset-x-3 top-1/2 h-0.5 bg-violet-400/75 animate-pulse" />
            </div>
          </div>

          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="text-white text-sm animate-pulse">Iniciando cámara…</span>
            </div>
          )}
        </div>

        {status === 'error' && (
          <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-t leading-snug">
            {errorMsg}
          </div>
        )}

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
