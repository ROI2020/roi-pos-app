# Prompt: Carrito + Checkout + Envíos (Correo Argentino / MiCorreo PAQ.AR) — ROIPOS

> Pegar este documento completo como prompt inicial en la sesión de código (Claude Code / Cursor / etc.). Contiene contexto de stack, schema real, alcance y decisiones abiertas.

---

## 1. Contexto del proyecto

**ROIPOS** es un sistema de punto de venta (POS) para un negocio de indumentaria, ya funcionando para venta presencial. Ahora se va a construir la **tienda online**: carrito de compras + checkout, y ahí se integra el envío a domicilio/sucursal vía **Correo Argentino (MiCorreo / API PAQ.AR)**.

**Stack:**
- Next.js 15.5, App Router. Las API routes (`app/api/**`) son el backend.
- Runtime: Node.js.
- Base de datos: PostgreSQL 18 (instalación nativa en Windows, servicio `postgresql-x64-18`).
- Cliente SQL: `node-postgres` (`pg`), **sin ORM**. Queries raw SQL vía `pool.query()`.
- `lib/db.ts` expone el pool de conexiones compartido por todas las routes.
- Todo el código en TypeScript, incluidas las routes.
- No hay capa de repositorios: SQL directo en cada route.
- Ya existe un patrón de integración con un servicio externo (AFIP/ARCA vía WSAA — ver tablas `wsaa_tokens` y `facturacion_config`) que sirve de referencia de cómo este proyecto maneja credenciales y tokens de terceros: una tabla dedicada, con `ambiente` (`homo`/`prod`), y no hardcodeo de secretos.

**Volumen actual de envíos: cero.** Recién arranca. Se prioriza que la integración no genere fricción ni sorpresas de costos — por eso se eligió **Correo Argentino** (vía MiCorreo, tarifas de lista, sin acuerdo comercial previo) en vez de un agregador tipo Envia.com.

**Credenciales de MiCorreo/PAQ.AR: todavía no las tenemos.** Hay que dejar todo preparado con variables de entorno y apuntando al ambiente de **test** (`https://apitest.correoargentino.com.ar/paqar/v1/`), listo para swap a producción cuando lleguen.

---

## 2. Objetivo de esta iteración

Construir el flujo de **carrito → checkout → confirmación de pedido**, incluyendo la opción de envío por Correo Argentino. Es la primera versión — el objetivo es que funcione end-to-end de forma simple, no cubrir todos los edge cases de un ecommerce grande.

### Dentro de alcance
- Carrito de compras (agregar/quitar producto+talle+color, ver totales).
- Checkout: datos del comprador, elección de tipo de entrega (retiro en sucursal propia / envío a domicilio por Correo Argentino / retiro en sucursal de Correo Argentino).
- Al confirmar el pedido, generar la orden en PAQ.AR (`POST /v1/orders`) y guardar el `trackingNumber` devuelto.
- Descargar y guardar el rótulo (`POST /v1/labels`) para que el negocio lo imprima.
- Pantalla/endpoint admin para consultar el estado del envío (`GET /v1/tracking`).
- Listado de sucursales de Correo Argentino habilitadas (`GET /v1/agencies`) para que el comprador elija dónde retirar, si aplica.
- Poder cancelar un envío antes de que sea despachado (`PATCH /v1/orders/{tn}/cancel`).

### Fuera de alcance (por ahora)
- **Cotización dinámica del costo de envío en el checkout.** El manual oficial de la API PAQ.AR v2 que tenemos **no documenta un endpoint de tarifas**. Antes de prometerle al comprador un precio de envío en tiempo real, hay que confirmar con el área comercial de Correo Argentino si existe ese endpoint para cuentas MiCorreo, o si hay que trabajar con una tabla de tarifas propia/fija por zona mientras tanto. **No asumir que existe — confirmarlo primero.**
- Pagos online (Mercado Pago, etc.) — se asume que se resuelve en otra iteración o que por ahora el pago se coordina aparte.
- Envío internacional.
- Multi-bulto real (la API solo soporta 1 parcel por orden — ver sección 4).

---

## 3. Schema actual relevante (Postgres, al 2026-08-07)

