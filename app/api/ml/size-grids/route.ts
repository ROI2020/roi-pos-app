/**
 * /api/ml/size-grids
 *
 * GET  (sin params)              → lista todos los grids del negocio
 * GET  ?categoryId=MLA109085     → todos los grids de esa categoría (por género)
 *
 * POST { action: 'discover', categoryId }
 *   → Lee ítems propios, extrae SIZE_GRID_ID + género + mapa SIZE→ROW_ID.
 *     Guarda una fila por género distinto encontrado.
 *
 * POST { action: 'seed', categoryId, gender, gridId, rowMap }
 *   → Carga manual del grid para una categoría+género específico.
 */

import { NextResponse }      from 'next/server'
import pool                  from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { mlFetch }           from '@/lib/ml-service'

interface SizeGridRow {
  id:               number
  business_id:      number
  category_id:      string
  gender:           string
  grid_id:          string
  row_map:          Record<string, string>
  grid_name:        string | null
  discovered_from:  string | null
  created_at:       string
  updated_at:       string
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const categoryId = new URL(req.url).searchParams.get('categoryId')

  if (!categoryId) {
    const { rows } = await pool.query<SizeGridRow>(
      `SELECT * FROM ml_size_grids WHERE business_id = $1 ORDER BY category_id, gender`,
      [businessId],
    )
    return NextResponse.json(rows)
  }

  // Devuelve TODOS los grids de la categoría (uno por género)
  const { rows } = await pool.query<SizeGridRow>(
    `SELECT * FROM ml_size_grids WHERE business_id = $1 AND category_id = $2 ORDER BY gender`,
    [businessId, categoryId],
  )
  return NextResponse.json(rows)
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const body = await req.json() as {
    action:      'discover' | 'seed'
    categoryId:  string
    gender?:     string
    gridId?:     string
    rowMap?:     Record<string, string>
    gridName?:   string
  }

  const { action, categoryId } = body
  if (!categoryId) return NextResponse.json({ error: 'categoryId requerido' }, { status: 400 })

  // ── Seed manual ────────────────────────────────────────────────────────────
  if (action === 'seed') {
    const { gridId, rowMap, gridName, gender } = body
    if (!gridId || !rowMap || !gender) {
      return NextResponse.json({ error: 'gridId, rowMap y gender son requeridos para seed' }, { status: 400 })
    }

    const { rows } = await pool.query<SizeGridRow>(
      `INSERT INTO ml_size_grids (business_id, category_id, gender, grid_id, row_map, grid_name)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (business_id, category_id, gender) DO UPDATE
         SET grid_id    = EXCLUDED.grid_id,
             row_map    = EXCLUDED.row_map,
             grid_name  = EXCLUDED.grid_name,
             updated_at = NOW()
       RETURNING *`,
      [businessId, categoryId, gender, gridId, JSON.stringify(rowMap), gridName ?? null],
    )

    return NextResponse.json({ ok: true, grid: rows[0] })
  }

  // ── Discover desde ítems propios ───────────────────────────────────────────
  if (action !== 'discover') {
    return NextResponse.json({ error: 'action debe ser "discover" o "seed"' }, { status: 400 })
  }

  try {
    const user      = await mlFetch<{ id: number }>(businessId, '/users/me')
    const mlUserId  = user.id

    const searchRes = await mlFetch<{ results: string[]; paging: { total: number } }>(
      businessId,
      `/users/${mlUserId}/items/search?category=${categoryId}&limit=50`,
    )

    if (!searchRes.results?.length) {
      return NextResponse.json(
        { error: `No tenés ítems publicados en ${categoryId}. Publicá uno a mano en ML para descubrir la guía de talles.`, total: 0 },
        { status: 404 },
      )
    }

    // Acumulamos por gender → { gridId, gridName, rowMap }
    const byGender: Record<string, { gridId: string; gridName: string | null; rowMap: Record<string, string>; discoveredFrom: string }> = {}

    for (const mlItemId of searchRes.results) {
      try {
        const item = await mlFetch<{
          id:         string
          attributes: Array<{ id: string; name: string; value_id: string | null; value_name: string | null }>
        }>(businessId, `/items/${mlItemId}?include_attributes=all`)

        const attrs       = item.attributes ?? []
        const sizeAttr    = attrs.find(a => a.id === 'SIZE')
        const genderAttr  = attrs.find(a => a.id === 'GENDER')
        const gridIdAttr  = attrs.find(a => a.id === 'SIZE_GRID_ID')
        const gridRowAttr = attrs.find(a => a.id === 'SIZE_GRID_ROW_ID')

        if (!gridIdAttr?.value_name) continue

        const gender  = genderAttr?.value_name ?? 'Unisex'
        const gridId  = gridIdAttr.value_name

        if (!byGender[gender]) {
          byGender[gender] = { gridId, gridName: gridIdAttr.name ?? null, rowMap: {}, discoveredFrom: mlItemId }
        }

        if (sizeAttr?.value_name && gridRowAttr?.value_name) {
          byGender[gender].rowMap[sizeAttr.value_name] = gridRowAttr.value_name
        }
      } catch (e) {
        console.warn(`[size-grids discover] Error leyendo ${mlItemId}:`, e)
      }
    }

    if (!Object.keys(byGender).length) {
      return NextResponse.json(
        { error: `No se encontró SIZE_GRID_ID en los ítems de ${categoryId}. Puede que esta categoría no use guía de talles.` },
        { status: 404 },
      )
    }

    // Guardar una fila por gender
    const savedGrids: SizeGridRow[] = []
    for (const [gender, data] of Object.entries(byGender)) {
      const { rows } = await pool.query<SizeGridRow>(
        `INSERT INTO ml_size_grids
           (business_id, category_id, gender, grid_id, row_map, grid_name, discovered_from)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (business_id, category_id, gender) DO UPDATE
           SET grid_id         = EXCLUDED.grid_id,
               row_map         = ml_size_grids.row_map || EXCLUDED.row_map,
               grid_name       = COALESCE(EXCLUDED.grid_name, ml_size_grids.grid_name),
               discovered_from = EXCLUDED.discovered_from,
               updated_at      = NOW()
         RETURNING *`,
        [businessId, categoryId, gender, data.gridId, JSON.stringify(data.rowMap), data.gridName, data.discoveredFrom],
      )
      savedGrids.push(rows[0])
    }

    return NextResponse.json({
      ok:        true,
      grids:     savedGrids,
      rowsFound: savedGrids.reduce((n, g) => n + Object.keys(g.row_map).length, 0),
    })
  } catch (e) {
    console.error('[size-grids discover]', e)
    return NextResponse.json({ error: String(e).replace('Error: ', '') }, { status: 500 })
  }
}
