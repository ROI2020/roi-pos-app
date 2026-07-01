import { headers } from 'next/headers'

/**
 * Retorna el business_id (integer) del tenant detectado por el middleware.
 * Disponible en Server Components y API Routes (no en Client Components).
 * Lanza si el contexto no tiene business_id — indica que el middleware no corrió.
 */
export async function getBusinessId(): Promise<number> {
  const h = await headers()
  const raw = h.get('x-business-id')
  if (!raw) throw new Error('business_id no disponible — el middleware no inyectó el tenant')
  return parseInt(raw, 10)
}

export async function getBusinessName(): Promise<string> {
  const h = await headers()
  return h.get('x-business-name') ?? ''
}