```sql
-- Productos e inventario (inventario SERIALIZADO: cada variante = 1 unidad física)
CREATE TABLE products (
  id serial4 PRIMARY KEY,
  category_id int4, name varchar(150) NOT NULL, description text,
  base_price numeric(12,2) NOT NULL DEFAULT 0,
  general_image_url text, photo_url text,
  age_group_id int4, season_id int4, gender_id int4,
  exportable_web bool NOT NULL DEFAULT false,   -- <- flag existente para "visible en tienda"
  business_id int4 NOT NULL DEFAULT 1
);

CREATE TABLE product_variants (
  id serial4 PRIMARY KEY,
  product_id int4 REFERENCES products(id),
  sku varchar(100) UNIQUE NOT NULL,
  color varchar(50) NOT NULL,
  size varchar(50) NOT NULL,
  barcode varchar(100) UNIQUE,
  specific_image_url text,
  purchase_detail_id int4 REFERENCES purchase_details(id)
  -- NO tiene peso ni dimensiones. Falta agregarlo (ver sección 5).
);

CREATE TABLE branch_inventory (
  id serial4 PRIMARY KEY,
  product_variant_id int4 REFERENCES product_variants(id) ON DELETE CASCADE,
  branch_id int4 REFERENCES branches(id) ON DELETE CASCADE,
  UNIQUE (product_variant_id, branch_id)
  -- una variante "existe" en una sucursal hasta que se vende (ver v_stock_disponible)
);

-- Clientes (creado 2026-08-06 para módulo de ruleta/promos)
CREATE TABLE customers (
  id serial4 PRIMARY KEY,
  business_id int4 NOT NULL DEFAULT 1,
  name varchar(150) NOT NULL,
  phone varchar(30) NOT NULL,          -- identificador único con código país
  consent_policies bool NOT NULL DEFAULT false,
  consent_news bool NOT NULL DEFAULT false,
  consent_images bool NOT NULL DEFAULT false,
  verified bool NOT NULL DEFAULT false,
  UNIQUE (phone, business_id)
  -- NO tiene dirección postal. Falta para envíos (ver sección 5).
);

-- Ventas (hoy pensada 100% para POS presencial)
CREATE TABLE sales (
  id serial4 PRIMARY KEY,
  branch_id int4 NOT NULL REFERENCES branches(id),   -- NOT NULL: problema para venta online, ver sección 6
  pos_session_id int4 REFERENCES pos_sessions(id),    -- nullable
  customer_id int4 REFERENCES customers(id),          -- nullable (agregado 2026-08-06)
  subtotal numeric(12,2) NOT NULL,
  discount_amount numeric(12,2) NOT NULL DEFAULT 0,
  total_amount numeric(12,2) NOT NULL,
  payment_method varchar(30) NOT NULL,
  arca_cae varchar(50), arca_vto_cae date,             -- ya facturan vía ARCA/AFIP
  business_id int4 NOT NULL DEFAULT 1
);

CREATE TABLE sale_details (
  id serial4 PRIMARY KEY,
  sale_id int4 NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_variant_id int4 NOT NULL REFERENCES product_variants(id),
  unit_price numeric(12,2) NOT NULL,
  UNIQUE (product_variant_id)   -- una variante solo se puede vender UNA vez (inventario serializado)
);

-- Config genérica ya usada en el proyecto (patrón útil para guardar credenciales)
CREATE TABLE settings (
  id serial4 PRIMARY KEY,
  key varchar(100) NOT NULL,
  value text,
  business_id int4 NOT NULL DEFAULT 1,
  UNIQUE (key, business_id)
);
```

---

## 4. Reglas duras de la API PAQ.AR v2 (ya confirmadas en el manual oficial)

