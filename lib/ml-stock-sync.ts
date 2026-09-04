/**
 * lib/ml-stock-sync.ts — SERVER ONLY
 *
 * Sincroniza el stock de variantes de ROIPOS hacia MercadoLibre.
 * Se llama después de cualquier evento que cambie el stock físico:
 *   - Venta POS       (/api/sales)
 *   - Venta online    (/api/orders/online/[id]/confirm)
 *   - Ingreso stock   (futuro: /api/inventory/purchase)
 *
 * Para cada variante:
 *   1. Busca si tiene publicación activa en ml_items
 *   2. Calcula el stock actual en branch_inventory
 *   3. Actualiza ML (updateVariantStock o updateItemStock)
 *   4. Si stock = 0 → pausa la publicación
 *   5. Si stock > 0 y publicación pausada por stock → reactiva
 *
 * No lanza — loguea internamente. Siempre llamar con .catch().
 */

import pool from '@/lib/db'
import {
  updateVariantStock,
  updateItemStock,
  pauseListing,
  activateListing,
} from '@/lib/ml-service'

interface MLItemRow {
  ml_item_id:        string
  ml_variation_id:   number | null
  ml_status:         string
  business_id:       number
}

/**
 * Sincroniza el stock de una lista de variantes hacia ML.
 * Agrupa por ml_item_id para minimizar llamadas a la API.
 */
export async function syncMLStockForVariants(
  businessId: number,
  variantIds:  number[],
): Promise<void> {
  if (!variantIds.length) return

  // Verificar si el negocio tiene ML habilitado
  const { rows: enabledRows } = await pool.query<{ value: string }>(
    `SELECT value FROM settings
     WHERE business_id = $1 AND key = 'ml_enabled' AND is_secret = false`,
    [businessId],
  )
  if (enabledRows[0]?.value !== 'true') return

  // Buscar los ml_items correspondientes a las variantes
  const { rows: mlItems } = await pool.query<MLItemRow>(
    `SELECT ml_item_id, ml_variation_id, ml_status, business_id
     FROM ml_items
     WHERE business_id = $1
       AND product_variant_id = ANY($2::int[])
       AND ml_status != 'closed'`,
    [businessId, variantIds],
  )

  if (!mlItems.length) return  // Ninguna variante tiene publicación ML

  // Agrupar por ml_item_id para procesar publicación por publicación
  const byItem = new Map<string, MLItemRow[]>()
  for (const row of mlItems) {
    const list = byItem.get(row.ml_item_id) ?? []
    list.push(row)
    byItem.set(row.ml_item_id, list)
  }

  for (const [mlItemId, rows] of byItem.entries()) {
    for (const row of rows) {
      await syncOneVariant(businessId, mlItemId, row)
    }
  }
}

/**
 * Sincroniza una variante individual hacia ML.
 */
async function syncOneVariant(
  businessId:  number,
  mlItemId:    string,
  row:         MLItemRow,
): Promise<void> {
  // Calcular stock actual en ROIPOS para la variante
  // (buscamos la variant a través de ml_items)
  const { rows: stockRows } = await pool.query<{ variant_id: number; cnt: number }>(
    `SELECT mi.product_variant_id AS variant_id,
            COUNT(bi.id)::int     AS cnt
     FROM ml_items mi
     LEFT JOIN branch_inventory bi ON bi.product_variant_id = mi.product_variant_id
     WHERE mi.ml_item_id = $1
       AND mi.business_id = $2
       AND mi.ml_variation_id = $3
     GROUP BY mi.product_variant_id`,
    [mlItemId, businessId, row.ml_variation_id],
  )

  const newStock = stockRows[0]?.cnt ?? 0

  // Actualizar stock en ML
  if (row.ml_variation_id) {
    await updateVariantStock(businessId, mlItemId, row.ml_variation_id, newStock)
  } else {
    await updateItemStock(businessId, mlItemId, newStock)
  }

  // Pausar si sin stock / reactivar si recuperó stock
  if (newStock === 0 && row.ml_status !== 'paused') {
    await pauseListing(businessId, mlItemId)
    await pool.query(
      `UPDATE ml_items SET ml_status = 'paused', last_sync_at = NOW()
       WHERE business_id = $1 AND ml_item_id = $2`,
      [businessId, mlItemId],
    )
    console.info(`[ml-stock-sync] ${mlItemId} pausado (sin stock)`)

  } else if (newStock > 0 && row.ml_status === 'paused') {
    await activateListing(businessId, mlItemId)
    await pool.query(
      `UPDATE ml_items SET ml_status = 'active', last_sync_at = NOW()
       WHERE business_id = $1 AND ml_item_id = $2`,
      [businessId, mlItemId],
    )
    console.info(`[ml-stock-sync] ${mlItemId} reactivado (stock: ${newStock})`)

  } else {
    await pool.query(
      `UPDATE ml_items SET last_sync_at = NOW()
       WHERE business_id = $1 AND ml_item_id = $2`,
      [businessId, mlItemId],
    )
  }
}
