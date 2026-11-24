# Checklist de control SEO, medición y vista previa — todos los proyectos

**Versión 18/11/2026.** Copia maestra: `C:\apps\marketplace\marketplace-docs\reference\checklist-seo.md`. Hay copias iguales en `C:\apps\roipos\roipos-app\doc\checklist-seo.md` y `C:\promobook-app\doc\checklist-seo.md`: si cambiás una, actualizá las tres.

**Para quién:** Claude (Cowork o Claude Code) que revise una web pública de ROI Solutions: **Galplace** (tienda de cada galería, ej. `galeriaturdera.com.ar`), **ROIPOS** (tienda de cada negocio, ej. `malema.com.ar/tienda`, `nularione.com/store`) y **Promobook** (`promobook.com.ar`).

**Cómo usarla:** recorré las secciones en orden. Para cada punto, verificá **contra la web publicada y contra el código** (no alcanza con leer el código). Anotá lo que falle en el registro de pendientes del proyecto (ver "Dónde anotar" al final), con causa, archivo y línea, arreglo y prueba. Cada punto dice entre corchetes el caso real que lo motivó.

---

## 0. Antes de empezar
- [ ] Identificar el **dominio principal** de cada sitio (con o sin `www`) y los secundarios/alias. Todo lo que sigue (canónicas, sitemap, og:url, feeds) tiene que usar el principal. [ROIPOS S7: `pauli.roipos.com.ar` vs `malema3.com.ar`]
- [ ] Abrir la web en **incógnito** y repetir los controles de medición **antes y después** de tocar "Aceptar" en el aviso de cookies. Un análisis sin aceptar no ve el píxel ni los eventos. [Galplace, análisis externo del 14/11]
- [ ] Si el navegador de prueba muestra algo raro con animaciones o tamaños, medir sin transiciones: el panel de prueba puede no terminar las animaciones. [Galplace P149]

## 1. Rastreo e indexación
- [ ] **`/robots.txt`** responde 200 y:
  - permite las páginas públicas **con y sin barra final** (`/tienda` y `/tienda/`) [ROIPOS S2: `Allow: /tienda/` + `Disallow: /` bloqueaba la home];
  - permite **`/sitemap.xml`**, las **imágenes** (`/api/images/…`), el CSS/JS (`/_next/static/`, `/_next/image`) y el favicon: Google necesita renderizar [ROIPOS S9];
  - bloquea checkout, carrito, seguimiento de pedido, panel, `/api/` (salvo imágenes);
  - si hay grupo propio para `Googlebot`/`Googlebot-Image`/`Storebot-Google`, repite **todas** las reglas (un grupo propio reemplaza al `*`).
- [ ] **`/sitemap.xml`** responde 200, usa el dominio principal y trae **todos** los tipos de página: home, categorías, locales/comercios, productos/promos activos, páginas de contenido, preguntas frecuentes. Contar URLs por tipo. [Galplace P153: solo home + productos porque una consulta fallaba en silencio]
- [ ] El sitemap **no** incluye páginas `noindex`, privadas ni para otro público (Términos para locatarios, checkout, borradores, promos vencidas). [Galplace P153]
- [ ] Si una parte del sitemap falla, el error queda en el **log** (no se traga en silencio).
- [ ] Search Console: propiedad verificada (DNS), sitemap enviado y en "Correcto"; **Inspección de URL** de home, una categoría y un producto → "Rastreo permitido: Sí" y captura renderizada con estilos y fotos.
- [ ] Una URL inexistente devuelve **404** real (no 200) con `noindex`. Un producto o promo **inactivo/vencido** da 404/410 o `noindex`, no "index, follow". [Promobook B2]
- [ ] Rutas con punto o raras (`/meta.json`, `/wp-login.php`) cortan en 404 sin llamar a la API. [Galplace P162]
- [ ] La raíz del dominio redirige a la tienda con **308/301**, nunca 307/302. [ROIPOS S4]

## 2. Canónicas y URLs
- [ ] **Cada página tiene su propia canónica** apuntando a sí misma, con el dominio principal. En Next.js la metadata del layout **se hereda**: si una página hija no define `alternates.canonical`, queda la de la home. [ROIPOS S3]
- [ ] La canónica coincide **exactamente** con la URL del sitemap y del `og:url` (protocolo, `www`, barra final).
- [ ] Dominio secundario/alias: canónica al principal (y `noindex` si corresponde). [ROIPOS S7, Galplace CU-026-03]
- [ ] Listados con filtros (`?q=`, `?cat=`, orden): canónica a la versión sin filtros o con los filtros que tengan sentido indexar.

