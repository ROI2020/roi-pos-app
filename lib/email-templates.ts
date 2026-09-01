/**
 * lib/email-templates.ts
 *
 * Templates HTML para emails transaccionales.
 * Todo inline CSS — compatible con Gmail, Outlook, Apple Mail.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtUSD(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
  }).format(n)
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
}

// ── Shell compartido ───────────────────────────────────────────────────────────

function shell(opts: {
  storeName:    string
  accentColor:  string
  preheader:    string
  body:         string
}): string {
  const { storeName, accentColor, preheader, body } = opts
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${storeName}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

<!-- Preheader (hidden) -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${preheader}&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<!-- Wrapper -->
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f4f4f5;">
  <tr><td align="center" style="padding:32px 16px;">

    <!-- Card -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">

      <!-- Header bar -->
      <tr>
        <td style="background:${accentColor};padding:24px 32px;">
          <p style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;">${storeName}</p>
        </td>
      </tr>

      <!-- Body -->
      <tr>
        <td style="padding:32px;">
          ${body}
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 32px;text-align:center;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">
            You received this email because you placed an order at <strong>${storeName}</strong>.
          </p>
        </td>
      </tr>

    </table>
    <!-- /Card -->

  </td></tr>
</table>
<!-- /Wrapper -->

</body>
</html>`
}

// ── Bloque de tabla de ítems ───────────────────────────────────────────────────

interface OrderItem {
  product_name:  string
  variant_color: string
  variant_size:  string
  unit_price:    number
}

function itemsTable(items: OrderItem[]): string {
  const rows = items.map(i => {
    const variant = [i.variant_color, i.variant_size].filter(Boolean).join(' · ')
    return `
    <tr>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;">
        ${i.product_name}
        ${variant ? `<br><span style="font-size:12px;color:#6b7280;">${variant}</span>` : ''}
      </td>
      <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;text-align:right;white-space:nowrap;">
        ${fmtUSD(i.unit_price)}
      </td>
    </tr>`
  }).join('')

  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <thead>
      <tr>
        <th style="padding:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;text-align:left;border-bottom:1px solid #e5e7eb;">Product</th>
        <th style="padding:0 0 8px;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;text-align:right;border-bottom:1px solid #e5e7eb;">Price</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`
}

// ── Bloque de totales ──────────────────────────────────────────────────────────

function totalsBlock(subtotal: number, shippingCost: number, total: number): string {
  const shippingRow = shippingCost > 0
    ? `<tr>
        <td style="padding:4px 0;font-size:13px;color:#6b7280;">Shipping</td>
        <td style="padding:4px 0;font-size:13px;color:#6b7280;text-align:right;">${fmtUSD(shippingCost)}</td>
       </tr>`
    : `<tr>
        <td style="padding:4px 0;font-size:13px;color:#6b7280;">Shipping</td>
        <td style="padding:4px 0;font-size:13px;color:#16a34a;text-align:right;font-weight:600;">FREE</td>
       </tr>`

  return `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin-top:16px;">
    <tr>
      <td style="padding:4px 0;font-size:13px;color:#6b7280;">Subtotal</td>
      <td style="padding:4px 0;font-size:13px;color:#6b7280;text-align:right;">${fmtUSD(subtotal)}</td>
    </tr>
    ${shippingRow}
    <tr>
      <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#111827;border-top:1px solid #e5e7eb;">Total</td>
      <td style="padding:12px 0 0;font-size:16px;font-weight:700;color:#111827;text-align:right;border-top:1px solid #e5e7eb;">${fmtUSD(total)}</td>
    </tr>
  </table>`
}

// ── CTA button ─────────────────────────────────────────────────────────────────

function ctaButton(href: string, label: string, color: string): string {
  return `
  <table cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
    <tr>
      <td style="border-radius:8px;background:${color};">
        <a href="${href}" target="_blank"
           style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">
          ${label}
        </a>
      </td>
    </tr>
  </table>`
}

// ── Template: confirmación de pedido ──────────────────────────────────────────

export interface OrderConfirmationData {
  storeName:    string
  accentColor:  string
  storeUrl:     string       // base URL de la tienda (ej: https://tienda.ejemplo.com/tienda)
  orderId:      number
  buyerName:    string
  createdAt:    string
  items:        OrderItem[]
  subtotal:     number
  shippingCost: number
  total:        number
  deliveryType: string
  /** Texto/HTML de intro personalizado desde settings. Si no se pasa, usa el default. */
  customIntro?: string
}

