"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { XCircle, RefreshCw } from "lucide-react"
import Link from "next/link"

/**
 * /tienda/checkout/fallo
 *
 * Back-URL de MercadoPago cuando el pago falló o fue rechazado.
 * El carrito NO se limpia — el usuario puede volver a intentar.
 */

function FalloContent() {
  const params  = useSearchParams()
  const orderId = params.get('order')
  const router  = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-5">

        {/* Ícono */}
        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <XCircle className="h-10 w-10 text-red-500" />
        </div>

        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pago no procesado</h1>
          {orderId && (
            <p className="text-gray-500 text-sm mt-1">Pedido #{orderId}</p>
          )}
        </div>

        {/* Descripción */}
        <p className="text-sm text-gray-600 leading-relaxed">
          El pago no pudo completarse. Podés intentarlo nuevamente con otro método de pago.
        </p>

        {/* Causa común */}
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 text-left space-y-1">
          <p className="font-semibold">Posibles causas:</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Fondos insuficientes</li>
            <li>Datos de tarjeta incorrectos</li>
            <li>Límite de compra superado</li>
          </ul>
        </div>

        {/* Reintentar */}
        <button
          onClick={() => router.back()}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          Volver e intentar de nuevo
        </button>

        <Link
          href="/tienda"
          className="block text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Volver a la tienda
        </Link>
      </div>
    </div>
  )
}

export default function FalloPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <FalloContent />
    </Suspense>
  )
}
