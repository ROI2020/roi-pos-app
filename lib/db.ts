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

// La zona horaria de Argentina se fija a través de la opción de conexión
// de PostgreSQL: options='-c timezone=...'
// Esto evita correr un SET timezone; separado, que en pg@8 genera un
// DeprecationWarning si se llama sin await dentro del handler 'connect'.
const TZ_OPTION = "-c timezone=America/Argentina/Buenos_Aires"

const pool =
  globalThis._pgPool ??
  (process.env.DB_HOST
    ? new Pool({
        host:     process.env.DB_HOST,
        port:     parseInt(process.env.DB_PORT ?? '6543'),
        database: process.env.DB_NAME     ?? 'postgres',
        user:     process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        options:  TZ_OPTION,
        ssl: { rejectUnauthorized: false },
      })
    : new Pool({
        connectionString: process.env.DATABASE_URL,
        options:          TZ_OPTION,
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
