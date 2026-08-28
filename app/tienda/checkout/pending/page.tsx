"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from 'next-intl'
import { Clock, MessageCircle } from "lucide-react"
import { useStoreHref } from "../../_context/store-path-context"
import Link from "next/link"

/**
 * /tienda/checkout/pending  (alias /store/checkout/pending for US)
 *
 * Back-URL for MercadoPago when payment is pending confirmation
 * (e.g. bank transfer, cash via Rapipago/Pagofácil).
 * Cart is NOT cleared — waiting for MP webhook to confirm.
 */

function PendingContent() {
  const params    = useSearchParams()
  const orderId   = params.get('orderId')
  const t         = useTranslations('PaymentPending')
  const storeHref = useStoreHref('')
  const [waNumber, setWaNumber] = useState<string | null>(null)

  useEffect(() => {
    // Use public endpoint — no auth required
    fetch('/api/tienda/config')
      .then(r => r.json())
      .then((d: { catalog_phone?: string | null }) => {
        if (d.catalog_phone) setWaNumber(d.catalog_phone)
      })
      .catch(() => {})
  }, [])

  const waLink = waNumber ? `https://wa.me/${waNumber}` : null

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-5">

        <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
          <Clock className="h-10 w-10 text-amber-500" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          {orderId && (
            <p className="text-gray-500 text-sm mt-1">{t('order', { id: orderId })}</p>
          )}
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">{t('description')}</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 text-left space-y-1">
          <p className="font-semibold">{t('nextSteps')}</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>{t('step1')}</li>
            <li>{t('step2')}</li>
            <li>{t('step3')}</li>
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

export default function PendingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <PendingContent />
    </Suspense>
  )
}
