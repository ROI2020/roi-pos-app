# Tienda Online — Spec v1  
**ROIPOS · Carrito + Checkout + Envío Correo Argentino**  
Última revisión: 2026-08-21 — Todas las decisiones de arquitectura están tomadas.

---

## 1. Contexto del proyecto

**ROIPOS** es un sistema POS para un negocio de indumentaria, ya funcionando para venta presencial. Esta iteración construye la **tienda online**: carrito de compras + checkout + envío a domicilio/sucursal vía **Correo Argentino (API PAQ.AR)**.

**Stack:**
- Next.js 15.5, App Router. Las API routes (`app/api/**`) son el backend.
- Runtime: Node.js.
- Base de datos: PostgreSQL 18 en Windows (`postgresql-x64-18`).
- ORM: ninguno. Queries raw SQL vía `pool.query()` (cliente: `node-postgres`).
- `lib/db.ts` expone el pool compartido por todas las routes.
- Todo en TypeScript.

---

## 2. Decisiones de arquitectura — TODAS TOMADAS

### 2.1 Tabla de pedidos: `online_orders` separada (NO tocar `sales`)

`sales` es la tabla de ventas POS presenciales y tiene `branch_id NOT NULL`, integración ARCA/AFIP, y lógica de descuento de stock. No se toca.

Los pedidos online viven en `online_orders`. El flujo de stock es:

```
Cliente hace checkout  →  online_orders.status = 'pending'   (stock NO descontado aún)
Admin confirma pedido  →  se crea fila en sales + sale_details (stock descontado aquí)
                       →  online_orders.status = 'confirmed' + online_orders.sale_id = <id>
```

Esto permite también analizar pedidos pendientes y carritos abandonados.

### 2.2 Carrito: client-side en `localStorage`

- No hay endpoint `POST /api/cart`.
- El carrito vive en el navegador. Al llegar al checkout, se envía el contenido completo.
- Al crear el pedido, el backend valida disponibilidad de stock en ese momento (ver 2.3).

### 2.3 Stock: checkout optimista (sin reservas)

El inventario es serializado (`branch_inventory`: 1 fila = 1 unidad física). No se bloquean items al agregar al carrito. Al confirmar el checkout, el backend verifica si los `product_variant_id` del pedido todavía existen en `branch_inventory`. Si alguno fue vendido entretanto, responde con error claro indicando cuál item. El comprador puede quitar ese item y reintentar.

### 2.4 Rótulo PDF: on-demand, no se guarda en DB

El PDF se pide a PAQ.AR en el momento en que el admin lo necesita (`POST /v1/labels`). La tabla `shipments` solo guarda el `trackingNumber`. Esto evita almacenar hasta 600 KB de base64 por fila.

### 2.5 Tarifas de envío: tabla `shipping_rates` FK a `correo_config`

No hay endpoint de cotización en PAQ.AR v1. Las tarifas son valores fijos por zona, mantenidos en la DB. La arquitectura soporta múltiples carriers: cada tarifa apunta a un `correo_config` (que puede ser Correo Argentino o Andreani en el futuro). En el checkout se muestran las tarifas activas del carrier correspondiente y el usuario elige.

Ejemplo de vista del checkout:
```
○ Correo Argentino — Retiro en sucursal   $ 6.900 — 72 hs
○ Correo Argentino — A domicilio          $ 8.200 — 72 hs
○ Andreani — A domicilio                  $11.000 — 24 hs
```

### 2.6 Identificación del comprador: por teléfono

En el checkout el cliente ingresa nombre + teléfono. El backend hace `SELECT` por `(phone, business_id)` en `customers`. Si existe: reutiliza. Si no: crea. No se requiere registro previo.

### 2.7 Confirmación al comprador: WhatsApp

Al crear el pedido exitosamente, el backend arma un mensaje de confirmación y devuelve el `waLink` al frontend, que abre WhatsApp automáticamente (o muestra el botón). Incluye: resumen del pedido, total, tipo de entrega, y link de seguimiento si hay `trackingNumber`.

