/**
 * GET /api/ml/questions
 *
 * Lista las preguntas sin responder del vendedor en MercadoLibre,
 * enriquecidas con título y thumbnail del ítem.
 *
 * Query params:
 *   status  — 'UNANSWERED' (default) | 'ANSWERED' | 'DELETED' | 'BANNED' | 'CLOSED_UNANSWERED'
 *   limit   — default 25, max 50
 *   offset  — default 0
 *
 * Respuesta:
 *   { questions: MLQuestion[], total: number }
 */

import { NextResponse }            from 'next/server'
import { requireBusinessId }       from '@/lib/get-business-id'
import { getMLToken, ML_API_BASE } from '@/lib/ml-auth'
import { getPublicSettingsByKeys } from '@/lib/settings'

export interface MLQuestion {
  id:          number
  text:        string
  status:      string
  date_created: string
  item_id:     string
  item_title:  string | null
  item_thumb:  string | null
  item_permalink: string | null
  buyer_id:    number | null
  answer:      { text: string; date_created: string } | null
}

interface RawQuestion {
  id:           number
  text:         string
  status:       string
  date_created: string
  item_id:      string
  from?:        { id: number }
  answer?:      { text: string; date_created: string } | null
}

interface RawItem {
  id:        string
  title?:    string
  thumbnail?: string
  permalink?: string
}

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url    = new URL(req.url)
  const status = url.searchParams.get('status') ?? 'UNANSWERED'
  const limit  = Math.min(parseInt(url.searchParams.get('limit')  ?? '25'), 50)
  const offset = parseInt(url.searchParams.get('offset') ?? '0')

  // Obtener seller (ml_user_id) y token
  const pub    = await getPublicSettingsByKeys(businessId, ['ml_user_id', 'ml_site_id'])
  const userId = pub.ml_user_id?.trim()
  if (!userId) {
    return NextResponse.json({ error: 'ML no configurado para este negocio' }, { status: 400 })
  }

  try {
    const token = await getMLToken(businessId)
    const headers = { Authorization: `Bearer ${token}` }

    // ── 1. Buscar preguntas del vendedor ───────────────────────────────────────
    const qs = new URLSearchParams({
      seller_id:   userId,
      status,
      api_version: '4',
      limit:       String(limit),
      offset:      String(offset),
      sort_fields: 'date_created',
      sort_types:  'DESC',
    })

    const qRes = await fetch(
      `${ML_API_BASE}/questions/search?${qs}`,
      { headers },
    )
    if (!qRes.ok) {
      const err = await qRes.text()
      throw new Error(`ML /questions/search ${qRes.status}: ${err}`)
    }

    const qData = await qRes.json() as {
      questions: RawQuestion[]
      total:     number
    }

    const rawQs = qData.questions ?? []

    if (!rawQs.length) {
      return NextResponse.json({ questions: [], total: qData.total ?? 0 })
    }

    // ── 2. Enriquecer con datos del ítem (batch) ──────────────────────────────
    const itemIds = [...new Set(rawQs.map(q => q.item_id))].join(',')

    const iRes = await fetch(
      `${ML_API_BASE}/items?ids=${itemIds}&attributes=id,title,thumbnail,permalink`,
      { headers },
    )

    const itemMap = new Map<string, RawItem>()
    if (iRes.ok) {
      const iData = await iRes.json() as Array<{ code: number; body: RawItem }>
      for (const row of iData) {
        if (row.code === 200 && row.body?.id) {
          // Thumbnail: https → fuerza HTTPS
          if (row.body.thumbnail) {
            row.body.thumbnail = row.body.thumbnail.replace(/^http:\/\//, 'https://')
          }
          itemMap.set(row.body.id, row.body)
        }
      }
    }

    // ── 3. Armar respuesta ────────────────────────────────────────────────────
    const questions: MLQuestion[] = rawQs.map(q => {
      const item = itemMap.get(q.item_id)
      return {
        id:           q.id,
        text:         q.text,
        status:       q.status,
        date_created: q.date_created,
        item_id:      q.item_id,
        item_title:   item?.title    ?? null,
        item_thumb:   item?.thumbnail ?? null,
        item_permalink: item?.permalink ?? null,
        buyer_id:     q.from?.id     ?? null,
        answer:       q.answer       ?? null,
      }
    })

    return NextResponse.json({ questions, total: qData.total ?? questions.length })

  } catch (err) {
    console.error('[ml/questions GET]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
