/**
 * POST /api/ml/webhook
 *
 * Recibe notificaciones de MercadoLibre (Webhooks API).
 *
 * ML envía notificaciones para estos topics:
 *   orders_v2  → pedido confirmado / cancelado
 *   items      → cambio en una publicación
 *   questions  → pregunta de un comprador (ignorado por ahora)
 *
 * Cuando llega un pedido 'paid':
 *   1. Busca las variantes en ml_items por ml_item_id + ml_variation_id
 *   2. Descuenta stock en branch_inventory de ROIPOS
 *   3. Dispara actualización de stock de vuelta a ML
 *   4. Si stock = 0 → pausa la publicación
 *
 * Responde 200 SIEMPRE — si devolvemos 4xx/5xx ML reintenta indefinidamente.
 *
 * Validación de firma:
 *   ML envía x-signature: ts=<timestamp>,v1=<hmac>
 *   Se valida con ml_app_secret del negocio.
 *
 * Docs: https://developers.mercadolibre.com.ar/es_ar/recibir-notificaciones
 */

import { NextResponse } from 'next/server'
import { createHmac }   from 'crypto'
import pool             from '@/lib/db'
import { getSecretSetting, getPublicSettingsByKeys } from '@/lib/settings'
import { getMLOrder, updateVariantStock, updateItemStock, pauseListing } from '@/lib/ml-service'
import { sendMLConfirmation } from '@/lib/ml-messages'
import { insertTransaction }  from '@/lib/transactions'

// ── Tipos del body del webhook ────────────────────────────────────────────────

interface MLWebhookBody {
  _id?:      string
  resource:  string   // ej: "/orders/1234567890" | "/items/MLA1234567890"
  topic:     string   // ej: "orders_v2" | "items"
  user_id:   number   // vendedor ML (= ml_user_id del negocio)
  sent?:     string
  attempts?: number
}

// ── Validación de firma ───────────────────────────────────────────────────────

async function verifyMLSignature(
  req:        Request,
  body:       string,
  businessId: number,
): Promise<boolean> {
  try {
    const signature = req.headers.get('x-signature')
    if (!signature) return false   // en dev ML puede no enviarla

    // x-signature: ts=<timestamp>,v1=<hmac>
    const parts    = Object.fromEntries(signature.split(',').map(p => p.split('=')))
    const ts       = parts['ts']
    const v1       = parts['v1']
    if (!ts || !v1) return false

    const appSecret = await getSecretSetting(businessId, 'ml_app_secret')
    if (!appSecret) return false

    // ML firma: HMAC-SHA256 de "ts:<timestamp>;payload:<body>"
    const message  = `ts:${ts};payload:${body}`
    const expected = createHmac('sha256', appSecret).update(message).digest('hex')

    return expected === v1
  } catch {
    return false
  }
}

// ── Handler principal ─────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let rawBody = ''
  try {
    rawBody = await req.text()
    const body = JSON.parse(rawBody) as MLWebhookBody

    // Buscar el negocio por ml_user_id
    const { rows: bizRows } = await pool.query<{ business_id: number }>(
      `SELECT s.business_id
       FROM settings s
       WHERE s.key = 'ml_user_id'
         AND s.value = $1
         AND s.is_secret = false
       LIMIT 1`,
      [String(body.user_id)],
    )

    if (!bizRows.length) {
      // user_id no registrado — puede ser una notificación de otra cuenta
      console.warn(`[ml/webhook] user_id ${body.user_id} no encontrado en settings`)
      return NextResponse.json({ ok: true }, { status: 200 })
    }

    const businessId = bizRows[0].business_id

    // Verificar firma HMAC
    // En desarrollo (sin ml_app_secret configurado) la verificación devuelve false →
    // solo se omite si NODE_ENV !== 'production', para poder testear localmente.
    const sigOk = await verifyMLSignature(req, rawBody, businessId)
    if (!sigOk) {
      if (process.env.NODE_ENV === 'production') {
        console.warn(`[ml/webhook] Firma inválida — rechazando (business_id=${businessId})`)
        return NextResponse.json({ ok: true }, { status: 200 })   // 200 siempre para que ML no reintente
      }
      console.warn(`[ml/webhook] Firma inválida para business_id=${businessId} — ignorando en dev`)
    }

    // ── Despachar por topic ───────────────────────────────────────────────────
    if (body.topic === 'orders_v2' && body.resource?.includes('/orders/')) {
      const mlOrderId = body.resource.split('/orders/')[1]
      // Procesar de forma asíncrona para responder 200 rápido
      handleMLOrder(businessId, mlOrderId).catch(e =>
        console.error(`[ml/webhook] Error procesando pedido ML ${mlOrderId}:`, e),
      )
    }

    // Otros topics (items, questions) → ignorar por ahora

    return NextResponse.json({ ok: true }, { status: 200 })

  } catch (err) {
    console.error('[ml/webhook] Error parseando notificación:', err, rawBody.slice(0, 200))
    // Siempre 200 para que ML no reintente con payloads inválidos
    return NextResponse.json({ ok: true }, { status: 200 })
  }
}

