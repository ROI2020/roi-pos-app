/**
 * Generador de CSR para ROISOL — ejecutar UNA SOLA VEZ
 *
 * Uso:
 *   npx ts-node scripts/generar-csr-roisol.ts
 *
 * Produce:
 *   certs/roisol.key  — clave privada RSA 2048 (agregar a ARCA_KEY_PEM en .env.local)
 *   certs/roisol.csr  — solicitud de certificado (subir al portal ARCA)
 *
 * DESPUÉS de que ARCA apruebe y entregue el .crt:
 *   Copiar su contenido a ARCA_CERT_PEM en .env.local
 */

import forge from 'node-forge'
import fs from 'node:fs'
import path from 'node:path'

// ── Editar antes de ejecutar ──────────────────────────────────────
const CONFIG = {
  cuit:        '20-18072671-4',   // CUIT de ROISOL (sin guiones en el SERIALNUMBER)
  razonSocial: 'INSFRAN RUBEN ORLANDO',
  pais:        'AR',
  provincia:   'Buenos Aires',
  localidad:   'Buenos Aires',
}
// ─────────────────────────────────────────────────────────────────

const CERTS_DIR = path.resolve('C:\\roi-pos-app', '..', 'certs')
const KEY_PATH  = path.join(CERTS_DIR, 'roisol.key')
const CSR_PATH  = path.join(CERTS_DIR, 'roisol.csr')

function main() {
  if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true })

  if (CONFIG.cuit.includes('XXXXXXXX')) {
    console.error('\n❌  Editá el CUIT en CONFIG antes de ejecutar el script.\n')
    process.exit(1)
  }

  console.log('\n🔑  Generando par de claves RSA 2048...')
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, workers: -1 })

  // ARCA espera el CUIT sin guiones en el campo SERIALNUMBER del DN
  const cuitSinGuiones = CONFIG.cuit.replace(/-/g, '')

  console.log('📄  Construyendo CSR...')
  const csr = forge.pki.createCertificationRequest()
  csr.publicKey = keys.publicKey
  csr.setSubject([
    { name: 'commonName',       value: CONFIG.razonSocial },
    { name: 'serialNumber',      value: `CUIT ${cuitSinGuiones}` },
    { name: 'countryName',      value: CONFIG.pais },
    { name: 'stateOrProvinceName', value: CONFIG.provincia },
    { name: 'localityName',     value: CONFIG.localidad },
    { name: 'organizationName', value: CONFIG.razonSocial },
  ])
  csr.sign(keys.privateKey, forge.md.sha256.create())

  const keyPem = forge.pki.privateKeyToPem(keys.privateKey)
  const csrPem = forge.pki.certificationRequestToPem(csr)

  fs.writeFileSync(KEY_PATH, keyPem, { mode: 0o600 })
  fs.writeFileSync(CSR_PATH, csrPem)

  console.log(`\n✅  Archivos generados:`)
  console.log(`   ${KEY_PATH}`)
  console.log(`   ${CSR_PATH}`)

  console.log('\n════════════════════════════════════════════════════════════')
  console.log('  Paso 1 — Agregar a .env.local:')
  console.log('════════════════════════════════════════════════════════════')
  console.log('\nARCA_CUIT_ROISOL=' + CONFIG.cuit)
  console.log('\nARCA_KEY_PEM="' + keyPem.replace(/\n/g, '\\n') + '"')
  console.log('\n(ARCA_CERT_PEM se agrega después de que ARCA apruebe el CSR)\n')

  console.log('════════════════════════════════════════════════════════════')
  console.log('  Paso 2 — Subir el CSR a ARCA:')
  console.log('════════════════════════════════════════════════════════════')
  console.log(`
  1. Ingresar a https://auth.afip.gob.ar con CUIT y Clave Fiscal nivel 3
  2. Administrador de Relaciones de Clave Fiscal
     → Agregar acceso restringido a servicio
     → Buscar: "wsfe" (Web Service de Facturación Electrónica)
     → Adherirse al servicio
  3. Una vez adherido:
     → Ver accesos → Administrar → Agregar Alias
     → Pegar el contenido de: ${CSR_PATH}
  4. ARCA procesará la solicitud y entregará un archivo .crt
  5. Copiar el contenido del .crt a ARCA_CERT_PEM en .env.local
`)
}

main()
