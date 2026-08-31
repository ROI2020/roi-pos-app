/**
 * app/tienda/p/[slug]/page.tsx — Server Component
 *
 * Renderiza páginas de contenido de la tienda (Shipping Policy, Terms, FAQ…)
 * El contenido HTML lo gestiona el admin desde el panel de configuración.
 * La ruta hereda el layout de tienda/layout.tsx (idioma, tema, carrito).
 */

import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import pool from '@/lib/db'
import { resolveBusinessFromHost } from '@/lib/tenant-api'
import { getPublicSettingsByKeys } from '@/lib/settings'
import { ArrowLeft } from 'lucide-react'
import type { Metadata } from 'next'

interface PageData {
  title:      string
  content:    string
  updated_at: string
}

async function getPage(businessId: number, slug: string): Promise<PageData | null> {
  const { rows } = await pool.query<PageData>(
    `SELECT title, content, updated_at
     FROM store_pages
     WHERE business_id = $1 AND slug = $2 AND is_published = true
     LIMIT 1`,
    [businessId, slug]
  )
  return rows[0] ?? null
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params
  const h = await headers()
  const host = h.get('host') ?? 'localhost'
  try {
    const businessId = await resolveBusinessFromHost(host)
    const page = await getPage(businessId, slug)
    const s    = await getPublicSettingsByKeys(businessId, ['business_name'])
    return {
      title: page ? `${page.title} — ${s.business_name ?? ''}` : 'Página no encontrada',
    }
  } catch {
    return { title: 'Tienda' }
  }
}

export default async function StorePage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params
  const h = await headers()
  const host = h.get('host') ?? 'localhost'

  let businessId: number
  try {
    businessId = await resolveBusinessFromHost(host)
  } catch {
    notFound()
  }

  const [page, s] = await Promise.all([
    getPage(businessId!, slug),
    getPublicSettingsByKeys(businessId!, ['business_name', 'business_logo']),
  ])

  if (!page) notFound()

  const updatedDate = new Intl.DateTimeFormat('es-AR', {
    day: 'numeric', month: 'long', year: 'numeric',
  }).format(new Date(page.updated_at))

  return (
    <div className="min-h-screen store-page">

      {/* Mini-header de la tienda */}
      <header className="store-surface border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <a href="/tienda" className="flex items-center gap-1.5 text-sm store-text-muted store-hover-primary transition-colors">
            <ArrowLeft className="h-4 w-4" />
            Volver a la tienda
          </a>
          {s.business_logo && (
            <img src={s.business_logo} alt={s.business_name ?? ''} className="h-7 object-contain ml-auto" />
          )}
        </div>
      </header>

      {/* Contenido */}
      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* Título y fecha */}
        <div className="mb-8 pb-6 border-b">
          <h1 className="text-3xl font-bold tracking-tight">{page.title}</h1>
          <p className="mt-2 text-sm store-text-muted">
            Última actualización: {updatedDate}
          </p>
        </div>

        {/* HTML del contenido — gestionado por el admin */}
        {/* eslint-disable-next-line react/no-danger */}
        <div
          className="prose-store"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </main>

      {/* Footer mínimo */}
      <footer className="store-surface border-t mt-16 py-6">
        <p className="text-center text-xs store-text-muted">
          {s.business_name}
        </p>
      </footer>
    </div>
  )
}