export async function GET() {
  // ML puede validar el endpoint con GET
  return NextResponse.json({ ok: true }, { status: 200 })
}

// ── Lógica de pedido ──────────────────────────────────────────────────────────

async function handleMLOrder(businessId: number, mlOrderId: string): Promise<void> {
  const order = await getMLOrder(businessId, mlOrderId)

  if (order.status !== 'paid') {
    console.info(`[ml/webhook] Pedido ML ${mlOrderId} en estado "${order.status}" — ignorado`)
    return
  }

  console.info(`[ml/webhook] Procesando pedido ML ${mlOrderId} (business ${businessId})`)

  // Leer seller (ml_user_id) necesario para mensajes y pack_id
  const pub      = await getPublicSettingsByKeys(businessId, ['ml_user_id'])
  const sellerId = pub.ml_user_id?.trim() ?? ''
  const packId   = order.pack_id ?? order.id   // fallback: orderId = packId para órdenes simples
  const buyer    = order.buyer

  for (const item of order.order_items) {
    const mlItemId      = item.item.id
    const mlVariationId = item.item.variation_id  // null si sin variantes
    const qty           = item.quantity

    // Buscar la variante ROIPOS correspondiente en ml_items
    const { rows } = await pool.query<{
      product_variant_id: number | null
      product_id:         number
    }>(
      `SELECT product_variant_id, product_id
       FROM ml_items
       WHERE business_id    = $1
         AND ml_item_id     = $2
         AND (ml_variation_id = $3 OR ($3::bigint IS NULL AND ml_variation_id IS NULL))
       LIMIT 1`,
      [businessId, mlItemId, mlVariationId ?? null],
    )

    const product_variant_id = rows[0]?.product_variant_id ?? null

    if (!rows.length) {
      console.warn(`[ml/webhook] ml_item ${mlItemId} var ${mlVariationId} no encontrado en ml_items`)
    }

    // ── Guardar orden ML en nuestra DB ────────────────────────────────────────
    try {
      await pool.query(
        `INSERT INTO ml_orders
           (business_id, ml_order_id, pack_id, ml_item_id, ml_variation_id,
            buyer_id, buyer_nickname, status, total_amount, currency_id,
            quantity, unit_price, product_variant_id, ml_date_created)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (ml_order_id, ml_item_id, business_id) DO UPDATE
           SET status       = EXCLUDED.status,
               updated_at   = NOW()`,
        [
          businessId,
          order.id,
          packId,
          mlItemId,
          mlVariationId ?? null,
          buyer?.id ?? 0,
          buyer?.nickname ?? null,
          order.status,
          order.total_amount ?? (item.unit_price * item.quantity),
          order.currency_id ?? 'ARS',
          item.quantity,
          item.unit_price,
          product_variant_id,
          order.date_created ?? null,
        ],
      )
    } catch (e) {
      console.error(`[ml/webhook] Error guardando ml_order ${mlOrderId}:`, e)
    }

    // Descontar stock en ROIPOS
    if (product_variant_id) {
      // Física: eliminar filas de branch_inventory (una por unidad vendida)
      // Usamos DELETE ... RETURNING para descontar exactamente qty unidades
      const { rowCount } = await pool.query(
        `DELETE FROM branch_inventory
         WHERE id IN (
           SELECT id FROM branch_inventory
           WHERE product_variant_id = $1
           LIMIT $2
         )`,
        [product_variant_id, qty],
      )
      console.info(`[ml/webhook] Stock descontado: variant ${product_variant_id}, -${rowCount} unidades`)
    }

    // Calcular nuevo stock para sincronizar de vuelta a ML
    const { rows: stockRows } = await pool.query<{ cnt: number }>(
      `SELECT COUNT(*)::int AS cnt
       FROM branch_inventory
       WHERE product_variant_id = $1`,
      [product_variant_id],
    )
    const newStock = stockRows[0]?.cnt ?? 0

    // Actualizar stock en ML
    try {
      if (mlVariationId) {
        await updateVariantStock(businessId, mlItemId, mlVariationId, newStock)
      } else {
        await updateItemStock(businessId, mlItemId, newStock)
      }

      // Si quedó en 0 → pausar la publicación para evitar penalización
      if (newStock === 0) {
        await pauseListing(businessId, mlItemId)
        console.info(`[ml/webhook] Publicación ${mlItemId} pausada (sin stock)`)
      }

      // Actualizar estado en ml_items
      await pool.query(
        `UPDATE ml_items
         SET ml_status   = $1,
             last_sync_at = NOW()
         WHERE business_id = $2 AND ml_item_id = $3`,
        [newStock === 0 ? 'paused' : 'active', businessId, mlItemId],
      )
    } catch (e) {
      console.error(`[ml/webhook] Error actualizando stock en ML para ${mlItemId}:`, e)
    }
  }

  // ── Crear venta en ROIPOS (una por orden ML) ─────────────────────────────────
  // Patrón idéntico a la venta web: mp_fop_id + online_branch_id.
  // El stock ya fue descontado arriba — aquí solo contabilizamos.
  try {
    // Verificar que no exista ya una sale para esta orden (reintento del webhook)
    const { rows: existingSale } = await pool.query<{ sale_id: number | null }>(
      `SELECT sale_id FROM ml_orders
       WHERE ml_order_id = $1 AND business_id = $2 AND sale_id IS NOT NULL
       LIMIT 1`,
      [order.id, businessId],
    )

    if (!existingSale.length) {
      const pub2    = await getPublicSettingsByKeys(businessId, ['mp_fop_id', 'online_branch_id'])
      const mpFopId = pub2.mp_fop_id ? parseInt(pub2.mp_fop_id) : null

      if (!mpFopId) {
        console.warn(`[ml/webhook] mp_fop_id no configurado — sale ML ${order.id} sin transaction`)
      }

      // Branch: online_branch_id o primera sucursal del negocio
      const { rows: branchRows } = await pool.query<{ id: number }>(
        `SELECT COALESCE(
           (SELECT value::int FROM settings WHERE business_id = $1 AND key = 'online_branch_id' LIMIT 1),
           (SELECT id FROM branches WHERE business_id = $1 ORDER BY id LIMIT 1)
         ) AS id`,
        [businessId],
      )
      const branchId = branchRows[0]?.id
      if (!branchId) throw new Error('No hay sucursal configurada para ventas online')

      // Total de la orden
      const totalAmount = order.total_amount
        ?? order.order_items.reduce((s, i) => s + i.unit_price * i.quantity, 0)

      // Leer items guardados en ml_orders para esta orden
      const { rows: mlItems } = await pool.query<{
        product_variant_id: number | null
        unit_price:         number
        quantity:           number
      }>(
        `SELECT product_variant_id, unit_price::float, quantity
         FROM ml_orders
         WHERE ml_order_id = $1 AND business_id = $2`,
        [order.id, businessId],
      )

      const client = await pool.connect()
      let saleId: number

      try {
        await client.query('BEGIN')

        // Crear sale
        const { rows: saleRows } = await client.query<{ id: number }>(
          `INSERT INTO sales
             (branch_id, customer_id, subtotal, discount_amount, total_amount,
              shipping_amount, payment_method, business_id)
           VALUES ($1, NULL, $2, 0, $3, 0, 'ml_online', $4)
           RETURNING id`,
          [branchId, totalAmount, totalAmount, businessId],
        )
        saleId = saleRows[0].id

        // sale_details — un ítem por fila, solo los que tienen variante vinculada
        for (const item of mlItems) {
          if (!item.product_variant_id) continue
          // Insertar una fila por cada unidad (igual que branch_inventory: 1 fila = 1 unidad)
          for (let u = 0; u < item.quantity; u++) {
            await client.query(
              `INSERT INTO sale_details (sale_id, product_variant_id, unit_price)
               VALUES ($1, $2, $3)`,
              [saleId, item.product_variant_id, item.unit_price],
            )
          }
        }

        // Actualizar ml_orders con sale_id
        await client.query(
          `UPDATE ml_orders SET sale_id = $1, updated_at = NOW()
           WHERE ml_order_id = $2 AND business_id = $3`,
          [saleId, order.id, businessId],
        )

        // Transaction contable (mp_fop_id)
        if (mpFopId) {
          await insertTransaction(client, {
            businessId,
            branchId,
            fopId:  mpFopId,
            type:   'sale',
            typeId: saleId,
            amount: totalAmount,
          })
        }

        await client.query('COMMIT')
        console.info(`[ml/webhook] Venta #${saleId} creada para orden ML ${order.id}`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
    }
  } catch (e) {
    console.error(`[ml/webhook] Error creando venta para orden ML ${order.id}:`, e)
    // No relanzamos — la orden ya está guardada en ml_orders, el stock descontado
  }

  // ── Mensaje de confirmación al comprador (una vez por orden, no por ítem) ──
  if (sellerId && buyer?.id && packId) {
    // Verificar si ya enviamos el mensaje para esta orden
    const { rows: msgRows } = await pool.query<{ sent: boolean }>(
      `SELECT msg_confirmation_sent AS sent
       FROM ml_orders
       WHERE business_id = $1 AND ml_order_id = $2
       LIMIT 1`,
      [businessId, order.id],
    )
    const alreadySent = msgRows[0]?.sent === true

    if (!alreadySent) {
      const sent = await sendMLConfirmation(
        businessId,
        packId,
        sellerId,
        buyer.id,
        buyer.nickname ?? 'comprador',
      )
      if (sent) {
        await pool.query(
          `UPDATE ml_orders
           SET msg_confirmation_sent = TRUE, updated_at = NOW()
           WHERE business_id = $1 AND ml_order_id = $2`,
          [businessId, order.id],
        )
        console.info(`[ml/webhook] Mensaje de confirmación enviado para orden ML ${order.id}`)
      }
    }
  }
}