export function orderConfirmationHtml(d: OrderConfirmationData): string {
  const deliveryLabel: Record<string, string> = {
    pickup_store: 'Store pickup',
    homeDelivery: 'Home delivery',
    agency:       'Pickup at branch',
    locker:       'Locker',
  }

  const trackingUrl = `${d.storeUrl}/tracking?id=${d.orderId}`

  const introHtml = d.customIntro
    ? `<p style="margin:0 0 24px;font-size:15px;color:#6b7280;">${d.customIntro}</p>`
    : `<p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi ${d.buyerName}, your order #${d.orderId} is confirmed and being processed.</p>`

  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">
      Order confirmed ✓
    </h1>
    ${introHtml}

    <!-- Order info row -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f9fafb;border-radius:8px;padding:16px;margin-bottom:24px;">
      <tr>
        <td style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Order #</td>
        <td style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em;text-align:right;">Date</td>
      </tr>
      <tr>
        <td style="font-size:15px;color:#111827;font-weight:600;padding-top:2px;">${d.orderId}</td>
        <td style="font-size:15px;color:#111827;text-align:right;padding-top:2px;">${fmtDate(d.createdAt)}</td>
      </tr>
      <tr><td colspan="2" style="padding-top:12px;"></td></tr>
      <tr>
        <td style="font-size:12px;color:#9ca3af;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Delivery</td>
        <td></td>
      </tr>
      <tr>
        <td colspan="2" style="font-size:14px;color:#374151;padding-top:2px;">${deliveryLabel[d.deliveryType] ?? d.deliveryType}</td>
      </tr>
    </table>

    <!-- Items -->
    ${itemsTable(d.items)}

    <!-- Totals -->
    ${totalsBlock(d.subtotal, d.shippingCost, d.total)}

    <!-- CTA -->
    ${ctaButton(trackingUrl, 'Track your order →', d.accentColor)}

    <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">
      Or copy this link: <a href="${trackingUrl}" style="color:${d.accentColor};">${trackingUrl}</a>
    </p>`

  return shell({
    storeName:   d.storeName,
    accentColor: d.accentColor,
    preheader:   `Order #${d.orderId} confirmed — ${d.items.length} item${d.items.length !== 1 ? 's' : ''} · Total ${fmtUSD(d.total)}`,
    body,
  })
}

export function orderConfirmationText(d: OrderConfirmationData): string {
  const introText = d.customIntro
    ? d.customIntro.replace(/<[^>]+>/g, '') // strip HTML tags para versión texto
    : `Hi ${d.buyerName}, your order #${d.orderId} is confirmed.`
  const lines = [
    `Order confirmed — ${d.storeName}`,
    ``,
    introText,
    ``,
    `Items:`,
    ...d.items.map(i => `  • ${i.product_name} — ${fmtUSD(i.unit_price)}`),
    ``,
    `Total: ${fmtUSD(d.total)}`,
    ``,
    `Track your order:`,
    `${d.storeUrl}/tracking?id=${d.orderId}`,
  ]
  return lines.join('\n')
}

// ── Template: pedido enviado ───────────────────────────────────────────────────

export interface ShipmentNotificationData {
  storeName:      string
  accentColor:    string
  storeUrl:       string
  orderId:        number
  buyerName:      string
  carrier:        string | null
  trackingNumber: string | null
  /** Texto/HTML de intro personalizado desde settings. */
  customIntro?:   string
}

export function shipmentNotificationHtml(d: ShipmentNotificationData): string {
  const trackingUrl = `${d.storeUrl}/tracking?id=${d.orderId}`

  const introHtml = d.customIntro
    ? `<p style="margin:0 0 24px;font-size:15px;color:#6b7280;">${d.customIntro}</p>`
    : `<p style="margin:0 0 24px;font-size:15px;color:#6b7280;">Hi ${d.buyerName}, order #${d.orderId} has been shipped!</p>`

  const shipmentBox = (d.carrier || d.trackingNumber) ? `
    <table width="100%" cellpadding="0" cellspacing="0" border="0"
           style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px;margin:20px 0;">
      ${d.carrier ? `
      <tr>
        <td style="font-size:12px;color:#15803d;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Carrier</td>
      </tr>
      <tr>
        <td style="font-size:15px;color:#166534;font-weight:600;padding:2px 0 12px;">${d.carrier}</td>
      </tr>` : ''}
      ${d.trackingNumber ? `
      <tr>
        <td style="font-size:12px;color:#15803d;font-weight:600;text-transform:uppercase;letter-spacing:.08em;">Tracking number</td>
      </tr>
      <tr>
        <td style="font-size:18px;color:#166534;font-weight:700;letter-spacing:.05em;padding-top:2px;font-family:monospace;">${d.trackingNumber}</td>
      </tr>` : ''}
    </table>` : ''

  const body = `
    <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#111827;letter-spacing:-0.3px;">
      Your order is on the way 📦
    </h1>
    ${introHtml}

    ${shipmentBox}

    ${ctaButton(trackingUrl, 'Track your order →', d.accentColor)}

    <p style="margin:20px 0 0;font-size:13px;color:#9ca3af;">
      Or visit: <a href="${trackingUrl}" style="color:${d.accentColor};">${trackingUrl}</a>
    </p>`

  return shell({
    storeName:   d.storeName,
    accentColor: d.accentColor,
    preheader:   `Your order #${d.orderId} has shipped${d.trackingNumber ? ` · Tracking: ${d.trackingNumber}` : ''}`,
    body,
  })
}

export function shipmentNotificationText(d: ShipmentNotificationData): string {
  const introText = d.customIntro
    ? d.customIntro.replace(/<[^>]+>/g, '')
    : `Hi ${d.buyerName}, order #${d.orderId} has been shipped!`
  const lines = [
    `Your order shipped — ${d.storeName}`,
    ``,
    introText,
    d.carrier        ? `Carrier: ${d.carrier}` : '',
    d.trackingNumber ? `Tracking number: ${d.trackingNumber}` : '',
    ``,
    `Track your order:`,
    `${d.storeUrl}/tracking?id=${d.orderId}`,
  ].filter(l => l !== undefined)
  return lines.join('\n')
}
