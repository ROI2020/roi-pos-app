/**
 * Script de diagnóstico: encuentra el real último nro autorizado en ARCA
 * usando FECompConsultar (que consulta comprobantes individuales).
 *
 * Uso:
 *   npx tsx scripts/arca-buscar-ultimo-nro.ts
 *
 * Variables de entorno requeridas (las mismas de producción):
 *   DATABASE_URL o DB_HOST/DB_PORT/...
 *   ARCA_CERT_PEM, ARCA_KEY_PEM (o los que use wsaa.ts)
 */

import 'dotenv/config'
import pool from '../lib/db'
import { obtenerToken } from '../lib/facturacion/wsaa'
import { consultarComprobante } from '../lib/facturacion/wsfev1'

const CUIT       = process.argv[2] || '23-25775754-4'
const PTO_VENTA  = parseInt(process.argv[3] || '10')
const TIPO_CBTE  = 11
const AMBIENTE   = 'prod' as const

async function main() {
  // 1. Obtener token WSAA
  console.log(`\nObteniendo token para CUIT ${CUIT}...`)
  const auth = await obtenerToken(CUIT, AMBIENTE)
  const authConCuit = { ...auth, cuit: CUIT }

  // 2. Buscar el nro real desde nuestra DB max hacia adelante
  const { rows } = await pool.query<{ max_nro: number }>(
    `SELECT COALESCE(MAX(nro_comprobante), 60)::int AS max_nro
     FROM facturas
     WHERE cuit_emisor = $1 AND punto_venta = $2 AND tipo_cbte = $3`,
    [CUIT, PTO_VENTA, TIPO_CBTE]
  )
  const dbMax = rows[0].max_nro
  console.log(`DB max (todos los estados): ${dbMax}`)

  // 3. Verificar de dbMax hacia adelante hasta encontrar el gap
  let ultimoEncontrado = 0
  const BUSCAR_HASTA = dbMax + 20  // buscar 20 nros por encima del DB max

  console.log(`\nConsultando nros ${dbMax - 5} a ${BUSCAR_HASTA} en ARCA...\n`)

  for (let nro = Math.max(1, dbMax - 5); nro <= BUSCAR_HASTA; nro++) {
    const res = await consultarComprobante(authConCuit, PTO_VENTA, TIPO_CBTE, nro, AMBIENTE)
    if (res) {
      console.log(`  ✓ nro ${nro}: fecha=${res.fecha} importe=${res.importe} CAE=${res.cae.slice(0, 8)}...`)
      ultimoEncontrado = nro
    } else {
      console.log(`  ✗ nro ${nro}: NO existe en ARCA`)
      if (nro > dbMax) break  // encontramos el primer nro libre después del DB max
    }
    // Pequeña pausa para no saturar el WS de ARCA
    await new Promise(r => setTimeout(r, 300))
  }

  console.log(`\n────────────────────────────────`)
  console.log(`Último nro real en ARCA: ${ultimoEncontrado}`)
  console.log(`Próximo nro a usar:      ${ultimoEncontrado + 1}`)
  console.log(`DB max actual:           ${dbMax}`)

  if (ultimoEncontrado > dbMax) {
    console.log(`\n⚠️  ARCA tiene ${ultimoEncontrado - dbMax} nros más que la DB.`)
    console.log(`   Correría este SQL para sincronizar (estado 'arca-orphan'):`)
    for (let n = dbMax + 1; n <= ultimoEncontrado; n++) {
      const r = await consultarComprobante(authConCuit, PTO_VENTA, TIPO_CBTE, n, AMBIENTE)
      if (r) {
        console.log(`   -- nro ${n}: no estaba en DB, encontrado en ARCA con CAE ${r.cae}`)
      }
    }
  }

  await pool.end()
}

main().catch(e => { console.error(e); process.exit(1) })
