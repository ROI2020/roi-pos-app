import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireFeature } from '@/lib/plan-gate'

const client = new Anthropic()

const ESTILO_PROMPTS: Record<string, string> = {
  comercial:   'Escribí una descripción breve en tono coloquial argentino (usá "vos"), atractiva y vendedora. Enfocate en lo que hace especial al producto. Máximo 3 oraciones.',
  descriptivo: 'Describí el producto de manera objetiva y detallada. Mencioná características, material y usos posibles. Máximo 3 oraciones.',
  emocional:   'Escribí una descripción que conecte emocionalmente con el comprador. Evocá sensaciones, estilo de vida o momentos especiales. Máximo 3 oraciones.',
  minimalista: 'Describí el producto en 1 o 2 oraciones muy breves y directas. Solo lo esencial.',
}

export async function POST(req: NextRequest) {
  const blocked = await requireFeature('ai.descriptions')
  if (blocked) return blocked

  try {
    const body = await req.json()
    const {
      imagenBase64,
      mimeType,
      nombre,
      talles,
      precio,
      categoria,
      modelo = 'claude-haiku-4-5-20251001',
      estilo = 'comercial',
      descripcionAnterior,
    } = body

    if (!imagenBase64 || !nombre) {
      return NextResponse.json(
        { error: 'Faltan campos obligatorios: imagenBase64 y nombre' },
        { status: 400 },
      )
    }

    const contexto = [
      `Producto: ${nombre}`,
      categoria ? `Categoría: ${categoria}` : null,
      precio    ? `Precio: $${precio}`       : null,
      talles    ? `Talles: ${talles}`        : null,
    ].filter(Boolean).join('\n')

    const estiloPrompt = ESTILO_PROMPTS[estilo] ?? ESTILO_PROMPTS.comercial

    const system = descripcionAnterior
      ? `Sos un experto en marketing para tiendas de ropa argentina. ${estiloPrompt} IMPORTANTE: Ya existe una descripción anterior ("${descripcionAnterior}"). Generá una DIFERENTE, sin repetir ideas ni frases.`
      : `Sos un experto en marketing para tiendas de ropa argentina. ${estiloPrompt}`

    const response = await client.messages.create({
      model: modelo,
      max_tokens: 300,
      system,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: (mimeType ?? 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imagenBase64,
            },
          },
          { type: 'text', text: contexto },
        ],
      }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const descripcion = textBlock?.type === 'text' ? textBlock.text.trim() : ''

    return NextResponse.json({ descripcion, modelo, estilo })
  } catch (err: unknown) {
    console.error('[generar-descripcion]', err)
    const message = err instanceof Error ? err.message : 'Error inesperado al generar descripción'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
