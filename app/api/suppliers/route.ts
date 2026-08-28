import { NextResponse } from 'next/server'
import pool from '@/lib/db'
import { requireBusinessId } from '@/lib/get-business-id'

// GET /api/suppliers  →  lista proveedores del negocio activo
export async function GET() {
  const bizResult = await requireBusinessId()
  if (bizResult instanceof NextResponse) return bizResult
  const { businessId } = bizResult

  try {
    const { rows } = await pool.query(
      `SELECT id, company_name, cuit, phone
       FROM suppliers
       WHERE business_id = $1
       ORDER BY company_name`,
      [businessId]
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

// POST /api/suppliers  →  crea un nuevo proveedor para el negocio activo
// Body: { company_name, cuit?, phone? }
export async function POST(request: Request) {
  const bizResult = await requireBusinessId()
  if (bizResult instanceof NextResponse) return bizResult
  const { businessId } = bizResult

  try {
    const { company_name, cuit, phone } = await request.json()

    if (!company_name?.trim()) {
      return NextResponse.json(
        { error: 'El nombre es obligatorio' },
        { status: 400 }
      )
    }

    const { rows } = await pool.query(
      `INSERT INTO suppliers (company_name, cuit, phone, business_id)
       VALUES ($1, $2, $3, $4)
       RETURNING id, company_name, cuit, phone`,
      [company_name.trim(), cuit?.trim() || null, phone?.trim() || null, businessId]
    )

    return NextResponse.json(rows[0], { status: 201 })
  } catch (err: unknown) {
    console.error('[POST /api/suppliers]', err)
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
