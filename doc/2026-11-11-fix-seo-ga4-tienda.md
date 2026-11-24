# Tienda pública — arreglos de GA4 y SEO (11/11/2026)

Revisado por Claude a partir de lo que pasó en Galplace (P145). Caso real: **malema.com.ar** no recibe nada en GA4 y Search Console dice que no encuentra la canónica.
Antes de commitear: `npm run build` limpio. Un commit por punto, con el número (S1…S5) en el mensaje.

## S1 — GA4 nunca se carga en la tienda (urgente)
**Causa:** `app/layout.tsx` inyecta GA4 solo si `isStore && ga4Id`. `x-ga4-id` lo setea `middleware.ts` en el paso 8, pero las rutas `/tienda/*` salen antes, en el paso 2 (y `/store/*` en el paso 1), con solo `x-store-base`. Resultado: en la tienda `ga4Id` siempre es `null` y el script de GA4 no se carga nunca. En el panel sí está el header, pero ahí `isStore` es false.
**Arreglo:** que la tienda obtenga el ID sin depender del paso 8. Opción recomendada: en `app/layout.tsx`, si `isStore`, resolver el negocio con `resolveBusinessFromHost(host)` y leer `catalog_ga4_measurement_id` con `getPublicSettingsByKeys` (igual que `app/tienda/layout.tsx`; no agrega un round-trip HTTP). Alternativa: en los pasos 1 y 2 del middleware llamar a `/api/tenant/resolve` y setear `x-ga4-id` (agrega un fetch por request de la tienda; si se hace, cachearlo).
Validar el ID con `/^G-[A-Z0-9]+$/` antes de interpolarlo en el script.
**Prueba:** en PROD, DevTools › Red › filtrar `collect?v=2`: tienen que salir envíos con `tid=<ID de MALEMA>`; GA4 › Tiempo real muestra el usuario.

## S2 — robots.txt bloquea la home de la tienda
**Causa:** `app/robots.ts` permite `/tienda/` (con barra) y prohíbe `/`. La home es `/tienda` (sin barra: es la URL del sitemap y de la canónica). `/tienda` no coincide con `/tienda/`, así que gana `Disallow: /` → **Google no puede rastrear la home**.
**Arreglo:** `allow: [storePath, \`${storePath}/\`]` (o `allow: storePath`, que como prefijo cubre las dos). Dejar los disallow como están.
**Prueba:** `https://malema.com.ar/robots.txt` y Search Console › Inspección de URL de `https://malema.com.ar/tienda` → "Rastreo permitido: Sí".

## S3 — Canónica heredada: todas las páginas dicen que su canónica es la home
**Causa:** `app/tienda/layout.tsx` pone `alternates.canonical = <base>/tienda`. En Next.js la metadata del layout **se hereda** a las páginas hijas que no la sobreescriben. `p/[slug]` (páginas de `store_pages`) y `devoluciones` no definen `alternates` → declaran como canónica la home → Google las trata como duplicadas de la home y no las indexa. `item/[slug]` sí lo define (OK).
**Arreglo:** `alternates: { canonical: \`${baseUrl}${storePath}/p/${slug}\` }` en `p/[slug]/page.tsx` (y su `openGraph.url`), y lo mismo en `devoluciones`. Revisar si hay otras páginas públicas bajo `/tienda` sin `generateMetadata` propio. La home con filtros (`?q=`, `?cat=`…) puede quedar con la canónica de la home (está bien).
**De paso:** `devoluciones/page.tsx` tiene el título fijo *"Política de devoluciones — MALEMA STORE"*: es multi-negocio, pasarlo a `generateMetadata` con `business_name`.

## S4 — La raíz del dominio redirige con 307 (temporal)
**Causa:** `middleware.ts` paso 4: sin sesión, `/` → `NextResponse.redirect(storePath)`, que por defecto es **307**. Google no transfiere la señal con un temporal y sigue mirando `/` (que no tiene canónica: es una redirección) — probable origen del aviso "no encuentra canónica" si se inspeccionó `malema.com.ar`.
**Arreglo:** `NextResponse.redirect(new URL(storePath, req.url), 308)`. Solo para visitantes sin sesión (como está).

## S5 — Verificar `catalog_base_url` de cada negocio (reemplazado por S7)
La canónica, el sitemap y robots usan `catalog_base_url`. Tiene que ser **exactamente** el dominio que se sirve (para MALEMA: `https://malema.com.ar`, sin `www` si `www` redirige al dominio pelado, sin barra final). Si no coincide, todas las canónicas apuntan a otra URL.
**Acción:** consulta y mostrar el valor; no cambiarlo sin confirmar con ROI.

