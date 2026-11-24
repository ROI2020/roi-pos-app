// Ejecuta una migración SQL simple con el pool de la app.
// Uso: node db/scripts/run_migration.mjs <archivo.sql>
import pg from 'pg'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

const sql = readFileSync(resolve(__dirname, process.argv[2] || 'add_cuotas_to_products.sql'), 'utf8')

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })

try {
  const res = await pool.query(sql)
  console.log('OK:', res.command ?? 'done')
} catch (err) {
  console.error('Error:', err.message)
  process.exit(1)
} finally {
  await pool.end()
}
