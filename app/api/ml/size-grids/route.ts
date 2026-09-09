/**
 * /api/ml/size-grids
 *
 * GET  ?categoryId=MLA109085
 *   → Devuelve la guía de talles guardada para esa categoría (o null si no existe).
 *
 * POST { action: 'discover', categoryId: 'MLA109085' }
 *   → Lee TODOS los ítems propios del vendedor en esa categoría,
 *     extrae SIZE_GRID_ID + mapeo SIZE→SIZE_GRID_ROW_ID,
 *     y guarda/actualiza en ml_size_grids.
 *
 * POST { action: 'seed', categoryId: 'MLA109085', gridId: '7498374', rowMap: {...} }
 *   → Carga manual del grid (si el auto-discovery no alcanza).
 */

import { NextResponse }      from 'next/server'
import pool                  from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { mlFetch }           from '@/lib/ml-service'

interface SizeGridRow {
  id:               number
  business_id:      number
  category_id:      string
  grid_id:          string
  row_map:          Record<string, string>
  grid_name:        string | null
  discovered_from:  string | null
  created_at:       string
  updated_at:       string
}

// ── GET ───────────────────────────────────────────────────────────────────────
// Sin categoryId → lista todos los grids del negocio
// Con ?categoryId=MLA109085 → un grid específico (o null)

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const categoryId = new URL(req.url).searchParams.get('categoryId')

  if (!categoryId) {
    const { rows } = await pool.query<SizeGridRow>(
      `SELECT * FROM ml_size_grids WHERE business_id = $1 ORDER BY category_id`,
      [businessId],
    )
    return NextResponse.json(rows)
  }

  const { rows } = await pool.query<SizeGridRow>(
    `SELECT * FROM ml_size_grids WHERE business_id = $1 AND category_id = $2 LIMIT 1`,
    [businessId, categoryId],
  )

  return NextResponse.json(rows[0] ?? null)
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    action:      'discover' | 'seed'
    categoryId:  string
    // Solo para action='seed':
    gridId?:     string
    rowMap?:     Record<string, string>
    gridName?:   string
  }

  const { action, categoryId } = body
  if (!categoryId) return NextResponse.json({ error: 'categoryId requerido' }, { status: 400 })

  // ── Seed manual ────────────────────────────────────────────────────────────
  if (action === 'seed') {
    const { gridId, rowMap, gridName } = body
    if (!gridId || !rowMap) {
      return NextResponse.json({ error: 'gridId y rowMap requeridos para seed' }, { status: 400 })
    }

    const { rows } = await pool.query<SizeGridRow>(
      `INSERT INTO ml_size_grids (business_id, category_id, grid_id, row_map, grid_name)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (business_id, category_id) DO UPDATE
         SET grid_id    = EXCLUDED.grid_id,
             row_map    = EXCLUDED.row_map,
             grid_name  = EXCLUDED.grid_name,
             updated_at = NOW()
       RETURNING *`,
      [businessId, categoryId, gridId, JSON.stringify(rowMap), gridName ?? null],
    )

    return NextResponse.json({ ok: true, grid: rows[0] })
  }

  // ── Discover desde ítems propios ───────────────────────────────────────────
  if (action !== 'discover') {
    return NextResponse.json({ error: 'action debe ser "discover" o "seed"' }, { status: 400 })
  }

  try {
    // 1. Obtener ml_user_id
    const user = await mlFetch<{ id: number }>(businessId, '/users/me')
    const mlUserId = user.id

    // 2. Buscar todos los ítems propios en la categoría (hasta 50)
    const searchRes = await mlFetch<{ results: string[]; paging: { total: number } }>(
      businessId,
      `/users/${mlUserId}/items/search?category=${categoryId}&limit=50`,
    )

    if (!searchRes.results?.length) {
      return NextResponse.json(
        {
          error: `No tenés ítems publicados en la categoría ${categoryId}. Publicá al menos uno a mano en MercadoLibre para descubrir la guía de talles.`,
          total: 0,
        },
        { status: 404 },
      )
    }

    // 3. Leer atributos de cada ítem para construir el mapa
    let gridId:   string | null = null
    let gridName: string | null = null
    const rowMap: Record<string, string> = {}
    const readItems: string[] = []

    for (const mlItemId of searchRes.results) {
      try {
        const item = await mlFetch<{
          id:         string
          attributes: Array<{
            id:         string
            name:       string
            value_id:   string | null
            value_name: string | null
            values:     Array<{ id: string | null; name: string | null }>
          }>
        }>(businessId, `/items/${mlItemId}?include_attributes=all`)

        const attrs = item.attributes ?? []

        const sizeAttr    = attrs.find(a => a.id === 'SIZE')
        const gridIdAttr  = attrs.find(a => a.id === 'SIZE_GRID_ID')
        const gridRowAttr = attrs.find(a => a.id === 'SIZE_GRID_ROW_ID')

        if (gridIdAttr?.value_name) {
          gridId = gridIdAttr.value_name
          if (!gridName) gridName = gridIdAttr.name  // "ID de la guía de talles"
        }

        if (sizeAttr?.value_name && gridRowAttr?.value_name) {
          rowMap[sizeAttr.value_name] = gridRowAttr.value_name
        }

        readItems.push(mlItemId)
      } catch (e) {
        console.warn(`[size-grids discover] Error leyendo ${mlItemId}:`, e)
      }
    }

    if (!gridId) {
      return NextResponse.json(
        {
          error: `No se encontró SIZE_GRID_ID en los ${readItems.length} ítems de la categoría ${categoryId}. Puede que esta categoría no use guía de talles.`,
          readItems,
        },
        { status: 404 },
      )
    }

    // 4. Guardar en DB
    const { rows } = await pool.query<SizeGridRow>(
      `INSERT INTO ml_size_grids
         (business_id, category_id, grid_id, row_map, grid_name, discovered_from)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (business_id, category_id) DO UPDATE
         SET grid_id         = EXCLUDED.grid_id,
             row_map         = ml_size_grids.row_map || EXCLUDED.row_map,
             grid_name       = COALESCE(EXCLUDED.grid_name, ml_size_grids.grid_name),
             discovered_from = EXCLUDED.discovered_from,
             updated_at      = NOW()
       RETURNING *`,
      [
        businessId,
        categoryId,
        gridId,
        JSON.stringify(rowMap),
        gridName,
        readItems[0] ?? null,
      ],
    )

    return NextResponse.json({
      ok:         true,
      grid:       rows[0],
      readItems,
      rowsFound:  Object.keys(rowMap).length,
    })
  } catch (e) {
    console.error('[size-grids discover]', e)
    return NextResponse.json(
      { error: String(e).replace('Error: ', '') },
      { status: 500 },
    )
  }
}
