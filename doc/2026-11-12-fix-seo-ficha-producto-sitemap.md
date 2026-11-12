# Tienda pública — schema de producto, sitemap y robots (12/11/2026)

Revisado por Claude a partir de Search Console de **malema.com.ar** (ficha `baggy-cargo`, rastreada el 12/11 14:55).
Sigue la numeración de `2026-11-11-fix-seo-ga4-tienda.md`. Antes de commitear: `npm run build` limpio. Un commit por punto, con el número (S12…S16) en el mensaje.

**Qué reporta Google en la ficha:**
- Crítico: falta `image`.
- No críticos: falta `brand`/GTIN, falta `shippingDetails`, falta `hasMerchantReturnPolicy`.

---

## ~~S12 — La ficha de producto sale sin `image` (CRÍTICO)~~
**Causa:** `app/tienda/item/[slug]/page.tsx`
- JSON-LD: `const imgForSchema = prod.general_image_url ?? null`. `general_image_url` solo lo tienen los productos dropshipping (CJ). Los productos físicos de MALEMA guardan la foto en `products.photo_url` (Base64) → `imgForSchema` es `null` → el spread `...(imgForSchema && { image })` no agrega nada.
- `generateMetadata`: el mismo problema. `imgUrl = toProxyUrl(p.general_image_url)` → sin `og:image` ni `twitter:image` para físicos.
- La ruta pública que sirve esa foto ya existe: `GET /api/images/products/[id]` (lee `photo_url`) y las fotos por color salen de `GET /api/images/product-images/[imgId]`.

**Arreglo:**
1. Helper local `buildSchemaImages(...)` que devuelva un array de **URLs absolutas** (`${baseUrl}/...`), sin duplicados y en este orden:
   - Si hay foto propia → `${baseUrl}/api/images/products/${prod.id}`.
   - Si hay `general_image_url` (CJ) → la URL tal cual (ya es absoluta y pública).
   - Fotos por color de `product_images` → `${baseUrl}/api/images/product-images/${id}` (las primeras 4–5 alcanzan).
   - Galería CJ (`cj_gallery`) → URLs tal cual.
   Nunca meter rutas relativas (`/api/...`) ni la salida de `toProxyUrl` sin anteponer `baseUrl`: Google exige URL absoluta.
2. En la query del producto agregar `(p.photo_url IS NOT NULL) AS has_local_photo` (**no** traer `photo_url`: es Base64 y pesa). En `generateMetadata` hacer lo mismo.
3. JSON-LD: `image: images` (array). Si el array queda vacío, no emitir el bloque Product (mejor sin schema que con error crítico) y loguear `console.warn`.
4. `generateMetadata`: `openGraph.images` y `twitter.images` con `images[0]` (absoluta).

**Prueba:** Search Console › Inspección de URL › `https://malema.com.ar/tienda/item/baggy-cargo` › **Probar URL publicada** → "Fragmentos de productos" / "Fichas de comerciante" sin error crítico; en la vista HTML el JSON-LD tiene `"image":["https://malema.com.ar/api/images/products/176", ...]`. Abrir esa URL en incógnito → devuelve la foto con `Content-Type: image/...`. Probar también una ficha de un producto CJ.

## ~~S13 — `brand` y `sku` en el schema (aviso GTIN/marca)~~
**Causa:** el Product no tiene `brand` ni identificadores.
**Arreglo:** en `item/[slug]/page.tsx` leer `business_name` (ya se lee en `generateMetadata`; sumarlo a los settings de la página) y agregar:
- `brand: { '@type': 'Brand', name: businessName }` — **mismo criterio que el feed** (`app/api/v1/feeds/[feed]/route.ts` usa `businessName` como `g:brand`), así Search y Merchant Center coinciden.
- `sku`: mismo id que usa el feed para el producto (`ds-${id}` / sku / `p-${id}`; reutilizar la función del feed exportándola a `lib/`, no duplicarla).
- Opcional: si la variante tiene `barcode` con 8/12/13/14 dígitos, emitir `gtin`. Si no, nada (no inventar GTIN).
- Agregar `itemCondition: 'https://schema.org/NewCondition'` en el `Offer`.