## S6 — Política de devoluciones como página de la tienda, por negocio y traducida
**Causa:** `app/tienda/devoluciones/page.tsx` tiene todo el contenido escrito a mano, en español y con "MALEMA STORE". En `nularione.com/store/devoluciones` se ve la política de MALEMA en castellano. Ya existe `store_pages` (HTML por negocio, se sirve en `<storePath>/p/<slug>`, entra solo en el sitemap y se edita en Configuración › Páginas).
**Arreglo:**
1. **Script SQL nuevo** en `db/migrations/` (`20261111_store_pages_devoluciones.sql`), idempotente, con `INSERT … ON CONFLICT (business_id, slug) DO NOTHING` (si el negocio ya cargó la página, no pisarla):
   - **MALEMA** (id 1): `slug = 'devoluciones'`, `title = 'Política de devoluciones'`, `content` = el HTML actual de la página pasado a HTML simple (`<h2>`, `<p>`, `<ul>`, `<strong>`; sin clases de Tailwind ni íconos), sin el nombre fijo del negocio.
   - **NULARIONE** (buscar el id por nombre, no adivinarlo): `slug = 'returns'`, `title = 'Return Policy'`, `content` = la **misma política traducida al inglés de EE. UU.**, natural (no literal), mismo HTML simple.
   - **Antes de correrlo en PROD, mostrarle a ROI los dos textos** (sobre todo el inglés: es una política comercial) y esperar el OK.
2. **`app/tienda/devoluciones/page.tsx`:** reemplazar por un redirect **308** a `<storeBase>/p/devoluciones` (locale es) o `<storeBase>/p/returns` (locale en), así no se rompen los links viejos. Esto reemplaza lo de S3 en esa página.
3. **`components/settings-panel.tsx`** › `SUGGESTED_PAGES`: sumar `{ slug: 'returns', title: 'Return Policy' }`.
4. Si algún link de la tienda (footer, checkout, mails) apunta a `/devoluciones`, cambiarlo a la página nueva según el locale. Hoy `grep` no encontró ninguno, pero revisar también los mails y `messages/`.
**Prueba:** `malema.com.ar/tienda/devoluciones` → 308 → `/tienda/p/devoluciones` en castellano, con canónica propia; `nularione.com/store/devoluciones` → `/store/p/returns` en inglés; las dos aparecen en `sitemap.xml` de su dominio.

## S7 — URL base de la tienda desde `business_domains` (dominio principal)
**Contexto (ROI, 11/11):** el dominio de cada negocio ya está en `business_domains` (`is_primary`). Hoy `catalog_base_url` está vacío y todo cae en `https://${host}`, que falla cuando un negocio tiene más de un dominio: el negocio 2 se sirve en `malema3.com.ar` (principal) y en `pauli.roipos.com.ar` (secundario). Entrando por el secundario, la canónica, el sitemap y robots apuntan al secundario → Google ve dos tiendas iguales.
**Arreglo:**
1. Helper único en `lib/` (ej. `getStoreBaseUrl(businessId, host)`): `catalog_base_url` si está cargado (permite forzarlo) → si no, `https://<domain>` del registro `is_primary = true` de ese negocio → si no, `https://${host}`. Sin barra final.
2. Usarlo en **todos** los lugares que hoy calculan la base a mano: `app/tienda/layout.tsx`, `app/tienda/p/[slug]/page.tsx`, `app/tienda/item/[slug]/page.tsx`, `app/tienda/devoluciones/page.tsx` (o el redirect de S6), `app/robots.ts`, `app/sitemap.ts`, `app/api/v1/feeds/[feed]/route.ts`, `lib/email-order.ts`.
3. Con eso **S5 ya no hace falta** (no cargar `catalog_base_url` en ningún negocio; queda como override).
4. **No redirigir** el dominio secundario al principal sin preguntar a ROI (puede usarse a propósito); alcanza con que la canónica apunte al principal.
**Prueba:** `pauli.roipos.com.ar/tienda` → canónica `https://malema3.com.ar/tienda`; `pauli.roipos.com.ar/sitemap.xml` con URLs de `malema3.com.ar`; `malema.com.ar` y `nularione.com` sin cambios.

