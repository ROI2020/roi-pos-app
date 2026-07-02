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
  const streamRef   = useRef<MediaStream | null>(null)   // track para liberar correctamente
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  const [cameras,   setCameras  ] = useState<MediaDeviceInfo[]>([])
  const [cameraIdx, setCameraIdx] = useState(-1)   // -1 = pedir facingMode:environment
  const [status,    setStatus   ] = useState<Status>('idle')
  const [errorMsg,  setErrorMsg ] = useState('')

  // ── Cargar lista de cámaras cuando se abre el diálogo ────────────────────
  // Lo hacemos en open=true porque los labels solo están disponibles después
  // de que el usuario otorgó el permiso de cámara.
  useEffect(() => {
    if (!open) return
    import('@zxing/browser').then(({ BrowserCodeReader }) => {
      BrowserCodeReader.listVideoInputDevices()
        .then(devices => {
          setCameras(devices)
          const back = devices.findIndex(d => /back|rear|environment/i.test(d.label))
          if (back >= 0) setCameraIdx(back)
          // Si no encontramos trasera por label, -1 usará facingMode:environment
        })
        .catch(() => {})
    })
  }, [open])

  // ── Detener stream y liberar recursos ────────────────────────────────────
  const stop = useCallback(() => {
    // 1. Detener el decodificador de ZXing
    controlsRef.current?.stop()
    controlsRef.current = null
    // 2. Detener los tracks de MediaStream (libera la cámara física)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    // 3. Desconectar el stream del video
    if (videoRef.current) videoRef.current.srcObject = null
    setStatus('idle')
  }, [])

  // ── Iniciar escaneo ───────────────────────────────────────────────────────
  // Estrategia: manejamos getUserMedia nosotros mismos para tener control
  // total sobre el video element. ZXing solo hace el reconocimiento óptico.
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
      // ── 1. Obtener stream de cámara con constraints explícitas ──────────
      const deviceId = cameraIdx >= 0 ? cameras[cameraIdx]?.deviceId : undefined
      const videoConstraints: MediaTrackConstraints = deviceId
        ? { deviceId: { exact: deviceId } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }

      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints })
      streamRef.current = stream

      // ── 2. Conectar stream al video manualmente ─────────────────────────
      video.srcObject = stream

      // ── 3. Play() explícito y esperado ──────────────────────────────────
      // No confiamos solo en el atributo autoPlay porque en PWA el browser
      // puede ignorarlo. Llamamos play() directamente y esperamos la resolución.
      await video.play()

      // ── 4. ZXing solo decodifica — no toca el video ─────────────────────
      const { BrowserMultiFormatReader } = await import('@zxing/browser')
      const reader = new BrowserMultiFormatReader()

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
      // Limpiar recursos si algo falló
      streamRef.current?.getTracks().forEach(t => t.stop())
      streamRef.current = null
      if (videoRef.current) videoRef.current.srcObject = null

      setStatus('error')
      const msg = String((err as Error)?.message ?? err ?? '').toLowerCase()

      if (/permission|notallowed/.test(msg)) {
        setErrorMsg(
          'Permiso de cámara denegado. ' +
          'Tocá el ícono de cámara en la barra de direcciones → Permitir, ' +
          'o en Ajustes del navegador → Permisos del sitio → Cámara.'
        )
      } else if (/notfound|no camera|devicenotfound/.test(msg)) {
        setErrorMsg('No se encontró ninguna cámara en este dispositivo.')
      } else if (/overconstrained|constraint/.test(msg)) {
        // facingMode no compatible en este dispositivo → reintentar sin restricciones
        setCameraIdx(0)
      } else {
        setErrorMsg(`No se pudo acceder a la cámara: ${(err as Error)?.message ?? err}`)
      }
    }
  }, [cameras, cameraIdx, onScan, onClose])

  // ── Abrir / cerrar ────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      start()
    } else {
      stop()
    }
    return () => { stop() }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // ── Reiniciar cuando el usuario cambia de cámara ──────────────────────────
  useEffect(() => {
    if (!open) return
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