## 3. Títulos, descripciones y contenido
- [ ] `<title>` único por página y **sin el nombre repetido** (ojo con plantillas `%s | Marca` + página que ya agrega la marca). [Galplace P154]
- [ ] `meta description` única por tipo de página: las categorías no pueden heredar la de la home (generarla con nombre y cantidades reales). [Galplace P154]
- [ ] Un solo **H1** por página (puede ser `sr-only` si el diseño no lo muestra). [Galplace P147]
- [ ] `lang` correcto (`es-AR`, `en-US`) y textos en el idioma del sitio (no páginas de un negocio en otro idioma). [ROIPOS S6]
- [ ] Todas las imágenes con **`alt` descriptivo** (no nombres de archivo ni "Página Web 2"); el panel tiene que pedirlo con una ayuda clara. [Galplace P147]
- [ ] Contenido **multi-negocio**: nada escrito a mano con el nombre de un negocio ("MALEMA STORE") en páginas compartidas. [ROIPOS S3/S6]
- [ ] Datos de contacto visibles: dirección, WhatsApp de la empresa (nunca el de un local en Galplace), **horarios** en pie o Inicio. [Galplace CU-066]

## 4. Vista previa al compartir (Open Graph / Twitter)
- [ ] Cada página tiene `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name` y `twitter:card`. En Next.js, un `openGraph` en la página **reemplaza entero** el del layout: armarlo completo o no definirlo. [Galplace P146, ROIPOS S3]
- [ ] `og:image` con **URL absoluta**, JPG/PNG/WebP de ≥ 1200 × 630 (no SVG: WhatsApp y Facebook no lo muestran).
- [ ] Probar en **developers.facebook.com/tools/debug** ("Volver a extraer") y pegando el link en **WhatsApp**. El aviso de `fb:app_id` se ignora (solo sirve si hay una app de Facebook).

## 5. Datos estructurados (JSON-LD)
- [ ] Empresa/sitio: `ShoppingCenter` / `Store` / `LocalBusiness` con nombre, dirección, `geo`, teléfono, `sameAs`, `priceRange` y **`openingHoursSpecification` con los días reales**. Verificar que el formato de horarios guardado coincida con el que lee el JSON-LD. [Galplace CU-066 §11: se guardaba como arreglo y se leía como objeto → sin horarios]
- [ ] `description` sin tabulaciones, viñetas ni saltos sueltos; ≤ 500 caracteres. [Galplace P154]
- [ ] `WebSite` con `SearchAction` (si hay buscador).
- [ ] Ficha de producto: `Product` con `name`, **`image` (URLs absolutas)**, `description`, `brand`, `offers` (`url`, `price`, `priceCurrency`, `availability`, `itemCondition`, `seller`) y, si se puede, `shippingDetails` y `hasMerchantReturnPolicy`. [ROIPOS S12: productos físicos sin `image`]
- [ ] `BreadcrumbList` en fichas y categorías.
- [ ] Validar en **search.google.com/test/rich-results** (home, categoría, ficha).

## 6. Medición (GA4, píxel de Meta, API de Conversiones)
- [ ] **GA4 carga en todas las páginas públicas** (home, listados, ficha, carrito, checkout, confirmación). En DevTools › Red filtrar `collect?v=2`: estado **204**, no "(blocked:csp)". [ROIPOS S1: el middleware no inyectaba el ID en la tienda]
- [ ] **CSP** (si hay): `script-src` con `https://*.googletagmanager.com`; `connect-src` con `https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://www.google.com https://www.google.com.ar` (+ `https://connect.facebook.net https://www.facebook.com` si hay píxel). [ROIPOS: CSP bloqueaba `analytics.google.com`]
- [ ] **Consent Mode v2** (si hay aviso de cookies): antes de aceptar `gcs=G100`; después de "Aceptar" **y al recargar** `gcs=G111` (en `gcd` aparece `r`, no `p`). `gtag` siempre definido con `arguments` (nunca `...args`), y el `default` leído del consentimiento guardado. [Galplace P145]
- [ ] No hay **propiedades GA4 duplicadas** sin querer (destinos combinados en la etiqueta de Google). [Galplace: `G-9KZM…` de la galería]
- [ ] Eventos de e-commerce: `view_item`, `add_to_cart`, `begin_checkout`, `purchase` (con `transaction_id`, `value`, `currency` del negocio, `items`), **una sola vez por compra** aunque se recargue la confirmación; también en recarga completa (no depender del estado de React al montar). Verificar en GA4 › DebugView. [ROIPOS S8, Galplace P144]
- [ ] Píxel de Meta: carga **solo con consentimiento**, `PageView` en cada navegación SPA, `ViewContent`/`AddToCart`/`InitiateCheckout`/`Purchase` con `eventID` = número de compra; si el script carga tarde, los eventos se encolan. [Galplace P143/P144]
- [ ] API de Conversiones (si hay): mismo `event_id` que el píxel, solo con consentimiento, datos hasheados, en QA solo con código de prueba; tablero de envíos sin errores. [Galplace CU-064/065]