## S8 — Eventos de e-commerce en GA4 (igual que Galplace P143/P144)
**Contexto:** con S1, GA4 ya se carga en toda la tienda, pero solo registra visitas. No hay ningún `gtag('event', …)` en el código → GA4 no sabe de carritos, checkouts ni ventas. Galplace ya lo tiene (`marketplace-web/lib/pixel.ts`, commits `be3148a` y `782b99f`); copiar el mismo patrón.
**Arreglo:**
1. **`lib/analytics.ts`** (nuevo, solo cliente): `trackViewItem`, `trackAddToCart`, `trackBeginCheckout`, `trackPurchase`. Cada una llama `window.gtag('event', …)`; si `gtag` todavía no existe (se carga `afterInteractive`), **encolar y reintentar cada 300 ms hasta 10 s** (como `callGtag` de Galplace). Nunca definir `window.gtag` desde acá. Si no hay GA4 configurado, no hace nada. `currency` = la del negocio (`useCurrency()` → `ARS` en MALEMA, `USD` en NULARIONE), nunca fija.
2. **Eventos y dónde:**
   - `view_item` — ficha de producto (`item/[slug]`, en el componente cliente que la muestra) **y** `_components/product-modal.tsx` al abrirse. `items: [{ item_id: productId, item_name, item_variant?, price }]`, `value` = precio.
   - `add_to_cart` — en `_context/cart-context.tsx` › `addItem`, **fuera** del updater de `setItems` (en modo estricto el updater corre dos veces y duplicaría el evento). `items` con `item_id` = id de producto (el mismo que en `view_item`), `item_variant` = SKU/color/talle, `price`, `quantity`.
   - `begin_checkout` — al montar `checkout/page.tsx` con el carrito no vacío, una vez por montaje. `value` = total del carrito, `items` del carrito.
   - `purchase` — en `checkout/success/page.tsx`, **antes** de `clearCart()`: `transaction_id` = `orderId`, `value` y `items` tomados del carrito antes de vaciarlo; si el carrito ya está vacío (otro dispositivo, recarga), pedir el total del pedido a la API que use `tracking` y, si no se puede, no disparar. **Una sola vez por pedido:** guardar en `localStorage` (`roipos_purchase_tracked`, últimos 20 números) y no disparar si ya está. No disparar en `pending` ni `failure`.
