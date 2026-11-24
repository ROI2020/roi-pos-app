# Integración ROIPOS ↔ Mercado Libre

**Estado:** Pendiente — planificado para etapa futura  
**Fecha de spec:** Agosto 2026  
**Prerequisito:** Tener funcionando las integraciones de Meta/Google/Pinterest (feed XML) ✅

---

## Contexto

Las integraciones con Meta (WhatsApp/Instagram/Facebook), Google Merchant Center y Pinterest
se resolvieron mediante un **feed XML** unidireccional que cada plataforma lee periódicamente.

Mercado Libre requiere un enfoque completamente distinto: **API bidireccional en tiempo real**.
No hay feed XML — todo se gestiona via API REST y webhooks.

---

## Diferencia arquitectural

```
Meta / Google / Pinterest
  ROIPOS ──[feed XML, pull]──► plataforma
  (sin recepción de pedidos automática)

Mercado Libre
  ROIPOS ──[API REST, push]──► ML  (stock, precios, nuevos productos)
  ROIPOS ◄──[Webhook, push]── ML  (pedidos confirmados)
```

---

## Decisiones comerciales previas al desarrollo

Antes de escribir una línea de código, el equipo de negocio debe decidir:

### Tipo de publicación
| Tipo | Comisión | Visibilidad | Envío gratis obligatorio |
|---|---|---|---|
| Gratuita | 0% | Muy baja | No |
| Clásica | ~8% + cargo fijo | Media | No |
| Premium | ~12–15% + cargo fijo | Alta | Sí (ML Envíos) |

> Para indumentaria se recomienda **Clásica** para arrancar y evaluar conversión antes de pasar a Premium.

### ML Envíos
La mayoría de los compradores filtra por "envío gratis". Sin ML Envíos activo la visibilidad
es muy baja. Se recomienda activarlo desde el inicio.

### Penalizaciones por stock
Si ML genera un pedido de un producto sin stock real → penalización en reputación de vendedor.
La sincronización de stock debe ser **inmediata** — no como el feed de 1-24h de Meta/Google.

---

## Pasos manuales en ML (sin código, hacer primero)

