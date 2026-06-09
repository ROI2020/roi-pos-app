'use strict'

/**
 * ROI POS Print Server
 * Servidor local de impresion termica para Xprinter XP-E200M ("XP-80C Recibos")
 * Puerto: 3002 — escucha solo en 127.0.0.1 (no expuesto a la red)
 */

const express = require('express')
const { ThermalPrinter, PrinterTypes, CharacterSet } = require('node-thermal-printer')

const app          = express()
const PORT         = 3002
const PRINTER_NAME = 'XP-80C Recibos'
const COL_WIDTH    = 48   // caracteres por linea en 80mm con fuente normal (Font A)

app.use(express.json({ limit: '1mb' }))

// CORS: solo permite llamadas desde localhost (la webapp y el servidor Next.js)
app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (_req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// ── Utilidades ────────────────────────────────────────────────────────────────

/** Moneda Argentina sin simbolo $  →  "16.400" */
const fmtNum = n =>
  new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 }).format(n)

/** "$16.400" */
const fmtARS = n => '$' + fmtNum(n)

/** "08/06/2026  14:35hs" */
const fmtDatetime = iso => {
  const d = iso ? new Date(iso) : new Date()
  const dd   = String(d.getDate()).padStart(2, '0')
  const mm   = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()
  const hh   = String(d.getHours()).padStart(2, '0')
  const min  = String(d.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}/${yyyy}  ${hh}:${min}hs`
}

/** Elimina acentos y caracteres fuera de ASCII para impresion segura */
const ascii = str =>
  (str || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '')

/** Devuelve linea "texto_izq ESPACIOS texto_der" exactamente COL_WIDTH chars */
const rowLR = (left, right) => {
  const l = String(left)
  const r = String(right)
  const gap = COL_WIDTH - l.length - r.length
  return l + (gap > 0 ? ' '.repeat(gap) : ' ') + r
}

const SEP_DOUBLE = '='.repeat(COL_WIDTH)
const SEP_SINGLE = '-'.repeat(COL_WIDTH)

// ── Impresion del ticket ───────────────────────────────────────────────────────

async function imprimirTicket(datos) {
  const printer = new ThermalPrinter({
    type:                    PrinterTypes.EPSON,
    interface:               `printer:${PRINTER_NAME}`,
    characterSet:            CharacterSet.PC437_USA,
    removeSpecialCharacters: true,
    lineCharacter:           '=',
    options:                 { timeout: 7000 },
  })

  const conectada = await printer.isPrinterConnected()
  if (!conectada) {
    throw new Error(
      `Impresora "${PRINTER_NAME}" no disponible. ` +
      'Verifica que este encendida y configurada en Windows.'
    )
  }

  const {
    businessName, branchName, address, phone, footer,
    receiptNoInvoiceText,
    saleId, invoiceNum, soldAt, payMethodLabel, branchId,
    items,
    subtotal, discountAmount, discountType, discountValue, total,
  } = datos

  const receiptId = (invoiceNum || '').trim() || `${branchId || 0}-${saleId}`

  // ─────────────────────────────────────────────────────────────────────────
  // ENCABEZADO
  // ─────────────────────────────────────────────────────────────────────────
  printer.alignCenter()

  if (businessName) {
    printer.setTextSize(1, 1)     // doble ancho y alto
    printer.bold(true)
    printer.println(ascii(businessName).toUpperCase())
    printer.bold(false)
    printer.setTextSize(0, 0)
    printer.newLine()
  }

  if (branchName)  printer.println(ascii(branchName))
  if (phone)       printer.println(ascii(phone))
  if (address)     printer.println(ascii(address))

  printer.newLine()
  printer.println(SEP_DOUBLE)

  // ─────────────────────────────────────────────────────────────────────────
  // ID + FECHA
  // ─────────────────────────────────────────────────────────────────────────
  printer.bold(true)
  printer.println(`RECIBO # ${receiptId}`)
  printer.bold(false)
  printer.println(fmtDatetime(soldAt))
  printer.println(SEP_SINGLE)

  // ─────────────────────────────────────────────────────────────────────────
  // ITEMS
  // ─────────────────────────────────────────────────────────────────────────
  printer.alignLeft()

  for (const item of items) {
    const priceStr   = fmtARS(item.unit_price)
    const maxName    = COL_WIDTH - priceStr.length - 2
    const nameRaw    = `1x ${ascii(item.product_name)}`
    const nameTrunc  = nameRaw.length > maxName
      ? nameRaw.slice(0, maxName - 1) + '.'
      : nameRaw

    // Fila: nombre ........... precio
    printer.println(rowLR(nameTrunc, priceStr))

    // Detalle: color + talle (indentado)
    printer.println(`   ${ascii(item.color)} . T.${ascii(item.size)}`)

    // Si tuvo descuento en el item
    if (item.base_price && item.unit_price < item.base_price) {
      printer.println(`   Precio original: ${fmtARS(item.base_price)}`)
    }
  }

  printer.println(SEP_SINGLE)

  // ─────────────────────────────────────────────────────────────────────────
  // TOTALES
  // ─────────────────────────────────────────────────────────────────────────
  if (discountAmount > 0) {
    printer.println(rowLR('Subtotal:', fmtARS(subtotal)))
    const discLabel = discountType === 'pct'
      ? `Descuento (${discountValue}%):`
      : 'Descuento:'
    printer.println(rowLR(discLabel, `-${fmtARS(discountAmount)}`))
  }

  printer.println(SEP_DOUBLE)
  printer.bold(true)
  printer.setTextSize(1, 1)
  printer.println(rowLR('TOTAL', fmtARS(total)))
  printer.setTextSize(0, 0)
  printer.bold(false)
  printer.println(SEP_DOUBLE)

  printer.println(rowLR(ascii(payMethodLabel) + ':', fmtARS(total)))

  // ─────────────────────────────────────────────────────────────────────────
  // PIE
  // ─────────────────────────────────────────────────────────────────────────
  printer.println(SEP_SINGLE)
  printer.alignCenter()

  const noInvText = receiptNoInvoiceText
    ? ascii(receiptNoInvoiceText)
    : 'No valido como factura'
  printer.println(noInvText)

  if (footer) {
    printer.newLine()
    printer.println(ascii(footer))
  }

  printer.newLine()
  printer.newLine()
  printer.cut()

  await printer.execute()
}