3. **CSP:** depende del arreglo de `connect-src` de `next.config.mjs` (dominios de Google para GA4); sin eso los eventos se bloquean igual que los `page_view`.
4. Meta Pixel: **no** por ahora (ROI decide si hace campañas).
**Prueba:** GA4 › Administrar › DebugView (o Tiempo real › eventos): recorrer en malema.com.ar ficha → agregar → checkout → compra de prueba y ver `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (con importe y moneda); recargar `checkout/success?orderId=…` → no sale otro `purchase`. Repetir en nularione.com (moneda USD).

## S9 — robots.txt bloquea el sitemap, las imágenes y el CSS/JS (Search Console y Merchant Center)
**Síntomas (ROI, 11/11):** Search Console no toma `sitemap.xml`; Merchant Center: *"No se pueden hacer comprobaciones de calidad ni de cumplimiento de las políticas en las páginas de producto — actualizá robots.txt para Googlebot y Googlebot-Image"*.
**Causa:** `app/robots.ts` tiene `Disallow: /` (bloquea todo lo que no sea la tienda) y `Disallow: /api/`. Con eso Google **no puede leer**:
- `/sitemap.xml` (cae en `Disallow: /`) → Search Console no lo procesa.
- las fotos de producto `/api/images/products/…` y `/api/images/product-images/…` (caen en `/api/`) → Googlebot-Image no ve las imágenes del feed ni de las páginas.
- `/_next/static/…` (CSS y JS de Next) y el favicon → Google no puede renderizar las páginas de producto para revisarlas.
**Arreglo:** en `robots.ts`, además de la tienda, permitir explícitamente (Google usa la regla más larga, así que `Allow: /api/images/` le gana a `Disallow: /api/`):
`allow: [storePath, \`${storePath}/\`, '/sitemap.xml', '/api/images/', '/_next/static/', '/_next/image', '/favicon']` + la ruta del favicon/logo del negocio si no está bajo `/api/images/`. Los `disallow` quedan igual.
Además, una regla igual con `userAgent: ['Googlebot', 'Googlebot-Image', 'Storebot-Google']` (Merchant Center usa `Storebot-Google`). Ojo: un grupo con user-agent propio **reemplaza** al `*` para ese bot, así que tiene que tener las mismas allow/disallow completas (armar el array una vez y usarlo en los dos grupos).
**Prueba:** `https://malema.com.ar/robots.txt` con las nuevas líneas; Search Console › Inspección de URL de una ficha (`/tienda/item/…`) › Probar URL publicada › "Rastreo permitido" y la captura de la página renderizada con estilos; probar también la URL de una imagen. Después reenviar `sitemap.xml`.

## S10 — Títulos en mayúsculas en el feed (Merchant Center: "Uso excesivo de mayúsculas")
Los nombres de producto se cargan en mayúsculas (`JEAN ROTURA BB`). Google lo marca y limita la visibilidad.
**Arreglo (solo en el feed, sin tocar los datos):** función `fixTitleCase(title)` en `app/api/v1/feeds/[feed]/route.ts`, aplicada en los tres `<g:title>`: si más del 60 % de las letras están en mayúscula, pasar cada palabra a "Primera en mayúscula" con `toLocaleLowerCase('es-AR')`, **salvo** las palabras de hasta 2 letras sin vocales o que sean talle/sigla (`BB`, `XL`, `XXL`, `S`, `M`, `L`, `CJ`) y las que tienen números (`2X1`, `T38`). La primera palabra siempre con mayúscula. Ejemplo: `JEAN ROTURA BB` → `Jean Rotura BB`; `REMERA OVERSIZE XL NEGRA` → `Remera Oversize XL Negra`. Si el título ya viene en mayúsculas y minúsculas, no tocarlo.
**Prueba:** el XML muestra los títulos corregidos; en Merchant Center el aviso desaparece en el próximo procesamiento.

## S11 — Feed de inventario local para Merchant Center (MALEMA: local físico con el mismo stock)
**Contexto (ROI, 11/11):** Merchant Center avisa *"Faltan datos de inventario local — limita la visibilidad en Argentina"*. MALEMA tiene local a la calle y vende el **mismo stock** en el local y online. Con un feed de inventario local, Google muestra los productos como "disponible en tienda cerca tuyo" (fichas locales gratuitas y anuncios de inventario local).
**Spec de Google** (support.google.com/merchants/answer/14819809): por cada producto y tienda, `store_code` (el código del Perfil de Empresa), `id` (**el mismo `g:id` del feed de productos**), `availability` (`in_stock` / `limited_availability` / `out_of_stock`) y `quantity`. Opcionales: `price` (si difiere del online), `pickup_method`, `pickup_sla`.
**Arreglo:**
1. **Migración:** `ALTER TABLE branches ADD COLUMN IF NOT EXISTS store_code varchar(64) NULL;` → solo se exportan las sucursales con `store_code`. Campo editable en Configuración › Sucursales, con la ayuda *"Código de tienda del Perfil de Empresa de Google (Google Business Profile). Dejalo vacío si esta sucursal no atiende al público."*
2. **Feed nuevo** `GET /api/v1/feeds/local-inventory.xml?token=…` en el mismo `route.ts` (mismo token, mismo try/catch). RSS 2.0 con `xmlns:g`, un `<item>` por **(sucursal con store_code × cada `g:id` que hoy sale en el feed de productos)**:
   `<g:store_code>`, `<g:id>` (misma lógica que el feed principal: `p-<id>`, `ds-<id>` o el SKU de la variante — extraer la generación de ids a una función común para que nunca diverjan), `<g:quantity>` = unidades de esa variante en `branch_inventory` de esa sucursal (mismo criterio de disponibilidad que `app/api/catalog/route.ts`; si en el catálogo se excluyen vendidas, acá también), `<g:availability>`: 0 → `out_of_stock`, 1–2 → `limited_availability`, 3+ → `in_stock`.
   Para ids a nivel producto (`p-<id>`): `quantity` = suma de sus variantes en esa sucursal.
   **Excluir productos de dropshipping** (`cj_pid` no vacío): no están en el local.
3. **Feed principal:** a los productos con `cj_pid` agregarles `<g:excluded_destination>free_local_listings</g:excluded_destination>` y `<g:excluded_destination>local_inventory_ads</g:excluded_destination>` (no están en ningún local).
4. Nada de esto cambia para negocios sin `store_code` (NULARIONE): el feed local sale vacío.
**Prueba:** cargar `store_code` en la sucursal de MALEMA (local) → el XML lista cada `g:id` del feed principal con su cantidad; un producto sin stock en el local sale `out_of_stock`; ningún `ds-`.

## Lo que NO aplica de Galplace
- **P145 (consent mode):** ROIPOS no tiene aviso de cookies ni Consent Mode, así que no tiene ese error. Si en el futuro se agrega un aviso, copiar el patrón final de Galplace (`components/CookieConsent.tsx`, commit `569435c`): default leído de `localStorage`, `gtag` definido con `arguments`, nunca `...args`.
- **P143/P144 (píxel de Meta):** ROIPOS no tiene píxel. Si se quiere medir campañas, es un CU aparte (ROI decide). Los eventos de e-commerce de GA4 sí: ver S8.

## Después del pase
1. Search Console: reenviar `sitemap.xml` y pedir indexación de `/tienda`.
2. Probar S1 con Tiempo real; S2 y S3 con Inspección de URL (home, una página `p/` y un producto `item/`): "Canónica declarada por el usuario" tiene que ser la propia URL.
