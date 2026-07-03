"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Camera, FlipHorizontal } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

interface CameraScannerProps {
  open: boolean
  onClose: () => void
  onScan: (value: string) => void
}

type Status = 'idle' | 'loading' | 'active' | 'error'

export function CameraScanner({ open, onClose, onScan }: CameraScannerProps) {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const [cameras,   setCameras  ] = useState<MediaDeviceInfo[]>([])
  const [cameraIdx, setCameraIdx] = useState(-1)   // -1 = facingMode:environment
  const [status,    setStatus   ] = useState<Status>('idle')
  const [errorMsg,  setErrorMsg ] = useState('')

  // ── Detener stream y liberar recursos ────────────────────────────────────
  const stop = useCallback(() => {
    controlsRef.current?.stop()
    controlsRef.current = null
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  // ── Iniciar escaneo ───────────────────────────────────────────────────────
  // Debe llamarse SIEMPRE desde un onClick directo para que el browser lo
  // reconozca como gesto del usuario (requerido por iOS/Android para cámara).
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
      // 1. Obtener stream con constraints explícitas
      const deviceId = cameraIdx >= 0 ? cameras[cameraIdx]?.deviceId : undefined
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }

      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints })
      streamRef.current = stream

      // Ahora que tenemos permiso, cargar lista de cámaras disponibles
      import('@zxing/browser').then(({ BrowserCodeReader }) => {
        BrowserCodeReader.listVideoInputDevices()
          .then(devices => {
            setCameras(devices)
            if (cameraIdx < 0) {
              const back = devices.findIndex(d => /back|rear|environment/i.test(d.label))
              if (back >= 0) setCameraIdx(back)
            }
          })
          .catch(() => {})
      })

      // 2. Conectar stream al video
      // playsInline como atributo JS además del prop de React (necesario en iOS PWA)
      video.setAttribute('playsinline', '')
      video.srcObject = stream

      // 3. Play() explícito
      await video.play()

      // 4. ZXing con hints para CODE128 + TRY_HARDER
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const { DecodeHintType, BarcodeFormat } = await import('@zxing/library')
      const hints = new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
        ]],
        [DecodeHintType.TRY_HARDER, true],
      ])
      const reader = new BrowserMultiFormatReader(hints)

      const controls = await reader.decodeFromVideoElement(
        video,
        (result, _err, ctrl) => {
          if (result) {
            ctrl.stop()
            controlsRef.current = null
            onScan(result.getText())
            onClose()
          }
        },
      )
      controlsRef.current = controls
      setStatus('active')

    } catch (err: unknown) {
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null

      setStatus('error')
      const msg = String((err as Error)?.message ?? err ?? '').toLowerCase()

      if (/permission|notallowed|not allowed|denied/i.test(msg)) {
        setErrorMsg(
          'Permiso de cámara denegado. ' +
          'En Ajustes del teléfono → Aplicaciones → Navegador → Permisos → Cámara → Permitir. ' +
          'Luego volvé y tocá "Activar cámara".'
        )
      } else if (/notfound|no camera|devicenotfound/i.test(msg)) {
        setErrorMsg('No se encontró ninguna cámara en este dispositivo.')
      } else if (/overconstrained|constraint/i.test(msg)) {
        // facingMode no compatible → reintentar sin restricción de lado
        setCameraIdx(0)
      } else {
        setErrorMsg(`No se pudo acceder a la cámara: ${(err as Error)?.message ?? err}`)
      }
    }
  }, [cameras, cameraIdx, onScan, onClose])

  // ── Abrir / cerrar ────────────────────────────────────────────────────────
  // Solo reseteamos estado — NO llamamos start() automáticamente.
  // En móvil, getUserMedia debe venir de un onClick directo del usuario.
  useEffect(() => {
    if (open) {
      setStatus('idle')
      setErrorMsg('')
      setCameras([])
      setCameraIdx(-1)
    } else {
      stop()
    }
    return () => { stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Reiniciar cuando el usuario cambia de cámara ──────────────────────────
  useEffect(() => {
    if (!open || status === 'idle') return
    stop()
    const t = setTimeout(() => { start() }, 200)
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
          <DialogDescription className="sr-only">
            Apuntá la cámara al código de barras del producto
          </DialogDescription>
        </DialogHeader>

        <div className="relative bg-black">
          <video
            ref={videoRef}
            className="w-full aspect-[4/3] object-cover"
            autoPlay
            playsInline
            muted
          />

          {/* Visor de encuadre (visible solo cuando la cámara está activa) */}
          {status === 'active' && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="relative w-[58%] h-[28%]">
                <div className="absolute top-0 left-0   w-5 h-5 border-t-2 border-l-2 border-violet-400 rounded-tl" />
                <div className="absolute top-0 right-0  w-5 h-5 border-t-2 border-r-2 border-violet-400 rounded-tr" />
                <div className="absolute bottom-0 left-0  w-5 h-5 border-b-2 border-l-2 border-violet-400 rounded-bl" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-violet-400 rounded-br" />
                <div className="absolute inset-x-3 top-1/2 h-0.5 bg-violet-400/75 animate-pulse" />
              </div>
            </div>
          )}

          {/* Botón inicial — llama a start() directamente (gesto del usuario) */}
          {status === 'idle' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80">
              <Camera className="h-10 w-10 text-violet-400" />
              <button
                onClick={start}
                className="px-5 py-2.5 bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Activar cámara
              </button>
            </div>
          )}

          {status === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <span className="text-white text-sm animate-pulse">Iniciando cámara…</span>
            </div>
          )}
        </div>

        {status === 'error' && (
          <div className="px-4 py-3 text-sm text-red-700 bg-red-50 border-t leading-snug space-y-2">
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
            {status === 'active' ? 'Apuntá al código de barras' : 'Lector de códigos'}
          </p>
          <div className="flex gap-2">
            {cameras.length > 1 && status === 'active' && (
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
