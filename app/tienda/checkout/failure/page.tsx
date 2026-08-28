"use client"

import { Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { useTranslations } from 'next-intl'
import { XCircle, RefreshCw } from "lucide-react"
import { useStoreHref } from "../../_context/store-path-context"
import Link from "next/link"

/**
 * /tienda/checkout/failure  (alias /store/checkout/failure for US)
 *
 * Back-URL for MercadoPago when payment fails or is rejected.
 * Cart is NOT cleared — user can retry.
 */

function FailureContent() {
  const params    = useSearchParams()
  const orderId   = params.get('orderId')
  const router    = useRouter()
  const t         = useTranslations('PaymentFailure')
  const storeHref = useStoreHref('')

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm p-8 max-w-sm w-full text-center space-y-5">

        <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <XCircle className="h-10 w-10 text-red-500" />
        </div>

        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('title')}</h1>
          {orderId && (
            <p className="text-gray-500 text-sm mt-1">{t('order', { id: orderId })}</p>
          )}
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">{t('description')}</p>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-700 text-left space-y-1">
          <p className="font-semibold">{t('reasons')}</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>{t('reason1')}</li>
            <li>{t('reason2')}</li>
            <li>{t('reason3')}</li>
          </ul>
        </div>

        <button
          onClick={() => router.back()}
          className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white font-bold text-sm transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {t('retry')}
        </button>

        <Link
          href={storeHref}
          className="block text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          {t('backToStore')}
        </Link>
      </div>
    </div>
  )
}

export default function FailurePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <FailureContent />
    </Suspense>
  )
}