## ~~S14 — Envío y devoluciones en el schema (avisos opcionales)~~
**Importante:** es multi-negocio, **no hardcodear valores de MALEMA**. Los datos tienen que salir de settings y emitirse solo si están cargados.
**Arreglo:**
1. Settings nuevos (públicos) por negocio, editables en Configuración › Tienda (o donde estén `catalog_envio_info`/`catalog_cuotas`):
   - `seo_shipping_cost` (número, en la moneda del negocio; `0` = gratis)
   - `seo_handling_days_max`, `seo_transit_days_min`, `seo_transit_days_max`
   - `seo_return_days` (número; vacío = no emitir)
   - `seo_return_fees`: `free` | `customer`
2. En `item/[slug]/page.tsx`, si están cargados, agregar en `offers`:
   - `shippingDetails` → `OfferShippingDetails` con `shippingDestination: { '@type': 'DefinedRegion', addressCountry: <país del negocio, AR/US> }`, `shippingRate: { '@type': 'MonetaryAmount', value, currency }`, `deliveryTime` con `handlingTime` y `transitTime` (`QuantitativeValue`, `unitCode: 'DAY'`).
   - `hasMerchantReturnPolicy` → `MerchantReturnPolicy` con `applicableCountry`, `returnPolicyCategory: MerchantReturnFiniteReturnWindow`, `merchantReturnDays`, `returnMethod: ReturnByMail`, `returnFees: FreeReturn | ReturnFeesCustomerResponsibility`.
3. Datos de MALEMA: ver "Pendiente tras deploy" (actualizado 12/11, tarde).
4. Alternativa válida (decide ROI): cargar envío y devoluciones en **Merchant Center › Envíos y devoluciones**; Google los toma de ahí para Shopping y los avisos del schema pasan a irrelevantes.

## ~~S15 — `StoreJsonLd` del layout: query rota y Products duplicados en todas las páginas~~
**Causa:** `app/tienda/_components/store-jsonld.tsx` se renderiza desde `app/tienda/layout.tsx`, o sea en **todas** las páginas de la tienda (home, fichas, `/p/...`).
- La subquery usa `bi.variant_id`, pero la columna es `branch_inventory.product_variant_id` → la query falla, el `.catch` devuelve `[]` y el ItemList sale siempre vacío (`numberOfItems: 0`).
- Si se arregla tal cual, cada ficha tendría además 100 `Product` completos (con `offers`) de otros productos → Google ve entidades Product que no corresponden a la página y lo marca como spam de datos estructurados / mezcla los errores.
**Arreglo:**
1. Dejar en el layout **solo** el `OnlineStore` (Organization). Sumarle `logo` (setting `business_logo`, absoluta) y `url`.
2. Mover el `ItemList` a `app/tienda/page.tsx` (solo home) en **formato resumen**: `itemListElement: [{ '@type': 'ListItem', position, url }]`, solo productos con `slug`. Sin `Product` anidados ni `offers` (Google: en páginas de listado, solo URLs).
3. Si igual se necesita la columna de stock en algún lado, usar `bi.product_variant_id`.

