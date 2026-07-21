import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import pool from '@/lib/db'
import { obtenerToken } from '@/lib/facturacion/wsaa'
import { obtenerUltimoNroComprobante } from '@/lib/facturacion/wsfev1'

async function requireAdmin(): Promise<NextResponse | null> {
  const cookieStore = await cookies()
  const raw = cookieStore.get('roipos_session')?.value
  if (!raw) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  try {
    const { role } = JSON.parse(decodeURIComponent(raw)) as { role: string }
    if (role !== 'administrador' && role !== 'roisol_admin') return NextResponse.json({ error: 'Acceso denegado' }, { status: 403 })
    return null
  } catch {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 })
  }
}

/**
 * GET /api/arca/verificar?cuit=XX-XXXXXXXX-X
 *
 * Prueba la cadena completa: certificado ROISOL → WSAA → FECompUltimoAutorizado.
 * Retorna errorDetalle como clave del mapa MENSAJES_ERROR del cliente.
 */
export async function GET(req: Request) {
  const blocked = await requireAdmin()
  if (blocked) return blocked

  const { searchParams } = new URL(req.url)
  const cuit = searchParams.get('cuit')?.trim()

  if (!cuit) {
    return NextResponse.json({ error: 'Param requerido: cuit' }, { status: 400 })
  }

  // Verificar que el cert ROISOL esté configurado antes de llegar a ARCA
  if (process.env.ARCA_MOCK !== 'true') {
    if (!process.env.ARCA_CERT_PEM || !process.env.ARCA_KEY_PEM) {
      return NextResponse.json({
        conexionWsaa: false,
        puntoVentaHabilitado: false,
        ultimoNroComprobante: null,
        ambiente: process.env.ARCA_AMBIENTE ?? 'homo',
        errorDetalle: 'cert_no_configurado',
      })
    }
  }

  try {
    const cfgRes = await pool.query<{ punto_venta: number; ambiente: 'homo' | 'prod' }>(
      `SELECT punto_venta, ambiente FROM facturacion_config WHERE cuit = $1 AND activo = true`,
      [cuit]
    )
    if (!cfgRes.rows.length) {
      return NextResponse.json({ error: `CUIT ${cuit} no configurado` }, { status: 404 })
    }
    const { punto_venta, ambiente: cfgAmbiente } = cfgRes.rows[0]
    const ambiente = cfgAmbiente   // siempre del DB, no de env var global

    // Intentar obtener token WSAA
    let auth: { token: string; sign: string }
    try {
      auth = await obtenerToken(cuit, ambiente)
    } catch (e) {
      const rawErr = String(e)
      console.error('[arca/verificar] WSAA falló:', rawErr)
      const msg = rawErr.toLowerCase()
      const errorDetalle = msg.includes('no delegó') || msg.includes('delegac')
        ? 'delegacion_pendiente'
        : msg.includes('notauthorized') || msg.includes('no autorizado') || msg.includes('coe.not')
          ? 'delegacion_pendiente'
          : msg.includes('untrusted') || msg.includes('confianza')
            ? 'cert_ambiente_incorrecto'
            : msg.includes('cert') || msg.includes('certificad') || msg.includes('pkcs') || msg.includes('pem') || msg.includes('firma') || msg.includes('signing')
              ? 'cert_no_configurado'
              : 'wsaa_timeout'
      return NextResponse.json({
        conexionWsaa: false,
        puntoVentaHabilitado: false,
        ultimoNroComprobante: null,
        ambiente,
        errorDetalle,
        _error: rawErr,   // visible en DevTools → Network hasta que se resuelva el problema
      })
    }

    // WSAA OK — verificar punto de venta con FECompUltimoAutorizado
    try {
      const ultimoNroComprobante = await obtenerUltimoNroComprobante(
        { ...auth, cuit },
        punto_venta,
        11,   // Factura B
        ambiente
      )
      // Registrar timestamp de verificación exitosa
      await pool.query(
        `UPDATE facturacion_config SET last_verified_at = NOW() WHERE cuit = $1`,
        [cuit]
      )
      return NextResponse.json({
        conexionWsaa: true,
        puntoVentaHabilitado: true,
        ultimoNroComprobante,
        ambiente,
      })
    } catch (e) {
      // ErrorFacturacion es un objeto {categoria, mensaje, codigoAfip}; String(e) da [object Object]
      const afipCode = (e as { codigoAfip?: number })?.codigoAfip
      const afipMsg  = (e as { mensaje?: string })?.mensaje ?? String(e)
      const msg = afipMsg.toLowerCase()
      console.error('[arca/verificar] WSFE falló, code:', afipCode, 'msg:', afipMsg)
      const errorDetalle = afipCode === 600 || msg.includes('relacion') || msg.includes('delegac')
        ? 'delegacion_pendiente'
        : msg.includes('punto') || msg.includes('habilitad')
          ? 'punto_venta_inactivo'
          : msg.includes('servicio') || msg.includes('wsfe')
            ? 'cuit_sin_servicio'
            : 'punto_venta_inactivo'
      return NextResponse.json({
        conexionWsaa: true,
        puntoVentaHabilitado: false,
        ultimoNroComprobante: null,
        ambiente,
        errorDetalle,
        _error: `AFIP code ${afipCode}: ${afipMsg}`,
      })
    }
  } catch (err) {
    console.error('[GET /api/arca/verificar]', err)
    return NextResponse.json(
      { conexionWsaa: false, puntoVentaHabilitado: false, ultimoNroComprobante: null,
        ambiente: process.env.ARCA_AMBIENTE ?? 'homo', errorDetalle: 'wsaa_timeout' },
      { status: 500 }
    )
  }
}
