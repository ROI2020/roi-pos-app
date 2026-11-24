# Ruleta de Promociones — Acceso Público para Clientes

**Fecha:** 2026-08-06  
**Estado:** Pendiente de implementación antes del lanzamiento público  
**Contexto:** La Ruleta actualmente funciona solo para el cajero (panel interno, requiere sesión). Para que el cliente la use directamente desde su celular (vía QR en el local), necesita ser accesible sin login.

---

## 1. Situación Actual

| Elemento | Estado |
|---|---|
| Lógica de la ruleta (spin, verificación por WA, códigos) | ✅ Implementada |
| Panel de cajero (`/ruleta`) | ✅ Funciona con sesión |
| Acceso público sin sesión | ❌ No existe |
| Rate limiting | ❌ No existe |
| URL pública con QR | ❌ No existe |

El middleware redirige cualquier ruta sin sesión a `/login`, y todas las APIs usan `requireBusinessId()` que lee `business_id` de la cookie de sesión.

---

## 2. URL Pública Propuesta

Dado que el sistema ya usa subdominios por negocio (`[slug].roipos.com.ar`), la URL pública más natural es:

```
https://[slug].roipos.com.ar/ruleta
```

El `business_id` se resuelve igual que siempre: por dominio en el middleware.  
**No hace falta cambiar la lógica de resolución de tenant** — solo hay que permitir que la ruta `/ruleta` sea pública.

Alternativa sin subdominio propio (durante pruebas o para negocios sin subdominio):
```
https://roipos.com.ar/ruleta/[slug]
```

---

## 3. Cambios Necesarios

### 3.1 Middleware — agregar `/ruleta` a páginas públicas

**Archivo:** `middleware.ts`

```ts
// CAMBIO: agregar '/ruleta' a PUBLIC_PAGES
const PUBLIC_PAGES = ['/tienda', '/login', '/sin-acceso', '/ruleta']
```

⚠️ **Problema**: el middleware también inyecta `x-business-id` en el header del request (leído desde el dominio). Cuando la sesión es nula, ese header NO se inyecta actualmente porque se hace al final del flujo autenticado. Hay que asegurarse de que el bloque de resolución de tenant también corra para páginas públicas.

**Solución**: Mover la resolución del tenant ANTES del chequeo de sesión, y dejar que las páginas públicas tengan `x-business-id` disponible igual que las privadas.

---

### 3.2 APIs — variante pública

Las APIs que consume la ruleta actualmente usan `requireBusinessId()` que falla sin sesión. Opciones:

**Opción A (recomendada): función `getPublicBusinessId()`**  
Crea una nueva función helper que acepta `x-business-id` del header (puesto por el middleware) sin validar sesión:

```ts
// lib/get-public-business-id.ts
export async function getPublicBusinessId(): Promise<{ businessId: number } | NextResponse> {
  const hdrs = await headers()
  const id = hdrs.get('x-business-id')
  if (!id) return NextResponse.json({ error: 'Negocio no encontrado' }, { status: 404 })
  return { businessId: parseInt(id) }
}
```

**Opción B: rutas API separadas bajo `/api/public/`**  
Duplica solo los endpoints necesarios bajo un prefijo público. Más verbose pero más explícito.

**Endpoints que necesitan variante pública:**

| Endpoint actual | Necesita variante pública | Notas |
|---|---|---|
| `GET /api/promotions?active=true` | ✅ Sí | Solo segmentos de la ruleta |
| `GET /api/settings` | ✅ Sí | Solo `business_logo` y `business_name` |
| `GET /api/customers?q=phone` | ✅ Sí | Solo buscar por teléfono exacto |
| `POST /api/customers` | ✅ Sí | Registro del cliente |
| `POST /api/customers/[id]/code` | ✅ Sí | Generar código WA |
| `POST /api/customers/[id]/verify` | ✅ Sí | Confirmar verificación |
| `POST /api/roulette/spin` | ✅ Sí | El giro en sí |
| `PATCH /api/customers/[id]` | ❌ No | No exponer (admin reset) |

---

### 3.3 Página pública — nuevo componente

**Archivo nuevo:** `app/ruleta/page.tsx`

No usar el panel de cajero (`roulette-panel.tsx`) directamente porque:
- Muestra el botón "Resetear para probar" (admin only, pero mejor no incluirlo)
- El layout ya tiene `<Nav>` que no debe mostrarse
- Puede haber ajustes de UX específicos para celular

**Plan:**
- Crear `app/ruleta/page.tsx` que renderiza un nuevo componente `<RoulettePublic />`
- El componente es una versión simplificada de `roulette-panel.tsx`:
  - Sin `getSession()` (no hay sesión)
  - Sin botón de reset admin
  - Adaptado a mobile-first (pantalla completa, sin sidebar de cajero)
- El layout de la ruta no debe incluir `<Nav>` → usar un layout separado o detectar con header `x-is-factura-rapida` (o mejor, un nuevo header `x-is-public`)

```
app/
  ruleta/
    layout.tsx   ← layout vacío (sin Nav, sin footer)
    page.tsx     ← Server Component que pasa businessId al componente
```

---

### 3.4 Rate Limiting — CRÍTICO

