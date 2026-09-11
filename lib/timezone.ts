/**
 * Zona horaria por negocio.
 *
 * Se almacena en la tabla `settings` con la clave `timezone`,
 * usando strings IANA (https://www.iana.org/time-zones).
 *
 * Ejemplos:
 *   'America/Argentina/Buenos_Aires'  → Argentina (UTC-3, sin DST)
 *   'America/New_York'                → EE.UU. Este (UTC-5 / UTC-4 con DST)
 *   'America/Chicago'                 → EE.UU. Centro
 *   'America/Los_Angeles'             → EE.UU. Pacífico
 *
 * Para setear: PUT /api/settings con { timezone: 'America/New_York' }
 *
 * IMPORTANTE — patrón de uso en SQL con columnas TIMESTAMP (sin timezone):
 *
 *   (col AT TIME ZONE 'UTC' AT TIME ZONE $tz)::date
 *
 *   1er AT TIME ZONE 'UTC'  → declara el valor almacenado como UTC (→ TIMESTAMPTZ)
 *   2do AT TIME ZONE $tz    → convierte a hora local del negocio  (→ TIMESTAMP local)
 *   ::date                  → extrae la fecha en la zona del negocio
 *
 *   NO usar:  col::date              (queda en UTC, erra ventas nocturnas)
 *   NO usar:  col AT TIME ZONE $tz  (sin el primer paso, interpreta el valor como hora local)
 */

import type { Pool, PoolClient } from 'pg'

export const DEFAULT_TZ = 'America/Argentina/Buenos_Aires'

/**
 * Devuelve la zona horaria IANA configurada para el negocio.
 * Si no está configurada devuelve el default argentino.
 */
export async function getBusinessTimezone(
  db: Pool | PoolClient,
  businessId: number,
): Promise<string> {
  const { rows } = await db.query<{ value: string }>(
    `SELECT value FROM settings WHERE business_id = $1 AND key = 'timezone' LIMIT 1`,
    [businessId],
  )
  return rows[0]?.value?.trim() || DEFAULT_TZ
}

/**
 * Fragmento SQL para convertir una columna TIMESTAMP-UTC a fecha local del negocio.
 * Usar con un parámetro de tipo string IANA, ej:
 *
 *   params.push(tz)
 *   `(col ${tzDateExpr(p++)})::date`
 */
export function tzDateExpr(paramIndex: number): string {
  return `AT TIME ZONE 'UTC' AT TIME ZONE $${paramIndex}`
}
