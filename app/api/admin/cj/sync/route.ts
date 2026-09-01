import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'
import { getCJTokenForBusiness, getCJProductDetail, getCJFreight } from '@/lib/cj'

/**
 * GET /api/admin/cj/sync
 *
 * Devuelve la lista de productos CJ del negocio para que el cliente
 * pueda orquestar el sync uno a uno (evita el timeout de Netlify/Vercel).
 *
 * Responde:
 * { products: { id, cj_pid, name }[] }
 */
export async function GET() {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  const { rows } = await pool.query<{ id: number; cj_pid: string; name: string }>(
    `SELECT id, cj_pid, name
     FROM products
     WHERE business_id = $1
       AND cj_pid IS NOT NULL
     ORDER BY id`,
    [businessId],
  )

  return NextResponse.json({ products: rows })
}

/**
 * POST /api/admin/cj/sync
 *
 * Dos modos según el body:
 *
 * ① Sin body / body sin productId → sincroniza TODOS los productos CJ
 *   (modo legado, útil para cron jobs sin timeout).
 *
 * ② Body { productId: number } → sincroniza UN producto (~3s, dentro del
 *   límite de Netlify/Vercel). El frontend orquesta los calls uno a uno.
 *
 * Sincroniza:
 * ✅ Precio:        base_price = cj_cost_usd * (1 + markup_pct/100)
 * ✅ Imágenes:      general_image_url y cj_data (galería completa)
 * ✅ Freight:       cj_freight_options y cj_shipping_usd
 * ✅ Discontinuado: si listedNum === 0, marca exportable_web = false
 * ✅ Nombre:        actualiza si CJ cambió el nombre
 *
 * Devuelve { updated, discontinued, errors, total }
 */
