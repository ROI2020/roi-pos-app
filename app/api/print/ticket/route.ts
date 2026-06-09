import { NextResponse } from 'next/server'

/**
 * POST /api/print/ticket
 *
 * Proxy hacia el servidor de impresion local (localhost:3002).
 * El servidor local corre en la maquina del POS y tiene acceso
 * directo a la impresora termica "XP-80C Recibos".
 */

const PRINT_SERVER = process.env.PRINT_SERVER_URL ?? 'http://localhost:3002'

export async function POST(req: Request) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body invalido' }, { status: 400 })
  }

  try {
    const res = await fetch(`${PRINT_SERVER}/ticket`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(8000),
    })

    const result = await res.json() as { ok?: boolean; error?: string }

    if (!res.ok) {
      return NextResponse.json(
        { error: result.error ?? 'Error al imprimir' },
        { status: 500 }
      )
    }

    return NextResponse.json({ ok: true })

  } catch (err: unknown) {
    const msg      = err instanceof Error ? err.message : String(err)
    const isOffline = msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('UND_ERR')

    return NextResponse.json(
      {
        error: isOffline
          ? 'Servidor de impresion no disponible. Ejecuta start.bat en la carpeta local-print-server.'
          : msg,
      },
      { status: 503 }
    )
  }
}

/** GET /api/print/ticket  — verifica si el servidor de impresion esta activo */
export async function GET() {
  try {
    const res = await fetch(`${PRINT_SERVER}/health`, {
      signal: AbortSignal.timeout(3000),
    })
    const data = await res.json() as { connected: boolean; printer: string }
    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ connected: false, error: 'Servidor no disponible' }, { status: 503 })
  }
}
