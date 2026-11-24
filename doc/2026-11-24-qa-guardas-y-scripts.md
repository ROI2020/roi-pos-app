# Pedido CC — QA: backup, guardas y restauración (24/11/2026)

Contexto: `doc/2026-11-18-hoja-de-ruta-qa.md` (Q4, Q7, Q8). QA = branch deploy de `qa` en `qa--roi-pos.netlify.app`, base Supabase `roipos-qa` (hoy vacía). El objetivo de esta tanda es que **QA no pueda tocar nada real** (clientes, ARCA, pagos, CJ, ML, Google) antes de cargarle una copia de PROD.

**Reglas de esta tanda**
- Trabajar en la rama **`qa`** (no en `main`). Sin `git push`. `npm run build` limpio antes de cada commit. Un commit por punto, con prefijo (`S19: …`).
- Todas las guardas leen `APP_ENV` vía `lib/env.ts` (S20), **nunca `NODE_ENV`** (en Netlify QA también vale `production`).
- Si falta `APP_ENV` se toma como `development`: ante la duda, las guardas quedan **prendidas** (falla hacia el lado seguro).
- Los scripts de Galplace que se copian están en `C:\apps\marketplace\marketplace-docs\scripts\` (`pase.ps1`, `restaurar-qa.ps1`) y su explicación en `...\reference\restaurar-qa.md` y `ambientes-netlify.md`.
- `doc/` está en `.gitignore`: para commitear este archivo con tus anotaciones usá `git add -f doc/2026-11-24-qa-guardas-y-scripts.md`.
- Al terminar cada punto, debajo: ` · **dd/mm: CC `<hash>`**: <qué cambió>`. No tachar.

---

## S19 — Backup de PROD (`scripts/backup-prod.ps1`) — hoja Q7
- **Causa:** PROD está en Supabase plan gratis, **sin backups automáticos**. Antes de cualquier restore o pase tiene que haber un backup verificado.
- **Arreglo:** copiar de Galplace `pase.ps1` solo la parte de backup (`-SoloBackup`): `pg_dump -Fc`, verificación de tamaño > 0 y `pg_restore -l` sobre el archivo, nombre `roipos-prod-AAAAMMDDHHMM.dump`, limpieza de `DATABASE_URL`/`APP_ENV`/`NODE_ENV`/`PG*` al empezar y al terminar (también si falla), y `-Simular` (muestra qué haría sin conectarse). Lee `secrets\.env.bck.prod` (`DATABASE_URL_PROD` = session pooler 5432, `PG_BIN`, `BACKUP_DIR`). Agregar `secrets/` a `.gitignore` y un `secrets\.env.bck.prod.example` sin valores. Nunca mostrar la URL ni la contraseña en pantalla.
- **Prueba:** `-Simular` OK; ROI corre uno real → "Backup OK" y el `.dump` lista objetos con `pg_restore -l`.
 · **24/11: CC `523d0be`**: script backup-prod.ps1 con -Simular, limpieza de env vars, verificación pg_restore -l; .env.bck.prod.example; secrets/ y doc/ en .gitignore

## S20 — `lib/env.ts`
- **Causa:** no hay forma de saber en el código si se corre en QA. Los dos usos de `NODE_ENV` (`lib/db.ts:43`, ssl; `app/api/ml/webhook/route.ts:107`, firma) **quedan como están**: en Netlify `NODE_ENV=production` también en QA, y eso ahí es correcto.
- **Arreglo:** `lib/env.ts` con `APP_ENV` (`development` · `qa` · `production`; valor desconocido o vacío → `development`), `isProd`, `isQa`, `isDev`. Sin dependencias, usable en server y en el middleware (edge).
- **Prueba:** build limpio; un `console.log` temporal no hace falta: lo muestra S21.
 · **24/11: CC `65f4a19`**: lib/env.ts con APP_ENV, isProd, isQa, isDev; sin dependencias, edge-compatible

## S21 — Healthcheck con ambiente y base
- **Causa:** `app/api/healthcheck/route.ts` devuelve `current_database()`, que en Supabase es `postgres` en QA y en PROD: no sirve para saber a qué base está conectado. El 24/11 hubo que leerlo en los logs.
- **Arreglo:** agregar `app_env` y `db_ref` (el *project ref*: sufijo de `DB_USER` después de `postgres.`, o el host si no tiene sufijo; si es `localhost`, `local`) y `version` (`NEXT_PUBLIC_APP_VERSION`). **Nunca** host completo, usuario completo, contraseña ni URL.
- **Prueba:** local → `app_env: development, db_ref: local`. En QA (después del push de ROI) → `qa` + ref de `roipos-qa`.
 · **24/11: CC `2e5a1a4`**: healthcheck con app_env, db_ref (project ref de DB_USER) y version

## S22 — Mails redirigidos fuera de PROD
- **Causa:** `lib/email.ts:39` (`sendEmail`) manda a `opts.to` (el comprador) y al `bcc` en cualquier ambiente.
- **Arreglo:** si `!isProd`: `to` = `MAIL_QA_REDIRECT_TO`, sin `bcc`, asunto con prefijo `[QA → destinatario-original]`. Si `MAIL_QA_REDIRECT_TO` está vacío → no enviar, solo `console.info` con destinatario y asunto, y devolver `{ ok: true, reason: 'qa_log_only' }`. Es el único punto de envío (verificar que no haya otro `nodemailer`/`sendMail`).
- **Prueba:** local con `APP_ENV=qa` y SMTP de prueba: confirmación de pedido → llega a `MAIL_QA_REDIRECT_TO`, no al comprador; sin la variable → solo log.
 · **24/11: CC `fe5bc89`**: guarda en sendEmail: redirect a MAIL_QA_REDIRECT_TO, sin bcc, asunto [QA→orig]; sin la var → qa_log_only

## S23 — ARCA: nunca producción fuera de PROD
- **Causa:** el ambiente (`'homo' | 'prod'`) llega a `lib/facturacion/wsaa.ts` (`obtenerToken`, l. ~41) y a `wsfev1.ts`; nada impide `prod` en QA. `ARCA_MOCK` es hoy igual en todos los contextos.
- **Arreglo:** si `!isProd` y el ambiente es `prod` → error claro (`ARCA producción bloqueado fuera de PROD`) en `obtenerToken` y en la emisión de `wsfev1`, antes de cualquier `fetch`. `app/api/arca/verificar` lo informa en su respuesta.
- **Prueba:** local `APP_ENV=qa`, `ARCA_MOCK=false`, negocio con ambiente `prod` → error sin llamada a ARCA; con `homo` o `ARCA_MOCK=true` → como hoy.

## S24 — CJ: sin pedidos reales fuera de PROD
- **Causa:** `lib/cj.ts:437` (`createCJOrder`) y `lib/cj-fulfillment.ts:58` (`attemptCJFulfillment`, lee `cj_auto_fulfill`). Hoy el único freno es `paypal_mode === 'live'` en `app/api/paypal/capture-order/route.ts:126`; revisar también `app/api/orders/online/[id]/confirm/route.ts`.
- **Arreglo:** si `!isProd`, `createCJOrder` lanza `CJ: pedidos bloqueados fuera de PROD` y `attemptCJFulfillment` sale antes (log). Consultas de catálogo, stock y fletes siguen andando.
- **Prueba:** local `APP_ENV=qa`, confirmar un pedido con `cj_auto_fulfill=true` → log de bloqueo, ninguna llamada a `createOrder`.

## S25 — Pagos: solo prueba fuera de PROD
- **Causa:** `lib/paypal.ts:10` (`paypalBase`) usa `live` si el setting `paypal_mode` lo dice. `lib/mp.ts:77` usa el `mp_access_token` del negocio, sea de prueba o real.
- **Arreglo:** PayPal: si `!isProd`, `paypalBase` devuelve siempre sandbox (y se loguea si el setting decía `live`). Mercado Pago: si `!isProd`, rechazar credenciales que no sean de prueba, **con el mismo control que Galplace P141** (mirar cómo se resolvió en `marketplace-api`: email de la cuenta de usuario de prueba). Error claro al iniciar el pago, no un pago real.
- **Prueba:** local `APP_ENV=qa`: `paypal_mode=live` → la llamada va a `api-m.sandbox.paypal.com`; token real de MP → rechazo; token de prueba → checkout de prueba OK.

## S26 — Mercado Libre: solo lectura fuera de PROD
- **Causa:** `lib/ml-service.ts:23` (`mlFetch`) es el punto común; escriben `createListing` (l. 221), `updateVariantStock`, `updateItemStock`, `pauseListing`, `activateListing`, `uploadImage`, y también `lib/ml-messages.ts` y `app/api/ml/answers`.
- **Arreglo:** si `!isProd`, todo método distinto de `GET` contra la API de ML se bloquea (en `mlFetch` y en cualquier `fetch` a ML que no pase por ahí) con log `ML: escritura bloqueada fuera de PROD`. Excepción: el refresh de token OAuth (`lib/ml-auth.ts`), que no modifica publicaciones.
- **Prueba:** local `APP_ENV=qa`: publicar o pausar → bloqueado y logueado; listar publicaciones → OK.

## S27 — Correo Argentino: ambiente de prueba fuera de PROD
- **Causa:** `lib/correo/correoArgentino.ts:80` toma `CORREO_ARGENTINO_ENV` (default `test`), pero podría quedar `prod` en QA.
- **Arreglo:** si `!isProd`, forzar `test` (log si la variable decía otra cosa).
- **Prueba:** local `APP_ENV=qa`, `CORREO_ARGENTINO_ENV=prod` → usa test.

## S28 — QA no indexable y sin GA4
- **Causa:** `app/layout.tsx:52-80` inyecta GA4 si el negocio tiene `catalog_ga4_measurement_id`; `app/robots.ts` permite rastrear la tienda; no hay `noindex`.
- **Arreglo:** si `!isProd`: sin GA4 (`app/layout.tsx` y cualquier otro `gtag`, ver `lib/analytics.ts`); `app/robots.ts` → `Disallow: /` para todo y sin `sitemap`; `robots: { index: false, follow: false }` en la metadata de `app/layout.tsx` y de `app/tienda/layout.tsx`. En PROD **nada cambia**.
- **Prueba:** local `APP_ENV=qa`: `/robots.txt` con `Disallow: /`, `<meta name="robots" content="noindex, nofollow">` en `/tienda`, sin `googletagmanager`. Con `APP_ENV=production`: igual que hoy. Pasar `doc/checklist-seo.md` en lo que toca a robots, sitemap y GA4 (CLAUDE.md lo exige para cambios en robots y medición).

## S29 — Selección de negocio en QA (hoja Q1, opción B)
- **Causa:** el negocio sale del host (`business_domains`). QA tiene un solo host (`qa--roi-pos.netlify.app`), así que hoy no resuelve ninguno. Hay dos puntos de resolución, los dos con atajo para localhost: `middleware.ts` paso 6 (`session.business_id ?? DEV_BUSINESS_ID`) y `lib/tenant-api.ts` (`resolveBusinessFromHost`, `DEV_BUSINESS_ID`), que usan el layout de la tienda, `robots`, `sitemap` y las APIs públicas (~19 archivos).
- **Arreglo:**
  - Solo si `isQa`: el negocio sale de la cookie `qa_business_id`; si no hay, de `QA_DEFAULT_BUSINESS_ID`. Validar que el id exista y tenga plan activo. **En PROD la cookie se ignora por completo.**
  - Aplicarlo en los dos puntos (middleware y `resolveBusinessFromHost`), sin tocar el camino de PROD ni el de localhost.
  - Página `/qa/negocio` (solo con `isQa`; en PROD 404): lista de negocios activos, elige uno → setea la cookie (`Path=/`, `SameSite=Lax`, `Secure`) → vuelve a `/`.
  - `middleware.ts`: con `isQa` no usar el cache `DOMAIN_STORE_PATH` (la clave es el host, quedaría fijo en el `/tienda` o `/store` del primer negocio); resolver el `store_path` según el negocio elegido.
- **Prueba:** local con `APP_ENV=qa` (host `localhost` cuenta como QA para esta prueba, o un host de prueba vía `hosts`): elegir MALEMA → `/tienda` en es-AR/ARS; elegir NULARIONE → `/store` en en-US/USD; panel con cada uno. Con `APP_ENV=production` y la cookie puesta → se ignora.

## S30 — URL base de la tienda en QA
- **Causa:** `lib/store-base-url.ts` (`getStoreBaseUrl`) usa `catalog_base_url` → dominio `is_primary` → host. En QA (opción B) el dominio principal sigue siendo el real: canónicas, sitemap, Open Graph y los links de los mails (`lib/email-order.ts:107` y `:187`, llamados con host `''`) apuntarían a `malema.com.ar`.
- **Arreglo:** si `isQa`, devolver `NEXT_PUBLIC_BASE_URL` (la URL de QA), sin barra final. En PROD, igual que hoy.
- **Prueba:** local `APP_ENV=qa`: canónica de una ficha, `sitemap.xml` y link del mail de confirmación → URL de QA.

## S31 — Banda "AMBIENTE DE PRUEBA"
- **Arreglo:** si `isQa`, banda fija arriba en tienda y panel: `AMBIENTE DE PRUEBA · <nombre del negocio> · cambiar` (link a `/qa/negocio`). Texto desde `messages/` (es/en), no escrito a mano. En PROD no se renderiza nada.
- **Prueba:** local `APP_ENV=qa` se ve en tienda y panel; `production` no.

## S32 — `scripts/restaurar-qa.ps1` + `db/qa-restore/` — hoja Q8
- **Causa:** en ROIPOS los secretos de `settings` (`is_secret = true`) están **en texto plano** (en Galplace estaban cifrados). Una copia de PROD en QA trae tokens reales de MP, PayPal, CJ, ML y SMTP listos para usar.
- **Arreglo:** copiar de Galplace `restaurar-qa.ps1` (`-Simular`, `-Dump`, `-SinBackupQA`, `-SoloPerfiles`, último dump por fecha, backup de QA antes, `pg_restore --clean --if-exists --no-owner --exit-on-error`, limpieza de variables). Guarda contra PROD: lee `QA_PROJECT_REF` de `secrets\.env.qa` y **se niega** si la conexión no tiene ese ref. Restore y `10-adaptar-qa.sql` en la **misma corrida**, sin pausa entre medio.
  - **`db/qa-restore/10-adaptar-qa.sql`** (una transacción):
    - `business_domains`: agregar sufijo `.qa-off` a todos los dominios (`domain` es `UNIQUE`).
    - `settings`: vaciar valor de `catalog_base_url`, `catalog_ga4_measurement_id`, `catalog_pinterest_verify`, `catalog_token` (regenerar) y de **todo** `is_secret = true`; además `mp_access_token`, `mp_public_key`, `paypal_client_id`, `paypal_client_secret`, `cj_api_key`, `cj_api_email`, `ml_access_token`, `ml_refresh_token`, `ml_app_secret`, `ml_app_id`, `ml_user_id`, `ml_token_expires`, `email_smtp_user`, `email_smtp_pass`, `correo_argentino`. Forzar `paypal_mode = 'sandbox'`, `cj_auto_fulfill = 'false'`, `ml_enabled = 'false'`, `email_enabled = 'false'`. Revisar contra la base si hay más claves de credenciales (por nombre: `token`, `secret`, `key`, `pass`).
    - `wsaa_tokens`: vaciar. Revisar si hay otras tablas con certificados o tokens de ARCA y vaciarlas.
    - Control final (`SELECT`): dominios (todos con `.qa-off`), cantidad de negocios/productos/ventas, y **0 filas** con credenciales no vacías.
  - **`db/qa-restore/20-perfiles-roi.sql`:** usuario de ROI con acceso total a los negocios de prueba, sin ids fijos, idempotente. **Probarlo contra una base restaurada** antes de darlo por hecho (en Galplace falló dos veces por columnas inexistentes).
- **Prueba:** `-Simular` OK; ROI corre contra `roipos-qa` dos veces seguidas sin error; control final con 0 credenciales; con la URL de PROD el script se niega.

---

# Migraciones automáticas en el build (agregado 24/11, decisión de ROI) — hoja Q9

**Decisión:** foto del esquema de PROD al 24/11 como **baseline** y, de ahí en adelante, migraciones numeradas que corren **solas en el build de Netlify** (QA al hacer push a `qa`, PROD al hacer push a `main`). En local las corre ROI a mano. Misma lógica que Galplace: `C:\apps\marketplace\marketplace-api\database\migrate.ts` y su `netlify.toml` (`npm run build && npm run migrate`).

**Ojo, consecuencia que hay que dejar escrita:** con el auto publish bloqueado, el build de `main` **corre las migraciones en PROD al construir, antes del *Publish deploy***. Mientras tanto sigue publicado el código viejo. Por eso toda migración tiene que ser **compatible con el código que está publicado**: agregar columnas/tablas/índices sí; borrar o renombrar, en dos pases (primero el código deja de usarlo, después la migración lo borra).

## S33 — Runner de migraciones (`db/migrate.mjs`) y build
- **Causa:** hoy se corren a mano con `db/scripts/run_migration.mjs` (un archivo por vez, sin registro) y se mueven a mano a `ejecutadas/`. No hay forma de saber qué tiene aplicado cada base.
- **Arreglo:**
  - `db/migrate.mjs` (ESM, solo `pg`, sin dependencias nuevas), copia de la lógica de Galplace: `schema_migrations (version text PK, applied_at timestamptz default now())`; lee `db/migrations/*.sql` (solo ese nivel, no subcarpetas) ordenados por nombre; cada archivo en `BEGIN/COMMIT` con su registro; si falla, `ROLLBACK`, mensaje con el archivo y salida ≠ 0. Se puede correr dos veces seguidas sin aplicar nada.
  - Conexión: la **misma** que `lib/db.ts` (`DB_HOST`/`DB_*` si existe, si no `DATABASE_URL`), con ssl si no es localhost. Imprimir solo el ambiente y el *ref* (como S21), nunca la URL.
  - **Guarda de la baseline:** si `000_baseline_*.sql` no está en `schema_migrations` y la tabla `business` ya existe → **error y salida ≠ 0** (`Base existente sin baseline registrada: correr db/scripts/adoptar-baseline.sql`). Así nunca se ejecuta la baseline sobre PROD o QA.
  - **Guarda local (Galplace P157):** fuera del build de Netlify (`process.env.NETLIFY !== 'true'`) solo acepta `localhost`/`127.0.0.1`; cualquier otro host → error. Las bases remotas se migran **solo** desde el build.
  - `package.json`: `"migrate": "node db/migrate.mjs"`. En local: `node --env-file=.env.local db/migrate.mjs` (o el `.env` que use ROI; documentarlo en el encabezado del archivo).
  - `netlify.toml`: `command = "npm run build && npm run migrate"`.
  - Sin `CREATE INDEX CONCURRENTLY` ni nada que no pueda ir dentro de una transacción (avisar en el encabezado).
- **Prueba:** base local vacía → aplica la baseline y las siguientes; segunda corrida → "No hay migraciones pendientes"; base local con tablas y sin `schema_migrations` → error de la guarda; `DB_HOST` remoto fuera de Netlify → error.

## S34 — Baseline del esquema al 24/11
- **Arreglo:**
  - Agregar a `scripts/backup-prod.ps1` (S19) el modo `-SoloEsquema`: `pg_dump --schema-only --schema=public --no-owner --no-privileges` → `db/migrations/000_baseline_20261124.sql`. Limpiar lo que no corre en una base nueva (`CREATE SCHEMA public`, `SET` de Supabase que fallen fuera de Supabase), y que la primera línea sea un comentario con fecha y origen. Lo corre ROI.
  - Las dos pendientes `20261111_branches_store_code.sql` y `20261111_store_pages_devoluciones.sql`: **ROI confirma si ya están en PROD**. Si están, quedan dentro de la baseline y van a la carpeta histórica; si no, pasan a ser `001_…` y `002_…` (idempotentes).
  - Mover a `db/historico/` (fuera de `db/migrations/`): `db/migrations/ejecutadas/`, `db/schema-2026-08-05.sql`, `db/esquemas anteriores/`, `basededatosDDL.txt`, y `db/scripts/run_migration.mjs` (reemplazado por S33). `git mv`, sin borrar.
  - Desde acá: `NNN_descripcion.sql` (3 dígitos, siguiente libre), idempotentes (`IF NOT EXISTS`), comentario `-- S##` al inicio. Una migración aplicada en PROD **no se edita**.
- **Prueba:** base local vacía + `npm run migrate` → esquema igual al de PROD (comparar `pg_dump --schema-only` de las dos, sin diferencias salvo `schema_migrations`).

## S35 — Adoptar la baseline en PROD y QA (script para ROI)
- **Arreglo:** `db/scripts/adoptar-baseline.sql`, para que ROI lo corra **una vez** en PROD (y en QA si no viene en la copia de PROD): (a) diagnóstico solo `SELECT` (existe `business`, existe o no `schema_migrations`); (b) `BEGIN;` crear `schema_migrations` si no existe e insertar `000_baseline_20261124.sql` (y `001`/`002` solo si S34 dijo que ya estaban en PROD) con `ON CONFLICT DO NOTHING`, **sin `COMMIT`**; (c) verificación (`SELECT * FROM schema_migrations`). Backup previo (S19).
  - `restaurar-qa.ps1` (S32): la copia de PROD ya trae `schema_migrations`; al final, avisar qué migraciones de `qa` faltan y que un *Retry deploy* de QA las aplica (como Galplace `restaurar-qa.md` §6).
- **Prueba:** en una base local restaurada desde un backup de PROD: script → `npm run migrate` no aplica la baseline y aplica solo las nuevas.

## S36 — Forma de trabajo
- **Arreglo:** `CLAUDE.md`, sección *Base de datos*: reemplazar "Migraciones: `db/migrations/` (las corridas se mueven a `ejecutadas/`)" por la regla nueva (S33–S35: numeración, idempotentes, compatibles con el código publicado, QA al push de `qa`, PROD al build de `main` antes del *Publish*, local a mano con `npm run migrate`, nunca contra una base remota desde la consola). En la hoja (`2026-11-18-hoja-de-ruta-qa.md`) Q9: tachar la alternativa "se corren a mano" y apuntar a S33–S35.
- **Orden de puesta en marcha (para ROI, dejarlo escrito en S36):** 1) S19 backup de PROD → 2) S34 baseline → 3) S35 `adoptar-baseline.sql` en PROD con `COMMIT` → 4) push de `qa` (QA vacía: el build crea el esquema desde la baseline; después la restauración S32 la pisa) → 5) recién entonces el primer merge a `main` con el `netlify.toml` nuevo (si PROD no adoptó la baseline, la guarda de S33 frena el build y no pasa nada).