Notificación al negocio (admin): el nav del sistema muestra un badge con la cantidad de pedidos en estado `pending`. El endpoint `GET /api/orders/online/count-pending` devuelve el conteo.

### 2.8 Dimensiones: cascada producto → categoría → settings globales

Para calcular el bulto a enviar:
1. Se intenta leer `weight_grams`, `height_cm`, `width_cm`, `depth_cm` del `product`.
2. Si son NULL, se buscan las dimensiones de la `category` del producto.
3. Si tampoco, se usan los defaults en `settings`:
   - `shipping_default_weight_grams`
   - `shipping_default_height_cm`
   - `shipping_default_width_cm`
   - `shipping_default_depth_cm`

El bulto del pedido se consolida sumando pesos y tomando el máximo de cada dimensión de todos los items (comportamiento correcto para una caja que contiene múltiples prendas).

### 2.9 Credenciales PAQ.AR: api_key en `.env`, resto en DB

La `api_key` es una contraseña — va en variables de entorno, no en la DB:

```
# .env.local
CORREO_ARGENTINO_API_KEY=
CORREO_ARGENTINO_ENV=test   # test | prod
ANDREANI_API_KEY=           # reservado para futura integración
```

La tabla `correo_config` guarda la configuración no-sensible (nombre, código de convenio/agreement, ambiente, activo). El módulo `lib/correo/correoArgentino.ts` lee el `agreement` de la DB y el `api_key` del env.

---

## 3. Schema de base de datos — Migraciones a ejecutar

### 3.1 Dimensiones en `products` (ya tiene la columna `cuotas` de la sesión anterior)

```sql
-- migration: 20260821_product_dimensions.sql
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS weight_grams  int4          NULL,
  ADD COLUMN IF NOT EXISTS height_cm     numeric(6,2)  NULL,
  ADD COLUMN IF NOT EXISTS width_cm      numeric(6,2)  NULL,
  ADD COLUMN IF NOT EXISTS depth_cm      numeric(6,2)  NULL;
```

### 3.2 Dimensiones por categoría (fallback nivel 2)

```sql
-- migration: 20260821_category_dimensions.sql
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS weight_grams  int4          NULL,
  ADD COLUMN IF NOT EXISTS height_cm     numeric(6,2)  NULL,
  ADD COLUMN IF NOT EXISTS width_cm      numeric(6,2)  NULL,
  ADD COLUMN IF NOT EXISTS depth_cm      numeric(6,2)  NULL;
```

### 3.3 Dirección de envío (por pedido, no 1:1 con customer)

