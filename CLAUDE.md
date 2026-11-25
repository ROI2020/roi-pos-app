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
- Cada tanda en `doc/AAAA-MM-DD-<tema>.md`, con puntos **`S##`** (la numeración sigue: última usada **S36**). Cada punto: causa (archivo y línea), arreglo, prueba.
- **CC:** commits con el prefijo del punto (`S19: …`). Al terminar, agregá debajo del punto ` · **dd/mm: CC `<hash>`**: <qué cambió en una línea>` (un renglón por commit) y commiteá el `doc/`. **No taches**: lo tacha Claude (Cowork) o ROI después de revisar. Última S usada: **S40**.
- Si algo del pedido no se puede o no conviene, avisá antes de hacer otra cosa.

## Ramas y publicación
- Se trabaja en **`main`**. **No hacer `git push`**: el push publica en Netlify (PROD); lo decide ROI.
- Antes de commitear: `npm run build` sin errores.

## Base de datos y migraciones
- `.env`/`.env.local` apuntan a bases **locales**. Nunca correr scripts, migraciones ni pruebas en una consola donde quedaron variables de PROD (`DATABASE_URL`, etc.): cerrá esa ventana.
- **Migraciones automáticas** (S33–S35): `db/migrations/NNN_descripcion.sql` (3 dígitos, siguiente libre). `db/migrate.mjs` las aplica en orden, con registro en `schema_migrations`. Corren **solas en el build de Netlify** (`npm run build && npm run migrate`): QA al push de `qa`, PROD al build de `main` (antes del *Publish deploy*). En local: `node --env-file=.env.local db/migrate.mjs` (ROI).
- **Reglas de las migraciones:**
  - Idempotentes (`IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
  - Compatibles con el código publicado (el build corre las migraciones antes del publish): agregar columnas/tablas/índices sí; borrar o renombrar, en dos pases (primero el código deja de usarlo, después la migración lo borra).
  - Nada que no pueda ir dentro de una transacción (no `CREATE INDEX CONCURRENTLY`).
  - Una migración aplicada en PROD **no se edita**.
  - Comentario `-- S##` al inicio de cada archivo nuevo.
  - Nunca correr `npm run migrate` contra una base remota desde la consola (la guarda P157 lo impide fuera de Netlify).
- **Baseline:** `000_baseline.sql` = foto del esquema de PROD (fecha y origen en el comentario de la primera línea). Archivos anteriores en `db/historico/`.
- **Arreglos de datos en PROD** = script `.sql` manual que corre ROI: (a) diagnóstico solo `SELECT`; (b) arreglo en `BEGIN;` **sin `COMMIT`** (ROI decide `COMMIT`/`ROLLBACK`); (c) verificación. Siempre con backup previo. CC nunca los corre.
- Si se agregan tests: solo contra una base **local** (`localhost`), y la conexión tiene que negarse a cualquier otra (ver Galplace P157).

### Orden de puesta en marcha de las migraciones (para ROI)
1. `scripts/backup-prod.ps1` — backup de PROD
2. `scripts/backup-prod.ps1 -SoloEsquema` — genera `db/migrations/000_baseline.sql` (limpia automáticamente; se niega si ya existe); commitear
3. `db/scripts/adoptar-baseline.sql` en PROD con `COMMIT` (DBeaver o `psql` interactivo) — registra la baseline
4. Push de `qa` — QA vacía: el build crea el esquema desde la baseline; después la restauración (S32) la pisa
5. Recién entonces el primer merge a `main` con el `netlify.toml` nuevo — si PROD no adoptó la baseline, la guarda de S33 frena el build y no pasa nada

## Reglas de la tienda pública (multi-negocio)
- Nada escrito a mano con el nombre o datos de un negocio en páginas compartidas: usar settings, `store_pages` o `messages/` por idioma.
- URL base siempre con `getStoreBaseUrl(businessId, host)` (`catalog_base_url` → dominio `is_primary` → host). Nunca `https://example.com` ni rutas relativas en canónicas, sitemap, feeds u Open Graph.
- Idioma y moneda del negocio (`locale`, `currency`): nada fijo en ARS o en español.
- **Cualquier cambio en la tienda pública, el sitemap, robots, los feeds o la medición** se controla con **`doc/checklist-seo.md`** antes de darlo por terminado.