## ~~S16 — Sitemap: `lastmod` falso y raíz bloqueada en robots~~
**Causa:**
- `app/sitemap.ts` › productos: `lastModified: p.cj_last_sync ? … : new Date()`. Los físicos (todo MALEMA) no tienen `cj_last_sync` → `lastmod` = hora del request en cada lectura → Google aprende a ignorar el `lastmod` del sitio. La home también usa `new Date()`.
- `app/robots.ts`: `Disallow: /` bloquea también la raíz `https://malema.com.ar/`. La raíz hace 308 a `/tienda` (S4), pero con la raíz bloqueada Google no puede rastrear el redirect.
**Arreglo:**
1. `sitemap.ts`, productos: `SELECT slug, GREATEST(updated_at, cj_last_sync) AS lastmod` y usar `lastmod` (si es null, **omitir** `lastModified`, no poner `new Date()`).
2. `sitemap.ts`, home: `lastModified` = `MAX(updated_at)` de los productos exportables del negocio (una query más). Si no hay, omitir.
3. Revisar que guardar un producto (edición de precio, foto, descripción, `exportable_web`) actualice `products.updated_at`. Si no hay trigger, setearlo en el `UPDATE` de la API de productos (y en el upload de foto).
4. `robots.ts`: agregar `'/$'` a `allowPaths` (Google soporta `$` como fin de URL; `Allow: /$` gana sobre `Disallow: /` solo para la raíz).
5. No agregar la raíz `/` al sitemap (es un redirect; el sitemap solo debe tener URLs finales 200).

**Prueba:** `https://malema.com.ar/sitemap.xml` dos veces seguidas → los `lastmod` de los productos **no cambian** entre lecturas y coinciden con su última edición. `robots.txt` muestra `Allow: /$`. Inspección de URL de `https://malema.com.ar/` → "Rastreo permitido: Sí", página con redirección a `/tienda`.

---

## Commits implementados (12/11/2026)

| Punto | Hash | Notas |
|-------|------|-------|
| S12/S13/S14 | `a4aa6ac` | Los tres se agruparon en un solo commit sobre `item/[slug]/page.tsx`. S12 usó `buildSchemaImages()` con `has_local_photo` (sin traer el Base64). S13 creó `lib/product-sku.ts` y el feed lo importa. S14 lee settings `seo_return_*` y `seo_shipping_*`; para MALEMA solo falta cargar los settings en PROD (OK de ROI pendiente para shipping). |
| S15 | `469a3cb` | `store-jsonld.tsx` → solo `OnlineStore`; `page.tsx` convertido a Server Component + `_catalog.tsx` extraído como `"use client"`. La query buggy `bi.variant_id` desaparece al eliminar el ItemList del layout. |
| S16 | `2353db5` | Sitemap usa `GREATEST(updated_at, cj_last_sync)` y omite `lastModified` si es NULL. `robots.ts` agrega `/$`. `images/route.ts` actualiza `products.updated_at` tras upload de foto de color. |
| S17 | `7f2de7c` | "Last update" y "Back to store" traducidos desde `messages/es.json`+`en.json`; fecha formateada con el locale del negocio; backlink corregido a `/store` en inglés. |
| S18 | `d4e3eda` | 500 urgente en feed local-inventory: `COALESCE(bi.quantity, 0)` → `(bi.id IS NOT NULL)::int`; nuevo `localBranchAvailability()` que solo emite `in_stock`/`out_of_stock` (no `limited_availability`). |

**Pendiente tras deploy (hace ROI) — actualizado 12/11, tarde:**
- **Unificar la política antes de cargar settings.** Hoy hay dos páginas publicadas que se contradicen:
  - `p/devoluciones`: solo devoluciones por defecto, 10 días corridos; no acepta devoluciones por preferencia; cambios solo presenciales.
  - `p/politica-envios`: arrepentimiento de 10 días (Ley 24.240) **con** devolución, envío a cargo del comprador; defecto → garantía 6 meses, envío a cargo de la tienda.
  Google compara el schema con la página y con Merchant Center: tiene que haber **una** política.
