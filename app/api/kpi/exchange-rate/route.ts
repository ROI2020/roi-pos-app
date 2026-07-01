import { NextResponse } from 'next/server'

export interface ExchangeRateData {
  rate:  number
  fecha: string
}

export async function GET() {
  try {
    const res = await fetch('https://dolarapi.com/v1/dolares/oficial', {
      next: { revalidate: 3600 },
    })

    if (!res.ok) throw new Error(`dolarapi status ${res.status}`)

    const json = await res.json()
    const rate  = Number(json.venta)
    const fecha = String(json.fechaActualizacion ?? '').slice(0, 10)

    if (!rate || isNaN(rate)) throw new Error('Tipo de cambio inválido en respuesta')

    return NextResponse.json({ rate, fecha } satisfies ExchangeRateData)
  } catch (err) {
    console.error('[exchange-rate]', err)
    return NextResponse.json({ error: String(err) }, { status: 503 })
  }
}