export async function POST(req: Request) {
  const result = await requireBusinessId()
  if (result instanceof NextResponse) return result
  const { businessId } = result

  // ── Leer body opcional ────────────────────────────────────────────────────
  let productId: number | undefined
  try {
    const body = await req.json() as { productId?: number }
    if (body.productId) productId = Number(body.productId)
  } catch {
    // body vacío → sync completo (modo legado)
  }

  // ── Traer productos CJ del negocio ──────────────────────────────────────
  type ProductRow = {
    id:          number
    cj_pid:      string
    base_price:  number
    cj_cost_usd: number | null
    markup_pct:  number | null
  }

  let products: ProductRow[]
  try {
    const whereExtra = productId ? `AND id = ${productId}` : ''
    const { rows } = await pool.query<ProductRow>(
      `SELECT id, cj_pid, base_price::float,
              cj_cost_usd::float, markup_pct::float
       FROM products
       WHERE business_id = $1
         AND cj_pid IS NOT NULL
         ${whereExtra}`,
      [businessId],
    )
    products = rows
  } catch (err) {
    // Columnas de migration pendientes — fallback sin markup
    const errStr = String(err)
    if (errStr.includes('cj_cost_usd') || errStr.includes('markup_pct')) {
      console.warn('[CJ sync] Columnas cj_cost_usd/markup_pct no existen — ejecutar 20260831_cj_data.sql')
      const whereExtra = productId ? `AND id = ${productId}` : ''
      const { rows } = await pool.query<{ id: number; cj_pid: string; base_price: number }>(
        `SELECT id, cj_pid, base_price::float FROM products
         WHERE business_id = $1 AND cj_pid IS NOT NULL ${whereExtra}`,
        [businessId],
      )
      products = rows.map(r => ({ ...r, cj_cost_usd: null, markup_pct: null }))
    } else {
      throw err
    }
  }

  if (!products.length) {
    return NextResponse.json({
      updated: 0, discontinued: 0, errors: [], total: 0,
      message: productId ? 'Producto no encontrado' : 'No hay productos CJ para sincronizar',
    })
  }

  let token: string
  try {
    token = await getCJTokenForBusiness(businessId)
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }

  let updated      = 0
  let discontinued = 0
  const errors: { pid: string; error: string }[] = []

  for (const prod of products) {
    try {
      // ── 1. Detalle completo desde CJ ────────────────────────────────────
      const detail = await getCJProductDetail(token, prod.cj_pid)

      // ── 2. Producto discontinuado ────────────────────────────────────────
      if (detail.listedNum === 0) {
        await pool.query(
          `UPDATE products
           SET exportable_web = false,
               cj_last_sync   = NOW()
           WHERE id = $1`,
          [prod.id],
        )
        discontinued++
        console.log(`[CJ sync] Discontinuado: pid=${prod.cj_pid} (id=${prod.id})`)
        await pool.query(
          `INSERT INTO cj_sync_log (business_id, sync_type, product_id, status, detail)
           VALUES ($1, 'sync_discontinued', $2, 'ok', $3)`,
          [businessId, prod.id, JSON.stringify({ cjPid: prod.cj_pid, listedNum: 0 })]
        )
        continue
      }

      // ── 3. Precio con markup ─────────────────────────────────────────────
      const cjCostUsd = parseFloat(detail.sellPrice) || 0
      let markupPct   = prod.markup_pct ?? 0
      if (prod.markup_pct === null && prod.cj_cost_usd === null && cjCostUsd > 0) {
        markupPct = prod.base_price > 0
          ? Math.round(((prod.base_price / cjCostUsd) - 1) * 100)
          : 0
      }
      const newBasePrice = cjCostUsd * (1 + markupPct / 100)
      const mainImage    = detail.productImages?.[0] ?? detail.productImage ?? null

      // ── 4. Actualizar en DB ──────────────────────────────────────────────
      try {
        await pool.query(
          `UPDATE products
           SET name               = $1,
               base_price         = $2,
               cj_cost_usd        = $3,
               markup_pct         = $4,
               general_image_url  = $5,
               cj_data            = $6,
               cj_last_sync       = NOW()
           WHERE id = $7`,
          [
            detail.productName.slice(0, 150),
            newBasePrice.toFixed(2),
            cjCostUsd.toFixed(2),
            markupPct,
            mainImage,
            JSON.stringify(detail),
            prod.id,
          ],
        )
      } catch (updateErr) {
        if (String(updateErr).match(/cj_data|cj_cost_usd|markup_pct/)) {
          console.warn(`[CJ sync] Migration pendiente, sync parcial para id=${prod.id}`)
          await pool.query(
            `UPDATE products
             SET name         = $1,
                 base_price   = $2,
                 cj_last_sync = NOW()
             WHERE id = $3`,
            [detail.productName.slice(0, 150), newBasePrice.toFixed(2), prod.id],
          )
        } else {
          throw updateErr
        }
      }

      // ── 5. Sync variant images ──────────────────────────────────────────────
      // Actualiza specific_image_url en product_variants desde cj_data.
      // Match por cj_vid. Solo pisa si CJ tiene una imagen no vacía.
      const variants = detail.variants ?? []
      if (variants.length > 0) {
        for (const v of variants) {
          if (!v.vid || !v.variantImage) continue
          await pool.query(
            `UPDATE product_variants
             SET specific_image_url = $1
             WHERE product_id = $2
               AND cj_vid    = $3`,
            [v.variantImage, prod.id, v.vid],
          ).catch(err => {
            // cj_vid columna podría no existir en instancias antiguas
            if (!String(err).includes('cj_vid')) throw err
            console.warn(`[CJ sync] cj_vid column missing, skipping variant images for id=${prod.id}`)
          })
        }
      }

      // ── 6. Freight options ───────────────────────────────────────────────
      // Usar el variant de mayor precio como representante (proxy de peso/tamaño).
      // Es conservador: evita sub-cotizar envío para variantes más caras/pesadas.

      const repVariant = variants.length > 1
        ? [...variants].sort((a, b) =>
            parseFloat(b.variantSellPrice || '0') - parseFloat(a.variantSellPrice || '0')
          )[0]
        : variants[0]
      const repVid = repVariant?.vid
      if (repVid) {
        await new Promise(r => setTimeout(r, 500))
        try {
          const freightOpts = await getCJFreight(token, {
            vid:              repVid,
            quantity:         1,
            startCountryCode: 'US',
            endCountryCode:   'US',
          })
          if (freightOpts.length > 0) {
            await pool.query(
              `UPDATE products
               SET cj_freight_options = $1,
                   cj_shipping_usd    = $2
               WHERE id = $3`,
              [JSON.stringify(freightOpts), freightOpts[0].freight, prod.id],
            ).catch(err2 => {
              if (!String(err2).match(/cj_freight_options|cj_shipping_usd/)) throw err2
              console.warn(`[CJ sync] freight columns missing, skipping id=${prod.id}`)
            })
          }
        } catch (freightErr) {
          console.warn(`[CJ sync] Freight pid=${prod.cj_pid}:`, String(freightErr).slice(0, 120))
        }
      }

      updated++

      // Pausa entre productos (rate limit CJ ~1 req/seg)
      if (products.length > 1) await new Promise(r => setTimeout(r, 500))

    } catch (err) {
      console.error(`[CJ sync] Error pid=${prod.cj_pid}:`, err)
      errors.push({ pid: prod.cj_pid, error: String(err) })
    }
  }

  // ── Log de sync (solo para sync completo, no por producto individual) ─────
  if (!productId) {
    await pool.query(
      `INSERT INTO cj_sync_log (business_id, sync_type, status, detail)
       VALUES ($1, 'full_sync', $2, $3)`,
      [
        businessId,
        errors.length === 0 ? 'ok' : 'partial_error',
        JSON.stringify({ total: products.length, updated, discontinued, errors: errors.length }),
      ],
    )
  }

  return NextResponse.json({ updated, discontinued, errors, total: products.length })
}
