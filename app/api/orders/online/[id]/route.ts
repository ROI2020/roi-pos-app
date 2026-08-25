import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

/**
 * GET /api/orders/online/:id
 * Detalle completo del pedido con items y dirección.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireBusinessId()
  if (authResult instanceof NextResponse) return authResult
  const { businessId } = authResult

  const { id } = await params

  try {
    // Encabezado del pedido
    const { rows: orderRows } = await pool.query<{
      id: number; buyer_name: string; buyer_phone: string; buyer_email: string | null
      delivery_type: string; agency_id: string | null
      subtotal: number; shipping_cost: number; total: number
      status: string; notes: string | null; sale_id: number | null
      created_at: string; updated_at: string
      // dirección
      street_name: string | null; street_number: string | null
      floor: string | null; department: string | null
      city_name: string | null; state: string | null; zip_code: string | null
      observation: string | null
      // shipping rate
      rate_label: string | null; rate_price: number | null
      carrier_name: string | null
      // shipment
      tracking_number: string | null; shipment_status: string | null
      shipment_error: string | null
    }>(
      `SELECT
         oo.id, oo.buyer_name, oo.buyer_phone, oo.buyer_email,
         oo.delivery_type, oo.agency_id,
         oo.subtotal::float, oo.shipping_cost::float, oo.total::float,
         oo.status, oo.notes, oo.sale_id,
         oo.created_at, oo.updated_at,
         sa.street_name, sa.street_number, sa.floor, sa.department,
         sa.city_name, sa.state, sa.zip_code, sa.observation,
         sr.display_label AS rate_label, sr.price::float AS rate_price,
         cc.display_name AS carrier_name,
         sh.tracking_number, sh.status AS shipment_status, sh.error_detail AS shipment_error
       FROM online_orders oo
       LEFT JOIN shipping_addresses sa ON sa.id = oo.shipping_address_id
       LEFT JOIN shipping_rates     sr ON sr.id = oo.shipping_rate_id
       LEFT JOIN correo_config       cc ON cc.id = sr.correo_config_id
       LEFT JOIN shipments           sh ON sh.online_order_id = oo.id
       WHERE oo.id = $1 AND oo.business_id = $2`,
      [id, businessId]
    )

    if (!orderRows.length)
      return NextResponse.json({ error: 'Pedido no encontrado' }, { status: 404 })

    // Items
    const { rows: items } = await pool.query<{
      id: number; product_variant_id: number
      product_name: string; variant_sku: string
      variant_color: string; variant_size: string
      unit_price: number; in_stock: boolean
    }>(
      `SELECT
         ooi.id, ooi.product_variant_id,
         ooi.product_name, ooi.variant_sku,
         ooi.variant_color, ooi.variant_size,
         ooi.unit_price::float,
         EXISTS(
           SELECT 1 FROM branch_inventory bi
           WHERE bi.product_variant_id = ooi.product_variant_id
         ) AS in_stock
       FROM online_order_items ooi
       WHERE ooi.online_order_id = $1
       ORDER BY ooi.id`,
      [id]
    )

    const o = orderRows[0]
    return NextResponse.json({
      id: o.id,
      buyer:     { name: o.buyer_name, phone: o.buyer_phone, email: o.buyer_email },
      delivery:  {
        type:       o.delivery_type,
        agencyId:   o.agency_id,
        carrier:    o.carrier_name,
        rateLabel:  o.rate_label,
        ratePrice:  o.rate_price,
        address: o.street_name ? {
          streetName: o.street_name, streetNumber: o.street_number,
          floor: o.floor, department: o.department,
          cityName: o.city_name, state: o.state,
          zipCode: o.zip_code, observation: o.observation,
        } : null,
      },
      subtotal:   o.subtotal,
      shippingCost: o.shipping_cost,
      total:      o.total,
      status:     o.status,
      notes:      o.notes,
      saleId:     o.sale_id,
      shipment:   o.tracking_number ? {
        trackingNumber: o.tracking_number,
        status:         o.shipment_status,
        error:          o.shipment_error,
      } : null,
      items,
      createdAt:  o.created_at,
      updatedAt:  o.updated_at,
    })
  } catch (err) {
    console.error('[GET /api/orders/online/:id]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