- Base URL test: `https://apitest.correoargentino.com.ar/paqar/v1/`
- Base URL prod: `https://api.correoargentino.com.ar/paqar/v1/`
- Auth: headers `Authorization: Apikey <Key>` + `agreement: <código>` en cada request. Validar con `GET /v1/auth` (204 = ok).
- `POST /v1/orders`: alta de orden. **Solo toma el primer elemento del array `parcels`, ignora el resto** — hay que consolidar el carrito en un solo bulto (peso total en gramos, una caja con alto/ancho/largo en cm, máx 3 dígitos cada uno).
- `deliveryType` acepta solo: `homeDelivery` | `agency` | `locker`. Si no es `homeDelivery`, hace falta `agencyId` (sacado de `GET /v1/agencies`).
- Provincia (`state`) va en código de 1 letra (tabla en el manual: `C` = CABA, `B` = Buenos Aires, `X` = Córdoba, etc. — **distinto** de los códigos ISO 3166-2 y distinto de los que usa Shopify/otros).
- `POST /v1/labels`: devuelve el rótulo en PDF codificado base64, acepta un array de `{sellerId, trackingNumber}` (para pedir varios de una).
- `PATCH /v1/orders/{trackingNumber}/cancel`: cancela, solo si no fue impuesta todavía.
- `GET /v1/tracking`: historial de eventos por `trackingNumber`.
- `GET /v1/agencies`: sucursales habilitadas, filtrable por provincia y por si reciben/entregan mercadería.
- No hay endpoint de cotización documentado en este manual — ver "Fuera de alcance" arriba.

---

## 5. Cambios de esquema propuestos (BORRADOR — revisar antes de ejecutar)

