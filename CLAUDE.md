# CLAUDE.md — ROIPOS (roi-pos-app)

Guía para Claude Code (y para Claude en Cowork) al trabajar en este repo. Misma forma de trabajo que Galplace (`C:\apps\marketplace`), adaptada a ROIPOS.

## Qué es
Punto de venta multi-negocio (Next.js 15 + Postgres vía `pg`, sin ORM) con **tienda pública por negocio**: `/tienda` (es-AR) o `/store` (en-US, el middleware reescribe a `app/tienda`). Dominio de cada negocio en `business_domains` (`is_primary`). Negocios de referencia: **MALEMA** (`malema.com.ar`, local físico + online, ARS) y **NULARIONE** (`nularione.com`, dropshipping CJ, USD).

## Comandos
`npm run dev` · `npm run build` (tiene que dar limpio antes de cada commit) · no hay suite de tests.

## Roles
| Quién | Hace |
|---|---|
| **ROI** | Decide, aprueba, prueba, corre scripts de datos en PROD, hace `git push` (publica) |
| **Claude (Cowork)** | Analiza, escribe los pedidos en `doc/`, revisa cada commit **contra el código** y tacha lo terminado |
| **Claude Code (CC)** | Implementa **solo** lo pedido en `doc/`, un commit por punto |

## Pedidos y registro (`doc/`)
- Cada tanda en `doc/AAAA-MM-DD-<tema>.md`, con puntos **`S##`** (la numeración sigue: última usada **S18**). Cada punto: causa (archivo y línea), arreglo, prueba.
- **CC:** commits con el prefijo del punto (`S19: …`). Al terminar, agregá debajo del punto ` · **dd/mm: CC `<hash>`**: <qué cambió en una línea>` (un renglón por commit) y commiteá el `doc/`. **No taches**: lo tacha Claude (Cowork) o ROI después de revisar.
- Si algo del pedido no se puede o no conviene, avisá antes de hacer otra cosa.

## Ramas y publicación
- Se trabaja en **`main`**. **No hacer `git push`**: el push publica en Netlify (PROD); lo decide ROI.
- Antes de commitear: `npm run build` sin errores.

## Base de datos y datos de PROD
- `.env`/`.env.local` apuntan a bases **locales**. Nunca correr scripts, migraciones ni pruebas en una consola donde quedaron variables de PROD (`DATABASE_URL`, etc.): cerrá esa ventana.
- Migraciones: `db/migrations/` (las corridas se mueven a `db/migrations/ejecutadas/`), idempotentes.
- **Arreglos de datos en PROD** = script `.sql` manual que corre ROI: (a) diagnóstico solo `SELECT`; (b) arreglo en `BEGIN;` **sin `COMMIT`** (ROI decide `COMMIT`/`ROLLBACK`); (c) verificación. Siempre con backup previo. CC nunca los corre.
- Si se agregan tests: solo contra una base **local** (`localhost`), y la conexión tiene que negarse a cualquier otra (ver Galplace P157).

## Reglas de la tienda pública (multi-negocio)
- Nada escrito a mano con el nombre o datos de un negocio en páginas compartidas: usar settings, `store_pages` o `messages/` por idioma.
- URL base siempre con `getStoreBaseUrl(businessId, host)` (`catalog_base_url` → dominio `is_primary` → host). Nunca `https://example.com` ni rutas relativas en canónicas, sitemap, feeds u Open Graph.
- Idioma y moneda del negocio (`locale`, `currency`): nada fijo en ARS o en español.
- **Cualquier cambio en la tienda pública, el sitemap, robots, los feeds o la medición** se controla con **`doc/checklist-seo.md`** antes de darlo por terminado.
