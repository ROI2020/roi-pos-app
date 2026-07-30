import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'

async function requireRoisolAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const { role } = JSON.parse(decodeURIComponent(raw)) as { role: string }
    if (role !== 'roisol_admin') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quitar tildes
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 63)
}

/**
 * POST /api/roisol/clientes
 * Crea un nuevo cliente con su negocio, dominio(s) y config ARCA.
 * Todo en una transacción — si falla algo, rollback completo.
 */
export async function POST(req: Request) {
  const blocked = await requireRoisolAdmin()
  if (blocked) return blocked

  try {
    const body = await req.json() as {
      nombre: string
      activePlanId: string
      slug: string
      dominioPropio?: string
      cuit: string
      puntoVenta: number
      razonSocial: string
      condicionIva: 'monotributo' | 'responsable_inscripto'
      ambiente: 'homo' | 'prod'
      emailAdmin?: string
      validUntil?: string   // ISO date; por defecto 1 año desde hoy
    }

    const { nombre, activePlanId, slug, dominioPropio, cuit, puntoVenta, razonSocial, condicionIva, ambiente, emailAdmin, validUntil } = body

    // Validaciones básicas
    if (!nombre?.trim())      return NextResponse.json({ error: 'Nombre obligatorio' }, { status: 400 })
    if (!activePlanId)        return NextResponse.json({ error: 'Plan obligatorio' }, { status: 400 })
    if (!slug?.trim())        return NextResponse.json({ error: 'Slug obligatorio' }, { status: 400 })
    if (!/^[a-z0-9-]{1,63}$/.test(slug)) {
      return NextResponse.json({ error: 'Slug inválido: solo minúsculas, números y guiones (máx. 63 caracteres)' }, { status: 400 })
    }
    if (!cuit?.trim())        return NextResponse.json({ error: 'CUIT obligatorio' }, { status: 400 })
    if (!puntoVenta || puntoVenta < 1) return NextResponse.json({ error: 'Punto de venta inválido' }, { status: 400 })
    if (!razonSocial?.trim()) return NextResponse.json({ error: 'Razón social obligatoria' }, { status: 400 })

    const subdominio = `${slug}.roipos.com.ar`
    const dominioFinal = dominioPropio?.trim() || null

    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // 1. Crear el negocio
      const { rows: [business] } = await client.query<{ id: number }>(
        `INSERT INTO business (name) VALUES ($1) RETURNING id`,
        [nombre.trim()]
      )
      const businessId = business.id

      // 1b. Crear la suscripción en business_plan y enlazarla al negocio
      const planValidUntil = validUntil
        ? new Date(validUntil).toISOString().slice(0, 10)
        : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const { rows: [bplan] } = await client.query<{ id: number }>(
        `INSERT INTO business_plan (business_id, plan_id, status, valid_until) VALUES ($1, $2, 'active', $3) RETURNING id`,
        [businessId, parseInt(activePlanId, 10), planValidUntil]
      )
      await client.query(
        `UPDATE business SET active_subscription_id = $1 WHERE id = $2`,
        [bplan.id, businessId]
      )

      // 2. Insertar subdominio *.roipos.com.ar
      //    Es primario solo si no hay dominio propio
      await client.query(
        `INSERT INTO business_domains (business_id, domain, is_primary)
         VALUES ($1, $2, $3)`,
        [businessId, subdominio, !dominioFinal]
      )

      // 3. Insertar dominio propio si se proveyó (es el primario)
      if (dominioFinal) {
        await client.query(
          `INSERT INTO business_domains (business_id, domain, is_primary)
           VALUES ($1, $2, true)`,
          [businessId, dominioFinal]
        )
      }

      // 4. Insertar usuario administrador si se proveyó email
      if (emailAdmin?.trim()) {
        const email = emailAdmin.trim().toLowerCase()
        await client.query(
          `INSERT INTO app_users (email, name, role, business_id, active)
           VALUES ($1, $2, 'administrador', $3, true)
           ON CONFLICT (email) DO UPDATE SET
             business_id = EXCLUDED.business_id,
             role        = 'administrador',
             active      = true`,
          [email, email, businessId]
        )
      }

      // 5. Insertar config ARCA
      await client.query(
        `INSERT INTO facturacion_config
           (business_id, cuit, punto_venta, razon_social, condicion_iva, ambiente, activo)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         ON CONFLICT (cuit) DO UPDATE SET
           business_id   = EXCLUDED.business_id,
           punto_venta   = EXCLUDED.punto_venta,
           razon_social  = EXCLUDED.razon_social,
           condicion_iva = EXCLUDED.condicion_iva,
           ambiente      = EXCLUDED.ambiente,
           activo        = true`,
        [businessId, cuit.trim(), puntoVenta, razonSocial.trim(), condicionIva, ambiente]
      )

      await client.query('COMMIT')

      const wildcardActivo = true // asumir que *.roisol.com.ar ya está en Netlify
      const recordatorioNetlify = wildcardActivo
        ? `El subdominio ${subdominio} está cubierto por el wildcard *.roisol.com.ar — no requiere acción en Netlify.`
        : `Agregar manualmente en Netlify → Domain management: ${subdominio}`

      return NextResponse.json({
        businessId,
        subdomain: subdominio,
        dominioPropio: dominioFinal ?? undefined,
        recordatorioNetlify,
      }, { status: 201 })

    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  } catch (err) {
    console.error('[POST /api/roisol/clientes]', err)
    const msg = String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'El slug o CUIT ya está en uso.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Error al crear el cliente' }, { status: 500 })
  }
}
