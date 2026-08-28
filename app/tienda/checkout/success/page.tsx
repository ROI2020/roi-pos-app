"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from 'next-intl'
import { CheckCircle2, MessageCircle } from "lucide-react"
import { useCart }      from "../../_context/cart-context"
import { useStoreHref } from "../../_context/store-path-context"
import Link from "next/link"

/**
 * /tienda/checkout/success  (alias /store/checkout/success for US)
 *
 * Back-URL for MercadoPago (approved) and PayPal (after capture redirect).
 * Reads orderId from ?orderId=N query param.
 * Clears cart on mount.
 */

function SuccessContent() {
  const params    = useSearchParams()
  const orderId   = params.get('orderId')
  const { clearCart } = useCart()
  const t         = useTranslations('PaymentSuccess')
  const storeHref = useStoreHref('')
  const [waNumber, setWaNumber] = useState<string | null>(null)

  useEffect(() => {
    clearCart()
    // Use public endpoint — no auth required
    fetch('/api/tienda/config')
      .then(r => r.json())
      .then((d: { catalog_phone?: string | null }) => {
        if (d.catalog_phone) setWaNumber(d.catalog_phone)
      })
      .catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const waMsg  = t('whatsappMessage', { id: orderId ?? '' })
  const waLink = waNumber
    ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}`
    : null

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-5">

        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-10 w-10 text-green-500" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          {orderId && (
            <p className="text-gray-500 text-sm mt-1">{t('order', { id: orderId })}</p>
          )}
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">{t('description')}</p>

        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-700 text-left">
          <p className="font-semibold mb-1">{t('nextSteps')}</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>{t('step1')}</li>
            <li>{t('step2')}</li>
            {orderId && <li>{t('step3', { id: orderId })}</li>}
          </ul>
        </div>

        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-green-500 hover:bg-green-600 text-white font-bold text-sm transition-colors"
          >
            <MessageCircle className="h-5 w-5" />
            {t('whatsapp')}
          </a>
        )}

        <Link
          href={storeHref}
          className="block text-sm text-violet-500 hover:text-violet-700 font-medium transition-colors"
        >
          {t('backToStore')}
        </Link>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