```sql
-- migration: 20260821_shipping_addresses.sql
CREATE TABLE IF NOT EXISTS shipping_addresses (
  id              serial4 PRIMARY KEY,
  customer_id     int4 REFERENCES customers(id) ON DELETE SET NULL,
  street_name     varchar(150) NOT NULL,
  street_number   varchar(20)  NOT NULL,
  floor           varchar(20),
  department      varchar(20),
  city_name       varchar(100) NOT NULL,
  state           varchar(1)   NOT NULL,  -- código PAQ.AR (C=CABA, B=BsAs, etc.)
  zip_code        varchar(12)  NOT NULL,
  observation     text,
  created_at      timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

**Tabla de provincias PAQ.AR (para usar en el frontend — no es una tabla SQL, es un constant en el código):**

```typescript
// lib/correo/provinces.ts
export const PAQAR_PROVINCES = [
  { code: 'C', name: 'CABA' },
  { code: 'B', name: 'Buenos Aires' },
  { code: 'K', name: 'Catamarca' },
  { code: 'H', name: 'Chaco' },
  { code: 'U', name: 'Chubut' },
  { code: 'X', name: 'Córdoba' },
  { code: 'W', name: 'Corrientes' },
  { code: 'E', name: 'Entre Ríos' },
  { code: 'P', name: 'Formosa' },
  { code: 'Y', name: 'Jujuy' },
  { code: 'L', name: 'La Pampa' },
  { code: 'F', name: 'La Rioja' },
  { code: 'M', name: 'Mendoza' },
  { code: 'N', name: 'Misiones' },
  { code: 'Q', name: 'Neuquén' },
  { code: 'R', name: 'Río Negro' },
  { code: 'A', name: 'Salta' },
  { code: 'J', name: 'San Juan' },
  { code: 'D', name: 'San Luis' },
  { code: 'Z', name: 'Santa Cruz' },
  { code: 'S', name: 'Santa Fe' },
  { code: 'G', name: 'Santiago del Estero' },
  { code: 'V', name: 'Tierra del Fuego' },
  { code: 'T', name: 'Tucumán' },
] as const
```

### 3.4 Configuración de carriers

```sql
-- migration: 20260821_correo_config.sql
CREATE TABLE IF NOT EXISTS correo_config (
  id            serial4 PRIMARY KEY,
  business_id   int4 NOT NULL REFERENCES business(id),
  carrier       varchar(30) NOT NULL,       -- 'correo_argentino' | 'andreani'
  display_name  varchar(100) NOT NULL,      -- 'Correo Argentino', 'Andreani'
  agreement     varchar(30) NOT NULL,       -- código de convenio (no es secreto)
  environment   varchar(4) NOT NULL DEFAULT 'test',  -- 'test' | 'prod'
  active        bool NOT NULL DEFAULT false,
  created_at    timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (business_id, carrier)
);

-- Insertar registro base (api_key va en .env, no aquí)
INSERT INTO correo_config (business_id, carrier, display_name, agreement, environment, active)
VALUES (1, 'correo_argentino', 'Correo Argentino', '', 'test', false)
ON CONFLICT DO NOTHING;
```

### 3.5 Tarifas de envío (por carrier, por zona)

```sql
-- migration: 20260821_shipping_rates.sql
CREATE TABLE IF NOT EXISTS shipping_rates (
  id              serial4 PRIMARY KEY,
  correo_config_id int4 NOT NULL REFERENCES correo_config(id),
  zone_name       varchar(80) NOT NULL,   -- 'CABA', 'GBA', 'Interior'
  state_codes     text[] NOT NULL,        -- ['C'] | ['B'] | ['K','H','U',...]
  delivery_type   varchar(20) NOT NULL,   -- 'homeDelivery' | 'agency' | 'locker'
  display_label   varchar(100) NOT NULL,  -- 'A domicilio 72 hs', 'Retiro en sucursal'
  price           numeric(12,2) NOT NULL,
  active          bool NOT NULL DEFAULT true
);

