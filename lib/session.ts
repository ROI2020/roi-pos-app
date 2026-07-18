export interface UserSession {
  id: number
  name: string
  email: string
  role: 'vendedor' | 'encargado' | 'administrador' | 'roisol_admin'
  avatar_url: string | null
  business_id: number
  plan_id: number
}

const KEY = 'roipos_user'

export function getSession(): UserSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as UserSession) : null
  } catch { return null }
}

export function setSession(user: UserSession) {
  localStorage.setItem(KEY, JSON.stringify(user))
  // Cookie para el middleware — contiene lo mínimo necesario para routing
  const value = encodeURIComponent(JSON.stringify({
    id: user.id,
    role: user.role,
    business_id: user.business_id,
    plan_id: user.plan_id,
  }))
  document.cookie = `roipos_session=${value}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
}

export function clearSession() {
  localStorage.removeItem(KEY)
  document.cookie = 'roipos_session=; path=/; max-age=0'
}

export function isAdmin(session: UserSession | null) {
  return session?.role === 'administrador'
}

export function isRoisolAdmin(session: UserSession | null) {
  return session?.role === 'roisol_admin'
}

export function landingRoute(role: UserSession['role'], planId?: number): string {
  if (planId === 10) return '/setup'
  if (role === 'administrador' || role === 'roisol_admin') return '/dashboard'
  return '/venta'
}