1. Crear cuenta vendedor en mercadolibre.com.ar y verificar identidad (DNI/CUIT)
2. Mercado Pago queda vinculado automáticamente
3. Configurar opciones de envío (activar ML Envíos recomendado)
4. Ir a [developers.mercadolibre.com.ar](https://developers.mercadolibre.com.ar)
5. Crear una aplicación → obtener `App ID` y `Secret Key`
6. Guardar esas credenciales como variables de entorno en Netlify:
   ```
   ML_APP_ID=...
   ML_APP_SECRET=...
   ```

---

## Cambios técnicos necesarios en ROIPOS

### 1. Autenticación OAuth 2.0

ML usa tokens de corta duración:
- `access_token`: vence cada **6 horas**
- `refresh_token`: vence cada **~6 meses**

Se necesita un mecanismo de refresh automático. Propuesta: guardar los tokens en `settings`
y refrescarlos en background antes de cada llamada a la API.

```
ml_access_token   → settings table
ml_refresh_token  → settings table
ml_token_expires  → settings table (timestamp)
ml_user_id        → settings table (obtenido en el OAuth inicial)
```

**Flujo OAuth inicial** (una sola vez, manual):
```
1. Admin abre /api/ml/auth/start
2. Redirige a ML → admin autoriza la app
3. ML redirige a /api/ml/auth/callback con ?code=XXX
4. ROIPOS intercambia el code por access_token + refresh_token
5. Guarda los tokens en settings
```

### 2. Nueva tabla en la base de datos

```sql
CREATE TABLE ml_items (
  id                  SERIAL PRIMARY KEY,
  product_id          INTEGER REFERENCES products(id),
  product_variant_id  INTEGER REFERENCES product_variants(id),
  ml_item_id          VARCHAR(20),      -- ej: MLA1234567890
  ml_variation_id     BIGINT,           -- ID de variante específica en ML
  ml_status           VARCHAR(20),      -- active | paused | closed
  synced_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX ON ml_items (product_variant_id);
CREATE INDEX ON ml_items (ml_item_id);
```

### 3. Servicio de sincronización ROIPOS → ML

Archivo sugerido: `lib/ml-service.ts`

**Responsabilidades:**

#### a) Upload de imágenes
ML no acepta URLs externas — requiere subir la imagen a su CDN primero.
```
POST https://api.mercadolibre.com/pictures
→ devuelve { id: "123456-MLA..." }
→ ese ID se usa en la publicación
```

#### b) Crear publicación con variantes
Una publicación en ML = un producto de ROIPOS con todas sus variantes (color + talle).

```json
POST /items
{
  "title": "Remera Básica Mujer",
  "category_id": "MLA109027",
  "price": 15000,
  "currency_id": "ARS",
  "available_quantity": 10,
  "buying_mode": "buy_it_now",
  "listing_type_id": "gold_special",
  "condition": "new",
  "pictures": [{ "id": "123456-MLA..." }],
  "attributes": [...],
  "variations": [
    {
      "attribute_combinations": [
        { "id": "COLOR", "value_name": "Negro" },
        { "id": "SIZE", "value_name": "M" }
      ],
      "price": 15000,
      "available_quantity": 3,
      "picture_ids": ["123456-MLA..."]
    }
  ]
}
```

#### c) Actualizar stock en tiempo real
Disparar en cada venta registrada en ROIPOS:
```
PUT /items/{ml_item_id}/variations/{ml_variation_id}
{ "available_quantity": N }
```

Si `available_quantity` llega a 0 → pausar la publicación:
```
PUT /items/{ml_item_id}
{ "status": "paused" }
```

#### d) Reactivar al ingresar stock
Al cargar stock en ROIPOS → reactivar si estaba pausada:
```
PUT /items/{ml_item_id}
{ "status": "active" }
```

### 4. Webhook ML → ROIPOS

**Endpoint a crear:** `POST /api/ml/webhook`

ML envía notificaciones cuando hay eventos en la cuenta:

```typescript
// Responder 200 inmediatamente (ML reintenta si no recibe 200 en < 500ms)
res.status(200).end()

// Procesar de forma asíncrona
if (body.topic === 'orders_v2' && body.resource.startsWith('/orders/')) {
  const orderId = body.resource.split('/orders/')[1]
  const order = await fetchMLOrder(orderId)
  
  if (order.status === 'paid') {
    for (const item of order.order_items) {
      // Buscar variante en ml_items por ml_item_id + ml_variation_id
      // Descontar stock en branch_inventory de ROIPOS
      // Disparar actualización de stock de vuelta a ML
    }
  }
}
```

**Suscribirse a los topics en ML Developers:**
- `orders_v2` → pedidos confirmados
- `questions` → preguntas de compradores (opcional)
- `items` → cambios en publicaciones (opcional)

**Verificación de firma:**
```typescript
const signature = req.headers['x-signature']
// Validar con ML_APP_SECRET antes de procesar
```

### 5. Mapeo de categorías ML

ML usa IDs de categoría propios (no texto libre). Para indumentaria femenina en Argentina:

| Categoría ROIPOS | ID ML | Descripción ML |
|---|---|---|
| Remeras | MLA109027 | Remeras y Musculosas para Mujer |
| Pantalones | MLA109093 | Pantalones y Jeans para Mujer |
| Vestidos | MLA109042 | Vestidos y Monos para Mujer |
| Calzado | MLA1265 | Calzado para Mujer |
| Accesorios | MLA1280 | Accesorios para Mujer |

> Completar y validar con el árbol real de ML antes de publicar:
> `GET /categories/MLA/attributes` para ver atributos requeridos por categoría.

### 6. UI en ROIPOS (nueva sección en Settings o Productos)

- Tab **"Mercado Libre"** en el panel de configuración para el OAuth inicial
- Toggle por producto "Publicar en ML" (similar al toggle de redes sociales)
- Estado de sync en lista de productos: ✅ en ML / ⚠️ error / — no publicado

---

## Variables de entorno a agregar en Netlify

```env
ML_APP_ID=...
ML_APP_SECRET=...
# Los siguientes se guardan en la tabla settings (no son vars de entorno):
# ml_access_token, ml_refresh_token, ml_token_expires, ml_user_id
```

---

## Estimación de esfuerzo

| Tarea | Complejidad | Tiempo estimado |
|---|---|---|
| OAuth flow + refresh automático | Media | 1 día |
| Migración DB (`ml_items`) | Baja | 2 horas |
| Upload de imágenes a ML CDN | Baja | 3 horas |
| Crear publicación con variantes | Alta | 2 días |
| Actualización de stock en ventas | Media | 1 día |
| Webhook ML → ROIPOS | Media | 1 día |
| Mapeo de categorías | Media | 1 día |
| UI (toggle + estado sync) | Baja | 1 día |
| **Total estimado** | | **~2–3 semanas** |

---

## Orden de implementación recomendado

1. Pasos manuales en ML (cuenta, app, credenciales)
2. OAuth flow + guardar tokens
3. Migración DB
4. Crear publicaciones manualmente (1-2 productos de prueba)
5. Webhook de pedidos + descuento de stock
6. Automatizar creación/actualización masiva
7. UI en settings/productos

---

## Referencias

- [ML Developers — Argentina](https://developers.mercadolibre.com.ar)
- [API Reference — Items](https://developers.mercadolibre.com.ar/es_ar/items-y-busquedas)
- [API Reference — Orders](https://developers.mercadolibre.com.ar/es_ar/gestiona-ventas)
- [Webhooks / Notificaciones](https://developers.mercadolibre.com.ar/es_ar/recibir-notificaciones)
- [Categorías de Moda Argentina](https://api.mercadolibre.com/sites/MLA/categories) → buscar `MLA1430` (Ropa y Accesorios)
