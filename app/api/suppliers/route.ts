import { NextResponse } from 'next/server'
import pool from '@/lib/db'

// GET /api/suppliers  →  lista todos los proveedores
export async function GET() {
  try {
    const { rows } = await pool.query(
      `SELECT id, company_name, cuit, phone
       FROM suppliers
       ORDER BY company_name`
    )
    return NextResponse.json(rows)
  } catch (err) {
    console.error('[GET /api/suppliers]', err)
    return NextResponse.json(
      { error: 'Error al obtener proveedores' },
      { status: 500 }
    )
  }
}

// POST /api/suppliers  →  crea un nuevo proveedor
// Body: { company_name, cuit?, phone? }
export async function POST(request: Request) {
  try {
    const { company_name, cuit, phone } = await request.json()

    if (!company_name?.trim()) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio' },
        { status: 400 }
      )
    }

    const { rows } = await pool.query(
      `INSERT INTO suppliers (company_name, cuit, phone)
       VALUES ($1, $2, $3)
       RETURNING id, company_name, cuit, phone`,
      [company_name.trim(), cuit?.trim() || null, phone?.trim() || null]
    )

    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/suppliers]', err)
    // Duplicate CUIT (unique constraint violation)
    if ((err as { code?: string }).code === '23505') {
      return NextResponse.json(
        { error: 'Ya existe un proveedor con ese CUIT' },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { error: 'Error al crear proveedor' },
      { status: 500 }
    )
  }
}
