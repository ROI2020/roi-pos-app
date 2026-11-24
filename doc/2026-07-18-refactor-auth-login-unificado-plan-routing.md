# Login unificado + routing por plan_id

**Fecha:** 2026-07-18  
**Tipo:** Refactor — autenticación y control de acceso  
**Autor:** ROI2020  

---

## Motivación

El sistema tenía dos páginas de login separadas (`/login` para ROIPOS, `/sin-acceso` para Factura Rápida) y usaba variables de entorno (`DEV_IS_FACTURA_RAPIDA`, `DEV_FR_BUSINESS_ID`) para distinguir el producto en desarrollo. Esto no escalaba a producción y generaba rutas de acceso inconsistentes.

---

## Qué cambió

### Flujo de autenticación

**Antes:**
- ROIPOS: Google Auth en `/login` → `landingRoute(role)`
- Factura Rápida: Google Auth en `/sin-acceso` → `/setup` hardcodeado
- Routing en middleware: basado en `host.startsWith('factura.')` o `DEV_IS_FACTURA_RAPIDA=true`

**Después:**
- Un solo login en `/login` para todos los productos
- Después del login, el servidor devuelve `plan_id` (leer de `business.active_plan_id`)
- El cliente routea según `plan_id`:
  - `plan_id = 10` → `/setup` (Factura Rápida)
  - `role = administrador|roisol_admin` → `/dashboard` (ROIPOS)
  - otros roles → `/venta` (ROIPOS)
- Si el email no existe en `app_users` → redirect a `/tienda?msg=no_account` con toast de contacto a ROISOL (WhatsApp 1131005865)
- `/sin-acceso` ahora redirige automáticamente a `/login` (legacy)

### Sesión

`plan_id` se agrega a la cookie `roipos_session` y al localStorage:

```
Antes:  { id, role, business_id }
Después: { id, role, business_id, plan_id }
```

> **Nota:** cookies existentes sin `plan_id` son compatibles — el middleware las trata como plan ROIPOS (plan_id undefined → no es 10 → ROIPOS).

### Middleware

| Aspecto | Antes | Después |
|---|---|---|
| Detección FR | `host.startsWith('factura.')` o env var | `session.plan_id === 10` |
| Tenant en localhost | `DEV_FR_BUSINESS_ID` o `DEV_BUSINESS_ID` | `session.business_id` (si hay sesión) |
| `/roisol` | En `SKIP_PATHS` (sin protección) | Requiere `role = roisol_admin` |
| Usuarios FR | Solo redirigía al login correcto | Restringe rutas a `/setup`, `/emitir`, `/historial` |
| Usuarios ROIPOS | Sin restricción contra rutas FR | Bloquea acceso a rutas FR |

### Protección de rutas ROISOL

`/roisol` fue quitado de `SKIP_PATHS`. Ahora el middleware verifica `session.role === 'roisol_admin'`; cualquier otro rol recibe redirect a `/`.

### Nav — botón ROISOL

Cuando `session.role === 'roisol_admin'`, aparece un botón "ROISOL" (ícono `Building2`, borde violeta) en:
- Desktop nav: después del link de Configuración
- Mobile bottom bar: antes del botón "Más"

`roisol_admin` también hereda `isAdmin = true` (acceso a todos los links de administrador).

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `app/api/auth/google/route.ts` | JOIN con `business` para `active_plan_id`; devuelve `plan_id`; `user_not_found` como error diferenciado |
| `lib/session.ts` | `plan_id` en `UserSession`, cookie y `landingRoute(role, planId)` |
| `app/login/page.tsx` | Routing por `plan_id`; redirect a `/tienda?msg=no_account` si `user_not_found` |
| `middleware.ts` | Reescritura: routing por plan, tenant desde sesión, protección `/roisol` |
| `app/sin-acceso/page.tsx` | Redirect a `/login` (página legada) |
| `app/tienda/page.tsx` | Toast cuando `?msg=no_account` (10s, link WhatsApp ROISOL) |
| `components/nav.tsx` | Botón ROISOL para `roisol_admin`; fix: `usePlan()` movido antes del `return null` condicional |
| `app/(factura-rapida)/_components/fr-header.tsx` | Logout → `/login` |

---

## Variables de entorno removidas

| Variable | Estado |
|---|---|
| `DEV_IS_FACTURA_RAPIDA` | ❌ Eliminada del código — se puede quitar de `.env.local` |
| `DEV_FR_BUSINESS_ID` | ❌ Eliminada del código — se puede quitar de `.env.local` |
| `DEV_BUSINESS_ID` | ✅ Se mantiene como fallback de tenant en localhost (unauthenticated) |

---

## Migraciones de DB

Ninguna. La columna `business.active_plan_id` ya existía. Solo se agregó al SELECT del login.

---

## Pruebas

**Para resetear sesión en dev:** logout desde la app, o en DevTools → Application → borrar cookie `roipos_session` y localStorage key `roipos_user`.

**Escenarios a verificar:**

1. Login con email existente, plan 1-4 → llega a `/dashboard` o `/venta` según rol
2. Login con email existente, plan 10 → llega a `/setup`
3. Login con email no registrado → redirect a `/tienda?msg=no_account` con toast
4. Usuario FR intenta navegar a `/venta` → redirect a `/setup`
5. Usuario ROIPOS intenta navegar a `/setup` → redirect a `/`
6. URL `/roisol` sin `roisol_admin` → redirect a `/`
7. `roisol_admin` ve botón ROISOL en nav y puede navegar a `/roisol`
8. Cookies antiguas (sin `plan_id`) siguen funcionando como ROIPOS
