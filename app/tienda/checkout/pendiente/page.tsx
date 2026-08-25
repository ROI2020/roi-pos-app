"use client"

import { Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Clock, MessageCircle } from "lucide-react"
import Link from "next/link"

/**
 * /tienda/checkout/pendiente
 *
 * Back-URL de MercadoPago cuando el pago está pendiente de acreditación
 * (ej: transferencia bancaria, pago en efectivo via Rapipago/Pagofácil).
 *
 * El carrito NO se limpia — esperamos confirmación de MP vía webhook.
 */

function PendienteContent() {
  const params  = useSearchParams()
  const orderId = params.get('order')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-5">

        {/* Ícono */}
        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="h-10 w-10 text-amber-500" />
        </div>

        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Pago pendiente</h1>
          {orderId && (
            <p className="text-gray-500 text-sm mt-1">Pedido #{orderId}</p>
          )}
        </div>

        {/* Descripción */}
        <p className="text-sm text-gray-600 leading-relaxed">
          Tu pago está siendo procesado. Una vez acreditado, te avisaremos
          por WhatsApp para coordinar la entrega.
        </p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 text-left space-y-1">
          <p className="font-semibold">¿Qué sigue?</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>Guardá tu comprobante de pago</li>
            <li>La acreditación puede demorar hasta 2 días hábiles</li>
            <li>Recibirás confirmación por WhatsApp</li>
          </ul>
        </div>

        <a
          href="https://wa.me/5491112345678"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors"
        >
          <MessageCircle className="h-5 w-5" />
          Consultar por WhatsApp
        </a>

        <Link
          href="/tienda"
          className="block text-sm text-violet-500 hover:text-violet-700 font-medium transition-colors"
        >
          Volver a la tienda
        </Link>
      </div>
    </div>
  )
}

export default function PendientePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PendienteContent />
    </Suspense>
  )
}
