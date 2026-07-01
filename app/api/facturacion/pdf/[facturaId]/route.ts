import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { ErrorFacturacion } from '@/lib/facturacion/types'

async function isAuthorized(req: Request): Promise<boolean> {
  // Acceso por x-api-key (WhatsApp, email, sistemas externos)
  const apiKey = req.headers.get('x-api-key')
  if (apiKey) return apiKey === process.env.FACTURACION_API_KEY

  // Acceso por sesión de administrador
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return false
  try {
    const { role } = JSON.parse(decodeURIComponent(raw)) as { id: number; role: string }
    return role === 'administrador'
  } catch {
    return false
  }
}

interface FacturaRow {
  id: string
  cuit_emisor: string
  punto_venta: number
  tipo_cbte: number
  nro_comprobante: number
  fecha_cbte: string
  cae: string | null
  cae_vto: string | null
  importe_total: string
  receptor_cuit: string | null
  receptor_nombre: string | null
  pdf_path: string | null
  ticket_path: string | null
  raw_request: unknown
  razon_social: string
}

/**
 * GET /api/facturacion/pdf/[facturaId]
 * GET /api/facturacion/pdf/[facturaId]?formato=ticket
 *
 * Sirve el PDF del comprobante. Lo genera en el primer acceso (on-demand).
 * Con ?formato=ticket genera un PDF de 80mm para impresora térmica.
 * Acepta sesión de admin o header x-api-key para acceso externo.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ facturaId: string }> }
) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json(
      { error: { categoria: 'interno', mensaje: 'No autorizado' } satisfies ErrorFacturacion },
      { status: 401 }
    )
  }

  const { facturaId } = await params
  const { searchParams } = new URL(req.url)
  const esTicket = searchParams.get('formato') === 'ticket'

  // Leer factura de la DB junto con la razón social del emisor
  const result = await pool.query<FacturaRow>(
    `SELECT f.*, fc.razon_social
     FROM facturas f
     LEFT JOIN facturacion_config fc ON fc.cuit = f.cuit_emisor
     WHERE f.id = $1`,
    [facturaId]
  )
  if (!result.rows.length) {
    return NextResponse.json(
      { error: { categoria: 'validacion', mensaje: 'Factura no encontrada' } satisfies ErrorFacturacion },
      { status: 404 }
    )
  }

  const factura = result.rows[0]
  const nroDisplay = `${String(factura.punto_venta).padStart(4, '0')}-${String(factura.nro_comprobante).padStart(8, '0')}`

  // ── Ticket 80mm ──────────────────────────────────────────────
  if (esTicket) {
    // Intentar servir desde caché en disco
    if (factura.ticket_path) {
      try {
        const bytes = Buffer.from(await fs.readFile(factura.ticket_path))
        return pdfResponse(bytes, `ticket-${nroDisplay}.pdf`)
      } catch {
        // archivo no existe, regenerar
      }
    }

    let pdfBytes: Uint8Array
    try {
      pdfBytes = await generarTicketPDF(factura)
    } catch (err) {
      console.error('[facturacion/pdf/ticket] error generando ticket:', err)
      return NextResponse.json({ error: 'Error generando ticket PDF' }, { status: 500 })
    }
    const pdfBuffer = Buffer.from(pdfBytes)

    // Guardar en disco
    const storageDir = path.join(process.cwd(), 'storage', 'facturas', factura.cuit_emisor)
    const ticketPath = path.join(storageDir, `${facturaId}_ticket.pdf`)
    try {
      await fs.mkdir(storageDir, { recursive: true })
      await fs.writeFile(ticketPath, pdfBuffer)
      await pool.query(
        `UPDATE facturas SET ticket_path = $1 WHERE id = $2`,
        [ticketPath, facturaId]
      )
    } catch (err) {
      console.error('[facturacion/pdf] no se pudo guardar ticket en disco:', err)
    }

    return pdfResponse(pdfBuffer, `ticket-${nroDisplay}.pdf`)
  }

  // ── PDF A4 ────────────────────────────────────────────────────
  if (factura.pdf_path) {
    try {
      const bytes = Buffer.from(await fs.readFile(factura.pdf_path))
      return pdfResponse(bytes, `factura-${nroDisplay}.pdf`)
    } catch {
      // Si el archivo no existe en disco (borrado/migración), regenerar
    }
  }

  const pdfBytes = await generarPDF(factura)
  const pdfBuffer = Buffer.from(pdfBytes)

  const storageDir = path.join(process.cwd(), 'storage', 'facturas', factura.cuit_emisor)
  const pdfPath = path.join(storageDir, `${facturaId}.pdf`)
  try {
    await fs.mkdir(storageDir, { recursive: true })
    await fs.writeFile(pdfPath, pdfBuffer)
    await pool.query(
      `UPDATE facturas SET pdf_path = $1 WHERE id = $2`,
      [pdfPath, facturaId]
    )
  } catch (err) {
    console.error('[facturacion/pdf] no se pudo guardar en disco:', err)
  }

  return pdfResponse(pdfBuffer, `factura-${nroDisplay}.pdf`)
}

function pdfResponse(buf: Buffer, filename: string): Response {
  return new Response(buf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${filename}"`,
    },
  })
}

// Formatea número al estilo argentino: 1234567.89 → "$1.234.567,89"
// Implementado sin toLocaleString para evitar dependencia de ICU en Node.js
function ars(n: number): string {
  const [int, dec] = n.toFixed(2).split('.')
  const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `$${intFmt},${dec}`
}

// ── PDF A4 ────────────────────────────────────────────────────────────────────

async function generarPDF(factura: FacturaRow): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([595, 842]) // A4
  const { width, height } = page.getSize()

  const fontBold   = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontNormal = await doc.embedFont(StandardFonts.Helvetica)

  const margin = 50
  let y = height - margin

  const drawText = (
    text: string,
    x: number,
    yPos: number,
    size = 10,
    bold = false,
    color = rgb(0, 0, 0)
  ) => {
    page.drawText(text, {
      x,
      y: yPos,
      size,
      font: bold ? fontBold : fontNormal,
      color,
    })
  }

  // ── Encabezado ───────────────────────────────────────────────────────────
  drawText('FACTURA B', width / 2 - 50, y, 18, true)
  y -= 25
  drawText(`Nº ${String(factura.punto_venta).padStart(4, '0')}-${String(factura.nro_comprobante).padStart(8, '0')}`, width / 2 - 60, y, 12)
  y -= 20
  drawText(`Fecha: ${factura.fecha_cbte}`, width / 2 - 40, y, 10)

  y -= 15
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0, 0, 0) })
  y -= 20

  // ── Datos del emisor ─────────────────────────────────────────────────────
  drawText('Emisor', margin, y, 10, true)
  y -= 15
  drawText(factura.razon_social ?? 'Sin razón social', margin, y, 10)
  y -= 14
  drawText(`CUIT: ${factura.cuit_emisor}`, margin, y, 10)
  y -= 14
  drawText('Condición IVA: Monotributista', margin, y, 10)

  // ── Datos del receptor ───────────────────────────────────────────────────
  y -= 25
  drawText('Receptor', margin, y, 10, true)
  y -= 15
  drawText(factura.receptor_nombre ?? 'Consumidor Final', margin, y, 10)
  if (factura.receptor_cuit) {
    y -= 14
    drawText(`CUIT: ${factura.receptor_cuit}`, margin, y, 10)
  }

  y -= 20
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) })
  y -= 15

  // ── Tabla de ítems ───────────────────────────────────────────────────────
  drawText('Descripción', margin, y, 9, true)
  drawText('Cant.', 350, y, 9, true)
  drawText('P. Unit.', 400, y, 9, true)
  drawText('Subtotal', 480, y, 9, true)
  y -= 12
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) })
  y -= 12

  const items: Array<{ descripcion: string; cantidad: number; precioUnitario: number }> =
    (factura.raw_request as { comprobante?: { items?: Array<{ descripcion: string; cantidad: number; precioUnitario: number }> } })?.comprobante?.items ?? []

  for (const item of items) {
    const subtotal = item.cantidad * item.precioUnitario
    drawText(item.descripcion.slice(0, 45), margin, y, 9)
    drawText(String(item.cantidad), 355, y, 9)
    drawText(ars(item.precioUnitario), 400, y, 9)
    drawText(ars(subtotal), 480, y, 9)
    y -= 14
    if (y < 150) break
  }

  y -= 5
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) })
  y -= 18
  drawText('TOTAL', 400, y, 12, true)
  drawText(ars(parseFloat(factura.importe_total)), 455, y, 12, true)

  // ── CAE ──────────────────────────────────────────────────────────────────
  y -= 40
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: rgb(0, 0, 0) })
  y -= 18
  drawText(`CAE: ${factura.cae ?? 'N/D'}`, margin, y, 9)
  if (factura.cae_vto) {
    drawText(`Vto. CAE: ${factura.cae_vto}`, margin + 200, y, 9)
  }
  y -= 14
  drawText('Comprobante autorizado por AFIP', margin, y, 8, false, rgb(0.4, 0.4, 0.4))

  return doc.save()
}

// ── PDF Ticket 80mm ───────────────────────────────────────────────────────────
//
// Página de 80mm de ancho (227 pts) con alto dinámico según items.
// Diseñado para impresoras térmicas de rollo: imprimir al 100%, sin escala.

const T_W  = 227   // 80mm en pts (72 dpi)
const T_ML = 8     // margen izquierdo
const T_MR = 8     // margen derecho
const T_RX = T_W - T_MR  // borde derecho disponible

async function generarTicketPDF(factura: FacturaRow): Promise<Uint8Array> {
  const items: Array<{ descripcion: string; cantidad: number; precioUnitario: number }> =
    (factura.raw_request as { comprobante?: { items?: Array<{ descripcion: string; cantidad: number; precioUnitario: number }> } })?.comprobante?.items ?? []

  // Calcular alto dinámico
  const lineH = 11
  const estimatedHeight =
    70 +          // encabezado
    50 +          // emisor
    35 +          // receptor
    20 +          // header tabla
    items.length * lineH +
    30 +          // total
    50 +          // CAE
    16            // margen inferior

  const doc = await PDFDocument.create()
  const page = doc.addPage([T_W, Math.max(estimatedHeight, 200)])
  const { height } = page.getSize()

  const fontBold   = await doc.embedFont(StandardFonts.HelveticaBold)
  const fontNormal = await doc.embedFont(StandardFonts.Helvetica)

  let y = height - 10

  // Helpers
  const txt = (text: string, x: number, yPos: number, size: number, bold = false, color = rgb(0, 0, 0)) => {
    page.drawText(text, { x, y: yPos, size, font: bold ? fontBold : fontNormal, color })
  }

  const txtRight = (text: string, rightEdge: number, yPos: number, size: number, bold = false) => {
    const w = (bold ? fontBold : fontNormal).widthOfTextAtSize(text, size)
    page.drawText(text, { x: rightEdge - w, y: yPos, size, font: bold ? fontBold : fontNormal, color: rgb(0, 0, 0) })
  }

  const txtCenter = (text: string, yPos: number, size: number, bold = false) => {
    const w = (bold ? fontBold : fontNormal).widthOfTextAtSize(text, size)
    page.drawText(text, { x: (T_W - w) / 2, y: yPos, size, font: bold ? fontBold : fontNormal, color: rgb(0, 0, 0) })
  }

  const hline = (yPos: number, dashed = false) => {
    if (dashed) {
      // línea punteada: segmentos de 3pts con hueco de 2pts
      let x = T_ML
      while (x < T_RX) {
        page.drawLine({ start: { x, y: yPos }, end: { x: Math.min(x + 3, T_RX), y: yPos }, thickness: 0.5, color: rgb(0.5, 0.5, 0.5) })
        x += 5
      }
    } else {
      page.drawLine({ start: { x: T_ML, y: yPos }, end: { x: T_RX, y: yPos }, thickness: 0.8, color: rgb(0, 0, 0) })
    }
  }

  const nroDisplay = `N° ${String(factura.punto_venta).padStart(4, '0')}-${String(factura.nro_comprobante).padStart(8, '0')}`

  // fecha_cbte puede llegar como Date (pg driver) o string YYYYMMDD
  const fechaStr = (() => {
    const raw = factura.fecha_cbte
    if (raw instanceof Date) {
      const d = raw as Date
      return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
    }
    const s = String(raw)
    if (s.length === 8) return `${s.slice(6,8)}/${s.slice(4,6)}/${s.slice(0,4)}`
    // ISO: 2026-07-01T...
    const [year, month, day] = s.split('T')[0].split('-')
    return `${day}/${month}/${year}`
  })()

  // ── Encabezado ────────────────────────────────────────────────
  txtCenter('FACTURA B', y, 13, true)
  y -= 14
  txtCenter(nroDisplay, y, 8)
  y -= 11
  txtCenter(fechaStr, y, 8)
  y -= 7
  hline(y)
  y -= 10

  // ── Emisor ────────────────────────────────────────────────────
  txt(factura.razon_social ?? 'Sin razón social', T_ML, y, 8, true)
  y -= 11
  txt(`CUIT: ${factura.cuit_emisor}`, T_ML, y, 7)
  y -= 10
  txt('Monotributista', T_ML, y, 7)
  y -= 7
  hline(y, true)
  y -= 10

  // ── Receptor ─────────────────────────────────────────────────
  txt('Cliente:', T_ML, y, 7, true)
  y -= 11
  txt(factura.receptor_nombre ?? 'Consumidor Final', T_ML, y, 8)
  if (factura.receptor_cuit) {
    y -= 10
    txt(`CUIT: ${factura.receptor_cuit}`, T_ML, y, 7)
  }
  y -= 7
  hline(y, true)
  y -= 10

  // ── Items ─────────────────────────────────────────────────────
  // Header columnas
  txt('Descripción', T_ML, y, 7, true)
  txtRight('Cant', 148, y, 7, true)
  txtRight('TOTAL', T_RX, y, 7, true)
  y -= 9
  hline(y, true)
  y -= 10

  for (const item of items) {
    const subtotal = item.cantidad * item.precioUnitario

    // Descripción (recortar si es muy larga para 80mm)
    const desc = item.descripcion.length > 24 ? item.descripcion.slice(0, 22) + '..' : item.descripcion
    txt(desc, T_ML, y, 7)
    txtRight(String(item.cantidad), 148, y, 7)
    txtRight(ars(subtotal), T_RX, y, 7)
    y -= lineH

    // Segunda línea si la descripción es muy larga: precio unitario
    if (item.cantidad > 1) {
      txt(`  ${item.cantidad} x ${ars(item.precioUnitario)}`, T_ML, y, 6, false, rgb(0.5, 0.5, 0.5))
      y -= 9
    }
  }

  y -= 4
  hline(y)
  y -= 13

  // ── Total ─────────────────────────────────────────────────────
  txt('TOTAL', T_ML, y, 11, true)
  txtRight(ars(parseFloat(factura.importe_total)), T_RX, y, 11, true)
  y -= 14

  hline(y)
  y -= 10

  // ── CAE ───────────────────────────────────────────────────────
  if (factura.cae) {
    txt(`CAE: ${factura.cae}`, T_ML, y, 6)
    y -= 9
  }
  if (factura.cae_vto) {
    txt(`Vto. CAE: ${factura.cae_vto}`, T_ML, y, 6)
    y -= 9
  }
  txt('Comprobante autorizado por AFIP', T_ML, y, 6, false, rgb(0.4, 0.4, 0.4))

  return doc.save()
}