- El código de S14 ya cubre los dos casos sin cambios: `seo_return_fees` = costo de la devolución **por arrepentimiento** (`returnFees`); el defecto ya sale como `itemDefectReturnFees: FreeReturn`. Con lo que dice `politica-envios`: `seo_return_days=10`, `seo_return_fees=customer`. (Antes este doc decía `free`: **descartado**.)
- **Envío: no cargar `seo_shipping_*` para MALEMA.** El costo se calcula en el checkout por CP y peso (OCA/Andreani/Correo Argentino); no hay tarifa fija y un valor inventado es peor que el aviso opcional. Si se quiere, configurarlo en Merchant Center. Plazos de referencia: CABA/GBA 2–4 días hábiles, interior 4–8, Patagonia hasta 12.
- **No** volver a correr `20261111_store_pages_devoluciones.sql` (dice 7 días; la página en PROD ya fue editada).

## ~~S17 — "Last update" en inglés en las páginas de contenido~~
**Causa:** `app/tienda/p/[slug]/page.tsx` línea ~115 tiene el texto fijo `Last update: {updatedDate}`. Sale en inglés en todas las páginas de MALEMA (devoluciones, política de envíos).
**Arreglo:** pasarlo a `messages/es.json` / `messages/en.json` (ej. `store.pages.lastUpdate`: "Última actualización" / "Last update") y leerlo con `getTranslations` según el locale del negocio. Formatear la fecha con el locale del negocio (ya parece hacerlo; verificar).
**Prueba:** `malema.com.ar/tienda/p/devoluciones` → "Última actualización: 12 de noviembre de 2026"; `nularione.com/store/p/returns` → "Last update: November 12, 2026".

---

## ~~S18 — Feed de inventario local da 500: `column bi.quantity does not exist` (URGENTE)~~
**Causa:** `app/api/v1/feeds/[feed]/route.ts`, rama `local-inventory` (S11), línea ~178: `COALESCE(bi.quantity, 0) AS quantity`. `branch_inventory` **no tiene columna de cantidad**: el modelo es una fila por variante y sucursal (`UNIQUE (product_variant_id, branch_id)`); que exista la fila = esa variante está en esa sucursal. Se suma y se borra la fila (`inventory/assign`, `exchanges`, `ml/webhook`), no se cambia una cantidad. Error en Netlify, 12/11 16:27.
**Arreglo:**
1. Reemplazar por `(bi.id IS NOT NULL)::int AS quantity` (0 o 1). **No** agregar una columna `quantity` a la tabla.
2. `localAvailability(qty)`: con este modelo `qty` siempre vale 0 o 1, así que hoy todo lo que hay saldría `limited_availability`. Para el feed local: `qty > 0 → 'in_stock'`, si no `'out_of_stock'`. Si `localAvailability` se usa en otro lado, crear una función aparte para el feed local en vez de cambiar la compartida.
3. `<g:quantity>`: mandar `1`/`0` está bien (Google lo acepta como opcional); dejarlo.
4. Revisar que ningún otro query del repo use `bi.quantity`, `bi.stock` o `bi.variant_id` (`grep -rn "bi\.\(quantity\|stock\|variant_id\)" app lib`).
**Prueba:** `npm run build` y abrir en local `/api/v1/feeds/local-inventory.xml?token=<token del negocio>` → 200, XML con un `<item>` por sucursal con `store_code` × variante; una variante asignada a la sucursal sale `in_stock`/`1`, una no asignada `out_of_stock`/`0`. Después del deploy, lo mismo en `https://malema.com.ar/api/v1/feeds/local-inventory.xml?token=…` y en Merchant Center › Fuentes de datos › **Obtener ahora**.

## Después del deploy (lo hace ROI)
1. Inspección de URL → **Probar URL publicada** en 2 fichas (una física, una CJ). Si ya no hay error crítico → **Solicitar indexación** en 4–5 fichas clave.
2. Search Console › Mejoras › Fichas de comerciante / Fragmentos de productos → **Validar corrección**.
3. Sitemaps: no hace falta reenviarlo; si querés, borrarlo y volver a enviar `https://malema.com.ar/sitemap.xml` una vez. "Detectada/Rastreada: actualmente sin indexar" en un sitio nuevo se resuelve en días o semanas, no con reenvíos.