## 7. Feeds y Merchant Center (tiendas)
- [ ] El feed responde 200 (no 500) con **links absolutos** del dominio principal (nunca `https://example.com` ni relativos). [ROIPOS S7/S18]
- [ ] `availability` real (incluye productos sin stock físico propio, ej. dropshipping) y `g:id` iguales entre feed principal y feed de inventario local. [ROIPOS S11]
- [ ] Títulos sin mayúsculas excesivas; imágenes accesibles para Googlebot-Image (ver robots). [ROIPOS S9/S10]
- [ ] Inventario local solo si hay local físico vinculado al Perfil de Empresa; si no, quitar los complementos en Merchant Center.

## 8. Seguridad y errores que afectan a buscadores y usuarios
- [ ] Páginas armadas en el servidor con datos de usuarios/comercios: **todo escapado** (HTML) y, dentro de `<script>`, con `JSON.stringify`. Probar con un título `Prueba "comillas" 'apóstrofo' <b>negrita</b>`. [Promobook B2: XSS en `/p/:id`]
- [ ] Ningún error devuelve `err.message`/stack al navegador.
- [ ] Mapas: proveedor de capas vigente (CARTO pide API key desde 2026; OpenStreetMap con atribución). [Promobook]

## 9. Rendimiento e imágenes
- [ ] Home: tiempo de respuesta < 1 s, carga < 2,5 s, peso razonable (medir en Red o PageSpeed Insights).
- [ ] Imágenes guardadas con tamaño suficiente para su uso (banners de escritorio ≥ 1920 px) y servidas redimensionadas (Next/Image). El tamaño **ideal** de un uso no es un **tope**. [Galplace P160]
- [ ] Nada duplicado en el HTML (versiones móvil/escritorio ocultas por CSS): Google y los análisis ven todo. [Galplace P148]

## 10. Dominio, mail y verificaciones
- [ ] DNS: **un solo** registro SPF (`v=spf1 include:_spf.google.com ~all` con Workspace), **DKIM** publicado **y activado** en Google Admin, **DMARC** (`_dmarc` TXT, `p=none` al empezar). Probar con un mail a Gmail › "Mostrar original": SPF, DKIM y DMARC en PASS. [Galplace: rebote en Outlook 10/11]
- [ ] Verificaciones vigentes: Search Console, dominio de Meta (`facebook-domain-verification`), Pinterest si aplica.

## 11. Herramientas y comandos rápidos
- DevTools › Red: `collect?v=2` (GA4), `facebook.com/tr` (píxel); Consola: errores de CSP.
- PowerShell: `Resolve-DnsName -Type TXT <dominio>` y `_dmarc.<dominio>`; `curl.exe -I https://<dominio>/` (código y redirecciones).
- Facebook Sharing Debugger · Rich Results Test · PageSpeed Insights · Search Console (Inspección de URL, Sitemaps, Páginas) · Merchant Center (Diagnóstico).
- En la sesión de Claude, si el proxy bloquea el dominio, usar el navegador del panel (Browser) para leer `<head>`, JSON-LD, `robots.txt` y `sitemap.xml` con JavaScript.

## Dónde anotar lo que falle
| Proyecto | Registro | Numeración |
|---|---|---|
| Galplace | `marketplace-docs/V1/E2E-V1.md` (errores) y `V1/Mejoras pendientes-V1.md` | `P###`, `M##` |
| ROIPOS | `doc/AAAA-MM-DD-<tema>.md` (una tanda por archivo) | `S##` (sigue la última usada) |
| Promobook | `doc/AAAA-MM-DD-<tema>.md` | `B##` (sigue la última usada) |

En los tres: causa con archivo y línea, arreglo, prueba; CC anota sus commits en el punto y Claude (Cowork) lo revisa contra el código y lo tacha.
