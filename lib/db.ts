import { Pool, types } from 'pg'

// pg interpreta las columnas "timestamp without time zone" (oid 1114) como
// si fueran UTC, sin importar el SET timezone de la sesión. Como guardamos
// hora local de Argentina en esas columnas, eso hace que el frontend (que sí
// resta el offset real) muestre la hora 3 horas antes de la real (ej: caja
// abierta 10:29 se ve como 7:29). Devolvemos el string tal cual (con "T" en
// vez de espacio) para que el navegador lo interprete como hora local, sin
// reconversión.
types.setTypeParser(1114, (val: string) => val.replace(' ', 'T'))

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

// Fijar zona horaria Argentina en cada nueva conexión del pool.
// Garantiza que NOW(), CURRENT_TIMESTAMP y los cast ::date usen
// la hora local de Buenos Aires (UTC-3, sin DST).
pool.on('connect', client => {
  client.query("SET timezone = 'America/Argentina/Buenos_Aires'")
})

if (process.env.NODE_ENV !== 'production') {
  globalThis._pgPool = pool
}

export default pool
