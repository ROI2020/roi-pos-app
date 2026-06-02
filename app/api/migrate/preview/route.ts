import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import pool from '@/lib/db'

// ── Helpers ────────────────────────────────────────────────────────────────────

function normCol(s: string): string {
  return s.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[*?¿¡]/g, '').trim()
}

function parseNum(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') return v
  const s = String(v).replace(',', '.').replace(/[^0-9.-]/g, '')
  return parseFloat(s) || 0
}

// Detecta sufijo de talle: "CAMISETA - 10" → {base:"CAMISETA", size:"10"}
function detectSize(name: string): { base: string; size: string | null } {
  const match = name.match(/^(.+?)\s+-\s+(\S+)\s*$/)
  if (match) return { base: match[1].trim(), size: match[2].trim() }
  return { base: name.trim(), size: null }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface RawRow {
  name: string
  category: string | null
  sku_code: string | null
  description: string | null
  unit_cost: number
  base_price: number
  stock: number
}

export interface VariantSpec {
  size: string
  color: string
  stock: number // 1 = crear fila en inventory, 0 = no
  sku_hint: string | null
}

export interface ProductGroup {
  base_name: string
  category_name: string | null
  description: string | null
  base_price: number
  unit_cost: number
  variants: VariantSpec[]
}

// ── Mapeo de columnas ──────────────────────────────────────────────────────────

const COL_MAP: Record<string, string> = {
  'nombre': 'name', 'nombre*': 'name',
  'categoria': 'category', 'categoría': 'category',
  'codigo': 'sku', 'código': 'sku', 'codigo de barras': 'sku',
  'descripcion': 'description', 'descripción': 'description',
  'costo unitario': 'unit_cost', 'costo': 'unit_cost',
  'precio': 'base_price', 'precio*': 'base_price', 'precio de venta': 'base_price',
  'stock actual': 'stock', 'stock': 'stock',
}

// ── Handler ────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

    const buffer  = await file.arrayBuffer()
    const wb      = XLSX.read(Buffer.from(buffer), { type: 'buffer' })
    const sheet   = wb.Sheets[wb.SheetNames[0]]
    const rawData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][]

    if (rawData.length < 2) {
      return NextResponse.json({ error: 'El archivo no tiene datos' }, { status: 400 })
    }

    // Mapear cabeceras
    const headers = (rawData[0] as unknown[]).map(h => normCol(String(h)))
    const colIdx: Record<string, number> = {}
    for (let i = 0; i < headers.length; i++) {
      const mapped = COL_MAP[headers[i]]
      if (mapped && !(mapped in colIdx)) colIdx[mapped] = i
    }

    if (!('name' in colIdx))       return NextResponse.json({ error: 'Columna "Nombre" no encontrada' }, { status: 400 })
    if (!('base_price' in colIdx)) return NextResponse.json({ error: 'Columna "Precio" no encontrada' }, { status: 400 })

    // Parsear filas
    const rows: RawRow[] = []
    for (let i = 1; i < rawData.length; i++) {
      const row  = rawData[i] as unknown[]
      const name = String(row[colIdx.name] ?? '').trim()
      if (!name) continue

      rows.push({
        name,
        category:    colIdx.category    != null ? String(row[colIdx.category]    ?? '').trim() || null : null,
        sku_code:    colIdx.sku         != null ? String(row[colIdx.sku]         ?? '').trim() || null : null,
        description: colIdx.description != null ? String(row[colIdx.description] ?? '').trim() || null : null,
        unit_cost:   parseNum(colIdx.unit_cost != null ? row[colIdx.unit_cost] : 0),
        base_price:  parseNum(row[colIdx.base_price]),
        stock:       Math.max(0, Math.round(parseNum(colIdx.stock != null ? row[colIdx.stock] : 0))),
      })
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: 'No se encontraron filas con datos' }, { status: 400 })
    }

    // Agrupar por nombre base (detecta sufijo de talle)
    const groupMap = new Map<string, { rows: RawRow[]; isSizeGroup: boolean }>()

    for (const row of rows) {
      const { base, size } = detectSize(row.name)
      const key = base.toUpperCase().trim()
      if (!groupMap.has(key)) groupMap.set(key, { rows: [], isSizeGroup: false })
      const g = groupMap.get(key)!
      g.rows.push(row)
      if (size !== null) g.isSizeGroup = true
    }

    // Construir ProductGroup[]
    const groups: ProductGroup[] = []
    const allCategories: string[] = []

    for (const [, group] of groupMap) {
      const { base } = detectSize(group.rows[0].name)

      const category_name = group.rows.find(r => r.category)?.category ?? null
      if (category_name) allCategories.push(category_name)

      const description = group.rows
        .map(r => r.description).filter(Boolean)
        .reduce((a, b) => ((b?.length ?? 0) > (a?.length ?? 0) ? b : a), null as string | null)

      const base_price = Math.max(...group.rows.map(r => r.base_price))
      const unit_cost  = group.rows.find(r => r.unit_cost > 0)?.unit_cost ?? 0

      const variants: VariantSpec[] = []

      if (group.isSizeGroup) {
        // Un registro = una variante (por talle)
        for (const row of group.rows) {
          const { size } = detectSize(row.name)
          const sz    = size ?? 'X'
          const stock = row.stock

          if (stock <= 1) {
            variants.push({ size: sz, color: 'Varios', stock, sku_hint: row.sku_code })
          } else {
            // Múltiples unidades del mismo talle → N variantes
            for (let n = 0; n < stock; n++) {
              variants.push({ size: sz, color: 'Varios', stock: 1, sku_hint: n === 0 ? row.sku_code : null })
            }
          }
        }
      } else {
        // Producto individual: stock > 1 → N variantes con talle X
        const stock = group.rows[0].stock
        if (stock === 0) {
          variants.push({ size: 'X', color: 'Varios', stock: 0, sku_hint: group.rows[0].sku_code })
        } else {
          for (let n = 0; n < stock; n++) {
            variants.push({ size: 'X', color: 'Varios', stock: 1, sku_hint: n === 0 ? group.rows[0].sku_code : null })
          }
        }
      }

      groups.push({ base_name: base, category_name, description, base_price, unit_cost, variants })
    }

    // Categorías nuevas vs existentes
    const uniqueCats = [...new Set(allCategories.map(c => c.toLowerCase()))]
    const { rows: existingCats } = uniqueCats.length > 0
      ? await pool.query<{ name: string }>(
          `SELECT LOWER(name) AS name FROM categories WHERE LOWER(name) = ANY($1)`, [uniqueCats]
        )
      : { rows: [] }
    const existingSet = new Set(existingCats.map(r => r.name))
    const cats_new = [...new Set(allCategories.filter(c => !existingSet.has(c.toLowerCase())))]

    // Sucursales
    const { rows: branches } = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM branches ORDER BY name`
    )

    const stats = {
      total_rows:       rows.length,
      total_products:   groups.length,
      total_variants:   groups.reduce((s, g) => s + g.variants.length, 0),
      total_inventory:  groups.reduce((s, g) => s + g.variants.filter(v => v.stock > 0).length, 0),
      cats_new_count:   cats_new.length,
      cats_new,
    }

    return NextResponse.json({ groups, stats, branches })

  } catch (err) {
    console.error('[POST /api/migrate/preview]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
