/**
 * GET /api/ml/category-attributes?categoryId=MLA109027
 *
 * Devuelve los atributos requeridos de una categoría ML.
 * Se usa en el modal de publicación para mostrar los campos obligatorios.
 *
 * Excluye COLOR y SIZE porque van en attribute_combinations de las variantes.
 */

import { NextResponse }      from 'next/server'
import { requireBusinessId } from '@/lib/get-business-id'
import { mlFetch }           from '@/lib/ml-service'

interface MLRawAttribute {
  id:     string
  name:   string
  tags:   Record<string, boolean>
  values?: Array<{ id: string; name: string }>
  value_type?: string
}

export interface MLRequiredAttribute {
  id:         string
  name:       string
  values:     Array<{ id: string; name: string }>   // vacío = texto libre
  value_type: string
}

// Atributos que van en variations.attribute_combinations — no los pedimos de nuevo
const VARIATION_ATTRS = new Set(['COLOR', 'SIZE'])

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const url        = new URL(req.url)
  const categoryId = url.searchParams.get('categoryId')
  if (!categoryId) {
    return NextResponse.json({ error: 'categoryId requerido' }, { status: 400 })
  }

  try {
    const attrs = await mlFetch<MLRawAttribute[]>(
      businessId,
      `/categories/${categoryId}/attributes`,
    )

    const required: MLRequiredAttribute[] = attrs
      .filter(a =>
        a.tags?.required === true &&
        !VARIATION_ATTRS.has(a.id),
      )
      .map(a => ({
        id:         a.id,
        name:       a.name,
        values:     a.values ?? [],
        value_type: a.value_type ?? 'string',
      }))

    return NextResponse.json(required)
  } catch (err) {
    console.error('[ml/category-attributes]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
