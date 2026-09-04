/**
 * POST /api/ml/answers
 *
 * Responde una pregunta de MercadoLibre.
 *
 * Body:
 *   { questionId: number; text: string }
 *
 * ML endpoint: POST /answers
 *   { "question_id": 123, "text": "Tu respuesta" }
 */

import { NextResponse }            from 'next/server'
import { requireBusinessId }       from '@/lib/get-business-id'
import { getMLToken, ML_API_BASE } from '@/lib/ml-auth'

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { questionId, text } = await req.json() as {
    questionId?: number
    text?:       string
  }

  if (!questionId || !text?.trim()) {
    return NextResponse.json(
      { error: 'questionId y text son requeridos' },
      { status: 400 },
    )
  }

  try {
    const token = await getMLToken(businessId)

    const mlRes = await fetch(`${ML_API_BASE}/answers`, {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question_id: questionId,
        text:        text.trim(),
      }),
    })

    if (!mlRes.ok) {
      const err = await mlRes.text()
      throw new Error(`ML /answers ${mlRes.status}: ${err}`)
    }

    const data = await mlRes.json()
    return NextResponse.json({ ok: true, answer: data })

  } catch (err) {
    console.error('[ml/answers POST]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