```sql
-- 5.1 Peso y dimensiones a nivel PRODUCTO (no por variante — normalmente
--     todas las variantes de un mismo producto pesan/miden igual; si no es
--     así en tu catálogo, mover estos campos a product_variants).
ALTER TABLE products
  ADD COLUMN weight_grams int4 NULL,
  ADD COLUMN height_cm numeric(6,2) NULL,
  ADD COLUMN width_cm numeric(6,2) NULL,
  ADD COLUMN depth_cm numeric(6,2) NULL;

-- 5.2 Dirección de envío. Se guarda por pedido (no atada 1:1 a customers,
--     porque en ecommerce de Argentina es común el checkout como invitado
--     y que la dirección cambie de compra en compra).
CREATE TABLE shipping_addresses (
  id serial4 PRIMARY KEY,
  customer_id int4 REFERENCES customers(id) ON DELETE SET NULL,
  street_name varchar(150) NOT NULL,
  street_number varchar(20) NOT NULL,
  floor varchar(20), department varchar(20),
  city_name varchar(100) NOT NULL,
  state varchar(1) NOT NULL,           -- código de provincia PAQ.AR (1 letra)
  zip_code varchar(12) NOT NULL,
  observation text,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5.3 Envíos: 1 fila por orden despachada por Correo Argentino
CREATE TABLE shipments (
  id serial4 PRIMARY KEY,
  sale_id int4 NOT NULL REFERENCES sales(id),   -- o order_id, ver sección 6
  business_id int4 NOT NULL DEFAULT 1,
  carrier varchar(30) NOT NULL DEFAULT 'correo_argentino',
  environment varchar(4) NOT NULL DEFAULT 'test',  -- 'test' | 'prod'
  delivery_type varchar(20) NOT NULL,      -- 'homeDelivery' | 'agency' | 'locker'
  agency_id varchar(20),                   -- si delivery_type != homeDelivery
  shipping_address_id int4 REFERENCES shipping_addresses(id),
  tracking_number varchar(30) UNIQUE,
  weight_grams int4 NOT NULL,
  height_cm numeric(6,2) NOT NULL,
  width_cm numeric(6,2) NOT NULL,
  depth_cm numeric(6,2) NOT NULL,
  declared_value numeric(12,2) NOT NULL,
  status varchar(30) NOT NULL DEFAULT 'created',  -- created | cancelled | error | delivered...
  label_pdf_base64 text,                   -- o mejor: guardar en disco/S3 y solo el path
  last_tracking_event jsonb,
  error_detail text,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 5.4 Credenciales PAQ.AR (siguiendo el patrón de facturacion_config/wsaa_tokens)
CREATE TABLE correo_argentino_config (
  id serial4 PRIMARY KEY,
  business_id int4 NOT NULL REFERENCES business(id),
  agreement varchar(20) NOT NULL,
  api_key text NOT NULL,          -- considerar encriptar en reposo
  environment varchar(4) NOT NULL DEFAULT 'test',  -- 'test' | 'prod'
  active bool NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

---

## 6. Decisión abierta — CONFIRMAR CON EL USUARIO ANTES DE CODIFICAR

`sales` hoy requiere `branch_id NOT NULL` y está pensada para venta presencial (POS). Para el checkout online hay dos caminos, cada uno con trade-offs — **el agente de código debe preguntar cuál preferís antes de migrar nada**, no decidir solo:

**Opción A — Reusar `sales`/`sale_details`.**
Agregar `channel varchar(10) DEFAULT 'pos'` (`'pos' | 'online'`) a `sales`, hacer `branch_id` nullable u obligar a asignar una "sucursal virtual online". Pro: reutiliza toda la lógica de facturación ARCA y descuento de stock que ya existe. Contra: hay que revisar todo el código que asume `branch_id`/`pos_session_id` presentes.

**Opción B — Tabla `orders`/`order_details` nueva, separada del POS.**
Se crea una `sales` recién cuando el pedido pasa a "pagado/confirmado" (o se linkea 1:1). Pro: no toca nada del POS existente, más limpio conceptualmente (un pedido online tiene estados: pendiente, pagado, preparando envío, despachado — que no aplican a una venta de mostrador). Contra: duplica algo de lógica (stock, ARCA) que hay que adaptar para invocarse también desde acá.

Mi recomendación inicial es la **Opción B**, porque el ciclo de vida de un pedido online (carrito abandonado, pago pendiente, envío en curso) es genuinamente distinto al de una venta de mostrador que se cierra en el momento — pero confirmá con el dueño del proyecto antes de tocar el schema de `sales`.

---

## 7. Rutas Next.js sugeridas (`app/api/**`)

```
POST   /api/cart                      -- crear/actualizar carrito (o manejarlo client-side, a definir)
POST   /api/checkout                  -- crear pedido + dirección + calcular total
POST   /api/checkout/shipping-quote   -- SOLO si se confirma que existe endpoint de tarifas (ver sección 2)
GET    /api/shipping/agencies         -- proxy a GET /v1/agencies (filtrado por provincia/CP)
POST   /api/orders/:id/confirm        -- confirma el pedido → llama POST /v1/orders de PAQ.AR, guarda shipment
GET    /api/orders/:id/label          -- proxy a POST /v1/labels, devuelve el PDF
GET    /api/orders/:id/tracking       -- proxy a GET /v1/tracking
POST   /api/orders/:id/cancel-shipment -- proxy a PATCH /v1/orders/{tn}/cancel
```

Todas las llamadas a PAQ.AR deben vivir en un módulo server-only (ej. `lib/correoArgentino.ts`) que lea `agreement`/`apiKey`/`environment` desde `correo_argentino_config` (o variables de entorno como fallback mientras no hay credenciales reales), nunca desde el cliente.

---

## 8. Variables de entorno a dejar preparadas

```
CORREO_ARGENTINO_AGREEMENT=
CORREO_ARGENTINO_API_KEY=
CORREO_ARGENTINO_ENV=test   # test | prod
```

---

## 9. Criterios de aceptación de esta iteración

1. Se puede armar un carrito con productos con talle/color y ver el total.
2. En el checkout, si el comprador elige envío a domicilio, se piden y validan los campos obligatorios de `shipping_addresses` (incluyendo el código de provincia correcto de PAQ.AR, no ISO).
3. Si elige retiro en sucursal, se puede listar y elegir una sucursal real vía `GET /v1/agencies` (contra el ambiente de test).
4. Al confirmar, se crea una fila en `shipments` con el `trackingNumber` devuelto por PAQ.AR (o el error, si falló, guardado en `error_detail` — nunca debe romper la confirmación del pedido en sí, el fallo de envío se debe poder reintentar aparte).
5. Se puede descargar el rótulo en PDF desde el admin.
6. Se puede consultar el estado de tracking desde el admin.
7. Todo se prueba contra el ambiente `test` de PAQ.AR con credenciales dummy/env vars — no se asume que ya existen credenciales reales.
