export interface UserSession {
  id: number
  name: string
  email: string
  role: 'vendedor' | 'encargado' | 'administrador' | 'roisol_admin'
  avatar_url: string | null
  business_id: number   // id (integer) del negocio al que pertenece el usuario
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
  // Cookie para el middleware (no HttpOnly para poder leerla en el cliente también)
  const value = encodeURIComponent(JSON.stringify({ id: user.id, role: user.role, business_id: user.business_id }))
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

export function landingRoute(role: UserSession['role']) {
  return role === 'administrador' ? '/dashboard' : '/venta'
}
