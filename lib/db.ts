import { Pool, types } from 'pg'

// Las columnas "timestamp without time zone" (OID 1114) en Supabase se
// almacenan con la hora UTC (CURRENT_TIMESTAMP usa UTC porque PgBouncer
// en transaction-mode no propaga startup params como timezone de sesión).
//
// pg las devuelve como strings sin indicador de zona, p.ej.:
//   "2026-08-28 13:48:53.115"
//
// Agregamos 'Z' para que JavaScript las interprete como UTC y las convierta
// automáticamente a la hora local del navegador:
//   new Date("2026-08-28T13:48:53.115Z") → 10:48 en un browser con UTC-3 (AR)
types.setTypeParser(1114, (val: string) => val.replace(' ', 'T') + 'Z')

// Singleton: una sola instancia del pool durante toda la vida del servidor.
// En desarrollo Next.js recarga módulos en hot-reload, por eso lo guardamos
// en globalThis para no crear pools duplicados.
declare global {
  // eslint-disable-next-line no-var
  var _pgPool: Pool | undefined
}

const pool =
  globalThis._pgPool ??
  (process.env.DB_HOST
    ? new Pool({
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT ?? '6543'),
        database: process.env.DB_NAME     ?? 'postgres',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: { rejectUnauthorized: false },
      })
    : new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl:
          process.env.NODE_ENV === 'production'
            ? { rejectUnauthorized: false }
            : false,
      })
  )

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgPool = pool
}

export default pool
