/**
 * db/migrate.mjs — Runner de migraciones (ESM, solo pg)
 *
 * Uso local:
 *   node --env-file=.env.local db/migrate.mjs
 *
 * En Netlify corre automáticamente después del build (ver netlify.toml).
 *
 * Las migraciones van en db/migrations/*.sql (solo ese nivel, no subcarpetas),
 * ordenadas por nombre (NNN_descripcion.sql). Cada archivo se envuelve en
 * BEGIN/COMMIT con su registro en public.schema_migrations.
 *
 * Reglas:
 *   - Nada que no pueda ir dentro de una transacción (no CREATE INDEX CONCURRENTLY).
 *   - Una migración aplicada en PROD no se edita.
 *   - Toda migración tiene que ser compatible con el código publicado
 *     (agregar columnas/tablas/índices sí; borrar o renombrar, en dos pases).
 */

import pg from 'pg'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// ── Conexión (misma lógica que lib/db.ts) ───────────────────────────────────
function buildPool() {
  if (process.env.DB_HOST) {
    const host = process.env.DB_HOST
    return {
      pool: new pg.Pool({
        host,
        port:     parseInt(process.env.DB_PORT ?? '6543'),
        database: process.env.DB_NAME     ?? 'postgres',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
      }),
      host,
      user: process.env.DB_USER ?? '',
    }
  }

  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('[migrate] Falta DATABASE_URL o DB_HOST en las variables de entorno.')
    process.exit(1)
  }

  let host = 'localhost'
  try { host = new URL(url).hostname } catch {}

  const isLocal = host === 'localhost' || host === '127.0.0.1'

  return {
    pool: new pg.Pool({
      connectionString: url,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    }),
    host,
    user: '',
  }
}

// ── Ref del proyecto (como S21) ─────────────────────────────────────────────
function extractRef(user) {
  if (!user) return null
  const parts = user.split('.')
  return parts.length > 1 ? parts.slice(1).join('.') : null
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const { pool, host, user } = buildPool()
  const isLocal = host === 'localhost' || host === '127.0.0.1'
  const isNetlify = process.env.NETLIFY === 'true'
  const appEnv = process.env.APP_ENV ?? 'development'

  // Imprimir ambiente y ref, nunca la URL
  const ref = extractRef(user) || (isLocal ? 'local' : host.split('.')[0])
  console.log(`[migrate] app_env=${appEnv}  db_ref=${ref}`)

  // Guarda local (P157): fuera de Netlify, solo localhost
  if (!isNetlify && !isLocal) {
    console.error(`[migrate] ERROR: fuera de Netlify solo se acepta localhost (host=${host}).`)
    console.error('           Las bases remotas se migran solo desde el build de Netlify.')
    await pool.end()
    process.exit(1)
  }

  const client = await pool.connect()
  try {
    // Crear tabla de registro si no existe (con esquema explícito)
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        version    text        PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `)

    // Migraciones ya aplicadas
    const { rows } = await client.query('SELECT version FROM public.schema_migrations ORDER BY version')
    const applied = new Set(rows.map(r => r.version))

    // Leer directorio de migraciones
    const migrationsDir = resolve(__dirname, 'migrations')
    if (!existsSync(migrationsDir)) {
      console.log('[migrate] No existe db/migrations/ — nada que migrar.')
      return
    }

    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && !f.startsWith('.'))
      .sort()

    // Guarda de la baseline: si la baseline no está aplicada pero la base ya tiene tablas
    const baselineFile = files.find(f => f.startsWith('000_baseline'))
    if (baselineFile && !applied.has(baselineFile)) {
      const { rows: tables } = await client.query(
        `SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'business'
          LIMIT 1`
      )
      if (tables.length > 0) {
        console.error(
          `[migrate] ERROR: Base existente sin baseline registrada.`
        )
        console.error(
          `           Correr db/scripts/adoptar-baseline.sql antes de migrar.`
        )
        client.release()
        await pool.end()
        process.exit(1)
      }
    }

    // Aplicar migraciones pendientes
    let count = 0
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`[migrate] skip     ${file}`)
        continue
      }
      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      try {
        await client.query('BEGIN')
        await client.query('SET search_path TO public')
        await client.query(sql)
        await client.query(
          'INSERT INTO public.schema_migrations (version) VALUES ($1)',
          [file]
        )
        await client.query('COMMIT')
        console.log(`[migrate] applied  ${file}`)
        count++
      } catch (err) {
        await client.query('ROLLBACK')
        console.error(`[migrate] ERROR en ${file}:`, err.message || err)
        await pool.end()
        process.exit(1)
      }
    }

    if (count === 0) {
      console.log('[migrate] No hay migraciones pendientes.')
    } else {
      console.log(`[migrate] ${count} migración(es) aplicada(s).`)
    }
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch(err => {
  console.error('[migrate] Error inesperado:', err)
  process.exit(1)
})