Sin rate limiting, un usuario malicioso puede:
- Registrar teléfonos falsos masivamente
- Hacer llamadas masivas a `/api/roulette/spin`
- Generar un volumen de códigos de descuento

**Implementación mínima viable:**

```ts
// En cada endpoint público crítico (spin, register, code)
// Verificar por IP en la base de datos o en memoria (upstash redis / vercel kv)

// Opción sin dependencias externas: tabla en la DB
// CREATE TABLE rate_limits (
//   key TEXT NOT NULL,           -- ej: "spin:ip:1.2.3.4" o "spin:phone:549..."
//   hits INTEGER DEFAULT 1,
//   window_start TIMESTAMPTZ DEFAULT NOW(),
//   PRIMARY KEY (key)
// );
```

Límites recomendados:

| Acción | Límite sugerido |
|---|---|
| `POST /spin` por IP | 5 giros / hora |
| `POST /customers` (registro) por IP | 10 registros / hora |
| `POST /customers/[id]/code` | 3 códigos WA / 10 min |
| `GET /customers?q=phone` por IP | 20 búsquedas / min |

> **Alternativa simple a corto plazo:** Upstash Redis (free tier, integra fácil con Next.js/Vercel) o usar `@vercel/kv`.

---

### 3.5 Verificación por WhatsApp — validar el número de destino

El código WA se envía al WhatsApp del **local** (`whatsapp_phone` en settings). Actualmente el cliente lo reenvía al cajero. En el flujo público:
- El cliente escanea el QR → abre WhatsApp → envía el código al local
- El cajero ve el mensaje y hace click en "Verificar" en la pantalla pública

**Alternativa automática (más robusta):** integrar un webhook de WhatsApp Business API para verificar automáticamente cuando el cliente envía el código. Esto elimina la intervención del cajero pero requiere configurar una cuenta de WA Business API.

> Por ahora el flujo manual funciona bien para el caso de uso presencial.

---

### 3.6 Seguridad — resumen de lo que YA está cubierto

| Riesgo | Mitigación existente |
|---|---|
| Girar más de 1 vez por mes | ✅ `last_roulette_month` en DB, chequeado en el spin |
| Código de descuento ya usado | ✅ `used_at` en `discount_codes`, marcado al cerrar venta |
| Código expirado | ✅ `expires_at` chequeado en validate |
| Cliente no verificado gira | ✅ `verified` chequeado en spin |
| Spin sin `customer_id` válido | ✅ validado en la API |

| Riesgo | Sin mitigación (pendiente) |
|---|---|
| Registro masivo con teléfonos falsos | ❌ Rate limiting |
| Giros programáticos (bot) | ❌ Rate limiting por IP |
| Enumeración de códigos | ❌ Los códigos son de 8 chars alfanuméricos (~3.5T combinaciones — OK) |

---

## 4. Checklist de Tareas (en orden)

### Paso 1 — Middleware (1-2h)
- [ ] Refactorizar para que la resolución de tenant corra antes del check de sesión
- [ ] Agregar `/ruleta` a `PUBLIC_PAGES` con `x-business-id` disponible

### Paso 2 — Helper público (30 min)
- [ ] Crear `lib/get-public-business-id.ts`

### Paso 3 — APIs públicas (2-3h)
- [ ] Modificar (o crear alias públicos de) los 7 endpoints de la tabla 3.2
- [ ] Usar `getPublicBusinessId()` en lugar de `requireBusinessId()`
- [ ] Asegurarse de no exponer datos de otros negocios

### Paso 4 — Componente público (2-3h)
- [ ] Crear `app/ruleta/layout.tsx` (sin Nav)
- [ ] Crear `app/ruleta/page.tsx`
- [ ] Crear `components/roulette-public.tsx` (derivado de `roulette-panel.tsx`, sin partes de cajero)
- [ ] Mobile-first: pila vertical, wheel más chico en pantallas pequeñas

### Paso 5 — Rate Limiting (2-4h)
- [ ] Elegir solución (DB tabla, Upstash, Vercel KV)
- [ ] Implementar en: `spin`, `POST /customers`, `POST .../code`
- [ ] Testear desde incógnito / distinto IP

### Paso 6 — QR del local (30 min)
- [ ] Generar QR de `https://[slug].roipos.com.ar/ruleta` desde Settings
- [ ] Mostrarlo en el panel de configuración → "QR para el local"
- [ ] Botón "Descargar PNG"

### Paso 7 — Test E2E (1-2h)
- [ ] Flujo completo: celular escanea QR → se registra → verifica por WA → gira → obtiene cupón → imprime
- [ ] Probar sin sesión, modo incógnito
- [ ] Probar que el cupón generado aplica correctamente en el POS

---

## 5. Consideraciones de Producción

- **HTTPS obligatorio** para que el QR abra seguro (ya debería estar con Vercel)
- **Subdomain CORS**: si el subdominio es distinto del dominio principal, verificar que las APIs respondan correctamente (actualmente el middleware resuelve por `host`, debería andar)
- **Cache de assets públicos**: logo del negocio se carga en cada visita — considerar caching agresivo (`Cache-Control: max-age=86400`)
- **Meta tags OG**: agregar `og:title`, `og:image` a la página pública para que se vea bien al compartir por WhatsApp
