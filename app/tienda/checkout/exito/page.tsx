"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { CheckCircle2, MessageCircle } from "lucide-react"
import { useCart } from "../../_context/cart-context"
import Link from "next/link"

/**
 * /tienda/checkout/exito
 *
 * Back-URL de MercadoPago cuando el pago fue aprobado.
 * MP agrega automáticamente: ?collection_id=...&collection_status=approved
 *                            &payment_id=...&status=approved&order=N
 *
 * El carrito se limpia aquí (no en el checkout, para que el usuario
 * pueda volver si cierra la ventana de MP sin completar el pago).
 */

function ExitoContent() {
  const params  = useSearchParams()
  const orderId = params.get('order')
  const { clearCart } = useCart()
  const [waNumber, setWaNumber] = useState<string | null>(null)

  // Limpiar carrito y cargar número de WA del negocio
  useEffect(() => {
    clearCart()
    fetch('/api/settings')
      .then(r => r.json())
      .then((d: { catalog_phone?: string }) => {
        if (d.catalog_phone) setWaNumber(d.catalog_phone)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(`Hola! Acabo de pagar el pedido #${orderId ?? ''} ✅`)}`
    : null

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-5">

        {/* Ícono */}
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>

        {/* Título */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">¡Pago exitoso!</h1>
          {orderId && (
            <p className="text-gray-500 text-sm mt-1">Pedido #{orderId}</p>
          )}
        </div>

        {/* Descripción */}
        <p className="text-sm text-gray-600 leading-relaxed">
          Tu pago fue procesado correctamente.
          Nos comunicaremos por WhatsApp para coordinar la entrega.
        </p>

        {/* Info adicional */}
        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 text-left">
          <p className="font-semibold mb-1">¿Qué sigue?</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Preparamos tu pedido</li>
            <li>Te avisamos cuando esté listo</li>
            {orderId && <li>Referencia: Pedido #{orderId}</li>}
          </ul>
        </div>

        {/* WhatsApp */}
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors"
          >
            <MessageCircle className="h-5 w-5" />
            Consultar por WhatsApp
          </a>
        )}

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

export default function ExitoPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ExitoContent />
    </Suspense>
  )
}