// ── Rutas HTTP ────────────────────────────────────────────────────────────────

/** POST /ticket  — imprime un ticket de venta */
app.post('/ticket', async (req, res) => {
  try {
    await imprimirTicket(req.body)
    console.log(`[OK] Ticket #${req.body.saleId} enviado a ${PRINTER_NAME}`)
    res.json({ ok: true })
  } catch (err) {
    console.error(`[ERROR] /ticket:`, err.message)
    res.status(500).json({ error: err.message })
  }
})

/** GET /health  — verifica conexion con la impresora */
app.get('/health', async (_req, res) => {
  try {
    const p = new ThermalPrinter({ type: PrinterTypes.EPSON, interface: `printer:${PRINTER_NAME}` })
    const connected = await p.isPrinterConnected()
    res.json({ ok: true, printer: PRINTER_NAME, connected })
  } catch (err) {
    res.json({ ok: true, printer: PRINTER_NAME, connected: false, error: err.message })
  }
})

// ── Inicio ────────────────────────────────────────────────────────────────────

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log('\n  ╔══════════════════════════════════╗')
  console.log('  ║   ROI POS Print Server           ║')
  console.log('  ╚══════════════════════════════════╝')
  console.log(`  Puerto:    http://localhost:${PORT}`)
  console.log(`  Impresora: ${PRINTER_NAME}`)
  console.log(`  Health:    http://localhost:${PORT}/health\n`)
})

process.on('SIGINT',  () => { console.log('\nCerrando...'); server.close(); process.exit(0) })
process.on('SIGTERM', () => { server.close(); process.exit(0) })