-- Tarifas iniciales de ejemplo (ajustar antes de activar)
-- INSERT INTO shipping_rates (...) VALUES
--   (1, 'CABA',     '{C}',          'homeDelivery', 'A domicilio 72 hs', 8200.00),
--   (1, 'CABA',     '{C}',          'agency',       'Retiro en sucursal 72 hs', 6900.00),
--   (1, 'GBA',      '{B}',          'homeDelivery', 'A domicilio 72 hs', 9500.00),
--   (1, 'Interior', '{K,H,U,...}',  'homeDelivery', 'A domicilio', 0.00);  -- 0 = consultar
```

### 3.6 Pedidos online

```sql
-- migration: 20260821_online_orders.sql
CREATE TABLE IF NOT EXISTS online_orders (
  id                  serial4 PRIMARY KEY,
  business_id         int4 NOT NULL DEFAULT 1,
  -- comprador
  customer_id         int4 REFERENCES customers(id) ON DELETE SET NULL,
  buyer_name          varchar(150) NOT NULL,
  buyer_phone         varchar(30)  NOT NULL,
  buyer_email         varchar(150),
  -- entrega
  delivery_type       varchar(20) NOT NULL,
  -- 'pickup_store' | 'homeDelivery' | 'agency' | 'locker'
  shipping_address_id int4 REFERENCES shipping_addresses(id) ON DELETE SET NULL,
  agency_id           varchar(20),          -- si delivery_type = 'agency'/'locker'
  shipping_rate_id    int4 REFERENCES shipping_rates(id) ON DELETE SET NULL,
  -- totales
  subtotal            numeric(12,2) NOT NULL,
  shipping_cost       numeric(12,2) NOT NULL DEFAULT 0,
  total               numeric(12,2) NOT NULL,
  -- estado
  status              varchar(30) NOT NULL DEFAULT 'pending',
  -- 'pending' | 'confirmed' | 'preparing' | 'shipped' | 'delivered' | 'cancelled'
  -- venta POS generada cuando admin confirma (NULL hasta entonces)
  sale_id             int4 REFERENCES sales(id) ON DELETE SET NULL,
  notes               text,
  created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_online_orders_business_status
  ON online_orders(business_id, status);

CREATE TABLE IF NOT EXISTS online_order_items (
  id                  serial4 PRIMARY KEY,
  online_order_id     int4 NOT NULL REFERENCES online_orders(id) ON DELETE CASCADE,
  product_variant_id  int4 NOT NULL REFERENCES product_variants(id),
  unit_price          numeric(12,2) NOT NULL,
  -- snapshots (el nombre/sku puede cambiar en el futuro, el precio al momento de compra)
  product_name        varchar(150) NOT NULL,
  variant_sku         varchar(100) NOT NULL,
  variant_color       varchar(50) NOT NULL,
  variant_size        varchar(50) NOT NULL
);
```

### 3.7 Envíos (1 por pedido confirmado)

```sql
-- migration: 20260821_shipments.sql
CREATE TABLE IF NOT EXISTS shipments (
  id                  serial4 PRIMARY KEY,
  online_order_id     int4 NOT NULL REFERENCES online_orders(id),
  business_id         int4 NOT NULL DEFAULT 1,
  correo_config_id    int4 REFERENCES correo_config(id),
  environment         varchar(4) NOT NULL DEFAULT 'test',
  delivery_type       varchar(20) NOT NULL,
  agency_id           varchar(20),
  shipping_address_id int4 REFERENCES shipping_addresses(id),
  tracking_number     varchar(30) UNIQUE,
  -- dimensiones consolidadas del bulto (calculadas al confirmar)
  weight_grams        int4 NOT NULL,
  height_cm           numeric(6,2) NOT NULL,
  width_cm            numeric(6,2) NOT NULL,
  depth_cm            numeric(6,2) NOT NULL,
  declared_value      numeric(12,2) NOT NULL,
  -- estado y errores
  status              varchar(30) NOT NULL DEFAULT 'created',
  -- 'created' | 'cancelled' | 'error' | 'in_transit' | 'delivered'
  last_tracking_event jsonb,
  error_detail        text,       -- si PAQ.AR devolvió error, se guarda aquí sin romper el flujo
  created_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### 3.8 Settings globales a agregar (dimensiones por defecto)

```sql
-- migration: 20260821_shipping_settings.sql
INSERT INTO settings (key, value, business_id) VALUES
  ('shipping_default_weight_grams', '500',  1),
  ('shipping_default_height_cm',    '5',    1),
  ('shipping_default_width_cm',     '30',   1),
  ('shipping_default_depth_cm',     '20',   1)
ON CONFLICT (key, business_id) DO NOTHING;
```

---

## 4. Módulo server-only PAQ.AR

**Ubicación:** `lib/correo/correoArgentino.ts`

Lee `agreement` de la tabla `correo_config` y `api_key` de `process.env.CORREO_ARGENTINO_API_KEY`.

```typescript
// Interfaz del módulo
export async function validateAuth(): Promise<boolean>
export async function getAgencies(province?: string): Promise<Agency[]>
export async function createOrder(payload: PaqarOrderPayload): Promise<{ trackingNumber: string }>
export async function getLabel(trackingNumber: string, sellerId: string): Promise<string>  // base64 PDF
export async function getTracking(trackingNumber: string): Promise<TrackingEvent[]>
export async function cancelOrder(trackingNumber: string): Promise<void>
```

**Variables de entorno:**
```
CORREO_ARGENTINO_API_KEY=     # api key del carrier (sensible, solo .env)
CORREO_ARGENTINO_ENV=test     # test | prod (puede redundar con DB, pero sirve de override)
```

**URLs base:**
```
test: https://apitest.correoargentino.com.ar/paqar/v1/
prod: https://api.correoargentino.com.ar/paqar/v1/
```

**Headers en cada request:**
```
Authorization: Apikey <CORREO_ARGENTINO_API_KEY>
agreement: <correo_config.agreement>
Content-Type: application/json
```

---

## 5. Rutas Next.js (`app/api/**`)

```
# Catálogo (ya existe)
GET    /api/catalog                      -- productos públicos (ya implementado)
GET    /api/catalog/suggestions          -- sugerencias (ya implementado)

# Checkout (público — sin auth)
POST   /api/checkout                     -- valida stock, crea online_order + customer si new
                                         -- responde: { orderId, total, waLink }

# Envíos — información pública
GET    /api/shipping/rates?state=C       -- tarifas activas para una provincia
GET    /api/shipping/agencies?province=C -- proxy GET /v1/agencies, filtrado por provincia

# Admin — pedidos online (requiere auth interna)
GET    /api/orders/online                -- listado paginado, filtrable por status
GET    /api/orders/online/count-pending  -- número de pedidos en 'pending' (para badge nav)
GET    /api/orders/online/:id            -- detalle del pedido con items
PATCH  /api/orders/online/:id/confirm    -- admin confirma: crea sale, descuenta stock,
                                         -- llama PAQ.AR si delivery != pickup_store
PATCH  /api/orders/online/:id/cancel     -- cancela pedido (y shipment si existía)
GET    /api/orders/online/:id/label      -- proxy POST /v1/labels → devuelve PDF
GET    /api/orders/online/:id/tracking   -- proxy GET /v1/tracking
```

**No existe** `POST /api/cart` — el carrito es client-side en `localStorage`.

---

## 6. Flujo completo del carrito

### 6.1 Carrito (client-side, `localStorage`)

- Clave: `roipos_cart`
- Estructura:
```typescript
interface CartItem {
  productId:        number
  variantId:        number
  productName:      string
  variantSku:       string
  color:            string
  size:             string
  specificImageUrl: string | null
  price:            number
  cuotas:           number
}
type Cart = CartItem[]
```
- Acciones: agregar, quitar, vaciar. Si el variantId ya existe en el carrito, no se puede agregar de nuevo (stock serializado: 1 unidad física).
- El botón "Ver carrito" abre un drawer lateral con los items y el total.

### 6.2 Checkout (`/tienda/checkout`)

Página con tres secciones:

**A. Datos del comprador**
- Nombre completo (requerido)
- Teléfono con código de país — ej. `5491112345678` (requerido)
- Email (opcional)

**B. Tipo de entrega**
- `pickup_store`: Retiro en la tienda (gratis, sin más campos)
- `homeDelivery`: Envío a domicilio → pedir dirección completa + selector de provincia PAQ.AR
- `agency`: Retiro en sucursal de Correo Argentino → elegir sucursal vía GET /api/shipping/agencies

Si el tipo de entrega es `homeDelivery` o `agency`, mostrar las tarifas activas para esa zona (GET /api/shipping/rates?state=X). El usuario elige la tarifa → se suma al total.

**C. Resumen y confirmación**
- Items del carrito con imágenes, color, talle, precio
- Subtotal / Costo de envío / Total
- Botón "Confirmar pedido"

### 6.3 POST /api/checkout (backend)

```typescript
// Body del request
{
  items: { variantId: number; unitPrice: number; productName: string;
           variantSku: string; color: string; size: string }[]
  buyerName:    string
  buyerPhone:   string
  buyerEmail?:  string
  deliveryType: 'pickup_store' | 'homeDelivery' | 'agency' | 'locker'
  shippingRateId?:  number          // si deliveryType != pickup_store
  agencyId?:        string          // si deliveryType = 'agency'/'locker'
  address?: {                       // si deliveryType = 'homeDelivery'
    streetName: string; streetNumber: string; floor?: string; department?: string
    cityName: string; state: string; zipCode: string; observation?: string
  }
}
```

**Lógica del endpoint:**
1. Verificar que todos los `variantId` existen en `branch_inventory` (stock disponible).  
   Si alguno no existe → responder `422` con la lista de items sin stock.
2. Buscar o crear `customer` por `(buyerPhone, business_id)`.
3. Si `deliveryType = homeDelivery`, crear `shipping_addresses`.
4. Calcular `subtotal` (sum de precios) + `shipping_cost` (de `shipping_rates`).
5. Crear `online_order` + `online_order_items` en una transacción.
6. Armar el `waLink` de confirmación al comprador.
7. Responder `{ orderId, total, waLink }`.

⚠️ **NO se descuenta stock aquí.** El stock se descuenta cuando el admin confirma (`PATCH /confirm`).

### 6.4 PATCH /api/orders/online/:id/confirm (admin)

1. Verificar stock nuevamente (puede haber pasado tiempo).
2. Abrir transacción:
   - Crear `sales` + `sale_details` (descuenta stock: DELETE de `branch_inventory`).
   - Actualizar `online_orders.status = 'confirmed'` y `sale_id`.
3. Si `deliveryType != 'pickup_store'`:
   - Calcular dimensiones del bulto (cascada producto → categoría → settings).
   - Llamar `lib/correo/correoArgentino.ts → createOrder()`.
   - Si OK: crear `shipments` con `trackingNumber`.
   - Si error PAQ.AR: crear `shipments` con `status = 'error'` y `error_detail`. **No hacer rollback de la venta.** El envío se puede reintentar.
4. Responder con el resultado (incluye `trackingNumber` si aplica).

---

## 7. Interfaz admin — "Pedidos Online"

### Nav badge
`components/nav.tsx` ya tiene el patrón de links con íconos. Agregar:
- Ítem "Pedidos" con ícono `ShoppingCart` de Lucide, href `/pedidos`
- El badge (número rojo) se nutre de `GET /api/orders/online/count-pending`
- Se refresca cada 60 segundos (polling simple, sin WebSocket por ahora)

### Página `/pedidos` (admin)

**Listado con filtros:**
- Tabs por estado: Todos / Pendientes / Confirmados / Despachados / Cancelados
- Columnas: Fecha | Comprador | Items | Total | Entrega | Estado | Acciones
- Acciones por fila:
  - **Confirmar** (si `pending`) → abre modal con resumen, botón confirmar
  - **Imprimir rótulo** (si `shipments.tracking_number` existe) → GET /label → abre PDF
  - **Ver tracking** (si `tracking_number`) → modal con historial de eventos
  - **Cancelar** (si `pending` o `confirmed`)

### Modal de confirmación (admin)
- Muestra items + datos del comprador + tipo de entrega + dirección
- Si algún item perdió stock, lo muestra con advertencia
- Botón "Confirmar y generar envío"

---

## 8. Reglas duras de PAQ.AR v1 (ya verificadas en el manual)

- Base URL test: `https://apitest.correoargentino.com.ar/paqar/v1/`
- Base URL prod: `https://api.correoargentino.com.ar/paqar/v1/`
- Auth: headers `Authorization: Apikey <Key>` + `agreement: <código>` en CADA request.
- Validación: `GET /v1/auth` → 204 = credenciales válidas.
- `POST /v1/orders`: **solo el primer elemento de `parcels[]` se procesa** — consolidar TODO el pedido en un solo bulto (suma de pesos, máximo de dimensiones).
- `deliveryType`: solo `homeDelivery` | `agency` | `locker`.
- Si `deliveryType != homeDelivery`: obligatorio `agencyId` (de `GET /v1/agencies`).
- Provincia (`state`): código de 1 letra del sistema PAQ.AR (ver tabla en sección 3.3), **NO** ISO 3166-2.
- `POST /v1/labels`: array de `{sellerId, trackingNumber}` → PDF en base64. No persistir en DB.
- `PATCH /v1/orders/{tn}/cancel`: solo si no fue impuesto.
- `GET /v1/tracking`: historial por `trackingNumber`.
- `GET /v1/agencies`: filtrable por `province` y flags de recepción/entrega.
- **No hay endpoint de cotización de tarifas** en PAQ.AR v1 → usar `shipping_rates` (sección 3.5).

---

## 9. Criterios de aceptación

1. **Carrito**: un cliente puede agregar productos desde la tienda, ver el carrito en un drawer con items, colores, talles, subtotal y cuotas. El mismo variantId no se puede agregar dos veces.

2. **Checkout — retiro en tienda**: el cliente completa nombre + teléfono y confirma. Se crea `online_order` con `delivery_type = 'pickup_store'`.

3. **Checkout — envío a domicilio**: el cliente ingresa la dirección con código de provincia PAQ.AR, elige una tarifa de envío (de la tabla `shipping_rates`), y el costo se suma al total.

4. **Checkout — retiro en sucursal CA**: el cliente ve las sucursales disponibles (vía `GET /v1/agencies` contra ambiente test) y elige una.

5. **Validación de stock**: si al confirmar algún variantId ya no tiene stock, la respuesta indica cuál item no está disponible.

6. **Confirmación**: se genera un link de WhatsApp con el resumen del pedido y se muestra al cliente.

7. **Admin — badge**: el nav muestra el número de pedidos en `pending`, se actualiza cada 60 segundos.

8. **Admin — confirmar pedido**: el admin confirma → se descuenta stock (crea `sales` + `sale_details`) → si hay envío: se llama a PAQ.AR (ambiente test) y se guarda `trackingNumber`. Si PAQ.AR falla, la venta queda confirmada igual y el envío queda con `status = 'error'` reintentable.

9. **Admin — rótulo**: el admin puede descargar el PDF del rótulo en cualquier momento (fetch on-demand a PAQ.AR). No se guarda en DB.

10. **Admin — tracking**: el admin puede ver el historial de eventos del envío.

11. **Admin — cancelar envío**: el admin puede cancelar si el envío no fue impuesto.

12. **Todo se prueba en ambiente `test` de PAQ.AR con vars de entorno vacías/dummy** — no se requieren credenciales reales para completar el flujo hasta el punto de llamada a la API (los errores de auth se tratan como `status = 'error'` en `shipments`).

---

## 10. Orden de implementación sugerido

1. **Migraciones SQL** (secciones 3.1 → 3.8)
2. **`lib/correo/correoArgentino.ts`** — módulo con las 6 funciones, sin lógica de negocio
3. **`app/api/shipping/rates`** y **`app/api/shipping/agencies`** — endpoints públicos
4. **Carrito en tienda** — drawer con `localStorage` + botón "Ir al checkout"
5. **`/tienda/checkout`** — formulario completo, 3 pasos
6. **`app/api/checkout`** — POST con validación de stock y creación de pedido
7. **`app/api/orders/online/**`** — listado, detalle, confirmar, cancelar, label, tracking
8. **`/pedidos`** — página admin con listado, tabs, modales
9. **Badge en nav** — count-pending + polling
10. **Admin de dimensiones** — agregar campos en el dialog de edición de productos y categorías

---

*Próxima iteración: MercadoPago como método de pago en el checkout.*
