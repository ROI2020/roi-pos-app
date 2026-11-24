# Hoja de ruta — ambiente QA para ROIPOS (18/11/2026)

Escrita por Claude (Cowork, proyecto Galplace) con lo aprendido al armar y operar QA de Galplace (oct–nov 2026). Para ejecutar en una sesión del proyecto ROIPOS. Antes de empezar, leé `CLAUDE.md` (forma de trabajo) y `C:\apps\marketplace\marketplace-docs\reference\ambientes-netlify.md` (cómo se armó QA de Galplace, con errores conocidos).

**Objetivo:** que ningún cambio llegue a los negocios reales (MALEMA, NULARIONE, …) sin haberse probado antes en una copia completa: misma app, base aparte, integraciones en modo prueba.

**Hoy:** una sola rama `main`; cada push publica PROD en Netlify; las pruebas se hacen en local o directo en PROD.

**Numeración:** los pasos son `Q1…Q12`. Cada uno con su prueba. ROI tacha al terminar; CC anota sus commits como en `S##`.

---

## Lecciones de Galplace que aplican acá (no repetir)
| Lección | Caso |
|---|---|
| Un push a la rama de QA no puede publicar PROD, y el deploy de PROD tiene que ser un paso aparte y manual | Galplace: `qa` = branch deploy (0 créditos), `master` = Publish deploy a mano |
| Las variables de entorno van **por contexto** en Netlify (Production / Branch `qa`), nunca un `.env` copiado | ambientes-netlify.md §4 |
| Una copia de PROD en QA trae **credenciales reales cifradas o en texto**: hay que borrarlas o reemplazarlas por las de prueba **antes** de usar QA | restaurar-qa (Galplace) |
| QA no puede mandar mails a clientes reales ni facturar ni comprar de verdad | P157 y CU-064 §5.7 |
| Tests y scripts nunca en una consola con variables de PROD; los scripts limpian `DATABASE_URL`/`APP_ENV`/`NODE_ENV` al empezar y terminar | **P157: los tests escribieron en PROD** |
| Las imágenes con `Cache-Control: immutable` se ven "cruzadas" después de restaurar QA: hacer deploy nuevo y abrir en incógnito | restaurar-qa (Galplace) |
| Backup automático de PROD antes de cada pase que toque base | `pase.ps1` (Galplace) |
| Cada consulta SQL nueva se prueba contra una base real antes de QA | P156, P161, P163 |
| Los branch deploys tienen que ser **públicos** (Visitor access → Public); si no, la tienda da 500 | ambientes-netlify.md §8, error 4 |
| No cargar `NODE_ENV` en Netlify, y ninguna variable puede quedar **vacía** en Production | ambientes-netlify.md §8, errores 1 y 8 |

---

## Q1 ✅ — Decisiones previas (ROI, sin código) — **decidido 18/11** 
- **Base de QA:** proyecto Supabase **gratis** `roipos-qa` (São Paulo), en la misma organización que PROD (hoy PROD es el único proyecto activo; PROD pesa 41 MB de 500). Copia **completa** de PROD, no reducida.
  - Ojo: el límite de 2 proyectos gratis se cuenta en **todas** las organizaciones donde ROI es Owner/Admin (los pausados no cuentan); crear otra organización no da más lugar.
  - Un proyecto gratis se **pausa** tras 1 semana sin uso: reactivarlo desde el panel antes de probar (Q12).
  - PROD también está en plan gratis → **sin backups automáticos de Supabase**: el backup de Q7 es la única copia. Por eso Q7 va justo después de Q2.
  - Misma versión mayor de Postgres que PROD (para que `pg_restore` no falle).
- **Cómo se elige el negocio en QA:** **opción B** (igual que Galplace): un solo host `qa--<sitio>.netlify.app`, branch deploy de `qa` en el mismo sitio de ROIPOS (0 créditos, sin DNS). El negocio se elige con un **selector solo en QA** (cookie `qa_business_id`, por navegador: MALEMA en una ventana y NULARIONE en incógnito) y, si no hay cookie, `QA_DEFAULT_BUSINESS_ID`. Ver Q4.8.
  - Descartada la A: los *branch subdomains* de Netlify solo usan el dominio principal del sitio y requieren Netlify DNS (`qa.nularione.com` no se puede); la única forma sería un sitio aparte con `qa` como producción → 15 créditos por push.
  - Lo que B no prueba es la resolución por dominio real (`business_domains`): se cubre con un test local de `resolveBusinessFromHost` (Q11).
- **Integraciones en QA** — confirmar que todas tengan modo prueba (ver Q6). Si alguna no lo tiene (CJ, Correo Argentino), queda **apagada** en QA.
- **Pendiente (ROI):** ¿algún servicio externo (cron-job.org o similar) llama a ROIPOS (sync de CJ, ML, …)? Si sí, en QA apagado o apuntando a QA.

## Q2 ✅ — Rama `qa` y deploy de QA en Netlify
1. `git checkout -b qa && git push -u origin qa` (ROI).
2. Netlify › sitio de ROIPOS › *Build & deploy* › *Branches and deploy contexts*: Production branch `main`; Branch deploys: **solo `qa`**; Deploy Previews: *Don't deploy*.
3. **Desactivar el auto publish de producción** (Deploys › *Stop auto publishing*): así un merge a `main` construye pero **no publica** hasta tocar *Publish deploy*. (Igual que Galplace.)
4. *General › Visitor access › Customize › **Public*** (si no, Netlify protege los branch deploys y la tienda da 500 — Galplace error 4).
- **Prueba:** un commit vacío en `qa` publica `qa--…netlify.app`, se abre en incógnito sin login de Netlify y **no** cambia PROD.

## Q3 ✅ — Variables de entorno por contexto
En Netlify, cada variable con un valor para **Production** y otro para **Branch deploys / `qa`**:

| Variable | QA |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` **y** `DATABASE_URL` — **todas** por contexto | **Transaction pooler 6543** de `roipos-qa` (el 5432 / session pooler es solo para scripts desde la PC). ⚠ `lib/db.ts` usa `DB_HOST` si existe y recién si no `DATABASE_URL`: si `DB_*` de PROD quedan en "todos los contextos", **QA escribe en PROD**. Contraseña con `/ @ # ? %` → `encodeURIComponent` |
| `DB_POOL_MAX` (nueva) | `2` (hoy `lib/db.ts` no limita el pool: `pg` usa 10) |
| `APP_ENV` (nueva) | `qa` (en PROD: `production`) |
| `QA_DEFAULT_BUSINESS_ID` (nueva) | id de MALEMA en QA (en PROD: no cargarla) |
| `MAIL_QA_REDIRECT_TO` (nueva) | mail de ROI (en PROD: si el plan obliga a cargarla, un mail válido, **nunca vacía**; PROD la ignora) |
| `NEXT_PUBLIC_BASE_URL` | URL de QA |
| `ARCA_AMBIENTE` | **homologación** (nunca producción) |
| `ARCA_MOCK` | `true` al principio; `false` solo para probar contra homologación |
| `ARCA_CERT_PEM` / `ARCA_KEY_PEM` | certificado de **homologación** (no el de producción) |
| `MP_ACCESS_TOKEN` / `MP_PUBLIC_KEY` | credenciales de prueba de MP |
| `CORREO_ARGENTINO_ENV` | ambiente de prueba (o integración apagada) |
| `PAYPAL_WEBHOOK_ID` | el del webhook de **sandbox** |
| `INTERNAL_API_KEY`, `FACTURACION_API_KEY` | valores **distintos** a PROD |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | el mismo client, con los orígenes de QA agregados en Google Cloud (o uno aparte de QA) |
| `PRINT_SERVER_URL` | vacío o el de pruebas |
| `NEXT_PUBLIC_APP_VERSION` | la versión + `-qa` |
- **Aprendido 24/11:** el host del pooler de Supabase es **el mismo** para QA y PROD (misma región): lo que elige el proyecto es `DB_USER` = `postgres.<ref>` (no `postgres` a secas) + `DB_PASSWORD`. Esas dos **tienen** que tener valor de QA. Un valor cargado para la rama `qa` le gana al de *Branch deploys*. Cambio de variables → *Retry deploy*. Prueba que distingue la base: el log de Functions con base QA vacía dice `relation "business_domains" does not exist` (con PROD diría `Dominio no registrado…`). Vaciar el contexto *Local development* (hoy tiene valores de PROD).
- **No cargar `NODE_ENV`** en ningún contexto. **Ninguna variable vacía en Production** (Galplace error 8: tiró toda la API).
- **Prueba:** `/api/healthcheck` en QA muestra `APP_ENV = qa` y el *project ref* de `roipos-qa` (agregar esos dos datos al healthcheck si no están, sin mostrar URLs ni contraseñas). En PROD, el ref de PROD.

## Q4 — Guardas en el código para QA (CC)
1. `lib/env.ts` (nuevo): `APP_ENV` (`development` · `qa` · `production`), `isProd`, `isQa`. Todas las guardas usan `APP_ENV`, **nunca `NODE_ENV`** (en QA `NODE_ENV` también vale `production`). Revisar los usos actuales: `lib/db.ts:43` (ssl) y `app/api/ml/webhook/route.ts:107`.
2. **Mail:** si no es PROD, todo mail va a `MAIL_QA_REDIRECT_TO` (o solo al log si está vacío). Nunca a clientes reales. (`lib/email.ts`)
3. **ARCA:** si no es PROD, rechazar `ARCA_AMBIENTE` de producción al arrancar (error claro en el log y en `/api/arca/verificar`).
4. **CJ:** si no es PROD, `cj_auto_fulfill` y cualquier pedido real a CJ quedan **bloqueados** (solo consultas de catálogo y fletes).
5. **Pagos:** si no es PROD, PayPal solo `sandbox` aunque el setting diga `live`; Mercado Pago rechaza credenciales que no sean de prueba o de usuario de prueba (mismo control que Galplace P141: el email de la cuenta).
6. **Mercado Libre:** si no es PROD, no publicar ni modificar publicaciones reales (solo lectura o apagado).
7. **GA4 / feeds:** si no es PROD, no inyectar GA4 y `robots.txt` con `Disallow: /` + `noindex` en todas las páginas (que Google no indexe QA).
8. **Negocio en QA (Q1-B):**
   - `middleware.ts` (paso 6) y `resolveBusinessFromHost` (`lib/tenant-api.ts`): hoy tienen un atajo para localhost (`DEV_BUSINESS_ID`); extenderlo a "localhost **o** (`isQa` y host de QA)" → cookie `qa_business_id` → `QA_DEFAULT_BUSINESS_ID`. Solo con `isQa`: en PROD la cookie se ignora.
   - Selector de negocio solo en QA (página o desplegable que setea la cookie).
   - `getStoreBaseUrl` (`lib/store-base-url.ts`): en QA devolver la URL de QA. Si no, canónicas, sitemap, Open Graph y los links de los mails (`lib/email-order.ts` lo llama con host `''`) apuntan a `malema.com.ar`.
   - Cache `DOMAIN_STORE_PATH` del middleware (clave = host): en QA no usarla (si no, el `/` queda fijo en `/tienda` o `/store` del primer negocio).
9. **Banda "AMBIENTE DE PRUEBA"** en tienda y panel cuando `isQa`, con el nombre del negocio elegido.
- **Prueba:** test por cada guarda (con base local), y en QA: compra de prueba → el mail llega a la casilla de pruebas, no al comprador.

## Q5 — Base de QA inicial
1. Restaurar el último backup de PROD en `roipos-qa` (ver Q8, script) o, la primera vez, a mano con `pg_restore`.
2. Aplicar el **SQL de adaptación** (Q8 paso 4).
3. `business_domains`: dominios reales desactivados (Q8) — con Q1-B el negocio sale del selector, no del dominio.
- **Prueba:** la tienda de QA muestra los productos de MALEMA; el panel de QA entra con la cuenta de ROI.

## Q6 — Integraciones en modo prueba
| Integración | En QA |
|---|---|
| **ARCA** (factura electrónica) | homologación, con certificado de homologación; `wsaa_tokens` de PROD **borrados** |
| **Mercado Pago** | credenciales de prueba por negocio; webhook de prueba apuntando a QA |
| **PayPal** | `paypal_mode = sandbox`, client de sandbox; webhook sandbox → QA |
| **CJ Dropshipping** | sin pedidos reales (Q4.4); si CJ no tiene sandbox, la integración queda en solo lectura |
| **Correo Argentino** | ambiente de prueba o apagado |
| **Mercado Libre** | app de prueba o apagado |
| **Mail SMTP** | redirigido (Q4.2) |
| **GA4 / Merchant Center / feeds** | apagados (no registrar el feed de QA en ningún catálogo) |

## Q7 — Backup de PROD automático (adelantado: va después de Q2; PROD no tiene backups de Supabase)
Copiar de Galplace `marketplace-docs/scripts/pase.ps1` la parte de backup (`-SoloBackup`, verificación de tamaño y `pg_restore -l`, limpieza de variables) a `scripts/backup-prod.ps1`, leyendo `C:\apps\roipos\roipos-app\secrets\.env.bck.prod` (fuera de git, agregar `secrets/` a `.gitignore`) con `DATABASE_URL_PROD`, `PG_BIN`, `BACKUP_DIR`.
- **Prueba:** `-Simular` y un backup real que dé "Backup OK".

## Q8 — `scripts/restaurar-qa.ps1`
Copiar de Galplace `marketplace-docs/scripts/restaurar-qa.ps1` (con `-Simular`, `-Dump`, `-SinBackupQA`, `-SoloPerfiles`, guarda contra PROD por `QA_PROJECT_REF`, último dump por fecha, backup de QA antes, `--exit-on-error`, limpieza de variables). Adaptar los SQL de `db/qa-restore/`:
- **`10-adaptar-qa.sql`** (en transacción):
  - `business_domains`: desactivar los dominios reales (por ejemplo, sufijo `.qa-off`; `domain` es `UNIQUE`) para que nada en QA resuelva a un dominio de PROD.
  - `settings`: vaciar `catalog_base_url` de todos los negocios (si no, canónicas y links apuntan a PROD).
  - **Borrar credenciales** de todos los negocios: `mp_access_token`, `mp_public_key`, `paypal_client_id`, `paypal_client_secret` (y `paypal_mode = 'sandbox'`), `cj_api_key`, `cj_api_email`, `cj_auto_fulfill = false`, `ml_*` (tokens, app secret, `ml_enabled = false`), `email_smtp_*` (y `email_enabled = false` o redirigido), `catalog_token` (regenerar), `catalog_ga4_measurement_id`, `correo_argentino` y cualquier setting marcado secreto.
  - `wsaa_tokens`: vaciar.
  - Colas y logs con datos de terceros que no hacen falta (notificaciones, envíos de mail pendientes).
  - Control final (`SELECT`): dominios, cantidad de negocios/productos/ventas, **0 credenciales**.
- **`20-perfiles-roi.sql`:** usuario de ROI con todos los roles en los negocios de prueba (sin ids fijos, idempotente; respetar los índices únicos reales — en Galplace falló dos veces por columnas que no existían: probar contra una base restaurada antes de usarlo).
- ⚠ En ROIPOS los secretos de `settings` (`is_secret = true`) están en **texto plano** (en Galplace estaban cifrados): el restore y `10-adaptar-qa.sql` van en el **mismo script**, antes de que el sitio de QA apunte a esa base. Los `.dump` son secretos: fuera de git y de carpetas compartidas.
- **Prueba:** correr dos veces seguidas sin error; QA sin ninguna credencial real.

## Q9 — Pase a PROD
`scripts/pase.ps1` a partir del de Galplace, para un solo repo: controles (rama `qa`, sin cambios, `qa` = `origin/qa`, tag nuevo), **backup de PROD** (Q7), versión en `package.json` (hoy `0.1.0`: empezar en `1.0.0`), merge `qa → main`, tag `vX.Y.Z`, vuelta a `qa`. Publicar en Netlify a mano (*Publish deploy*).
- ~~Las **migraciones**: hoy se corren a mano (`db/scripts/run_migration.mjs` / `db/migrations/ejecutadas/`).~~ **Resuelto en S33–S35:** migraciones automáticas en el build (`db/migrate.mjs`, `netlify.toml`). QA al push de `qa`, PROD al build de `main`. Ver `CLAUDE.md` §Base de datos y migraciones.
- **Prueba:** `-Simular` con todo OK.

## Q10 — Forma de trabajo actualizada
Actualizar `CLAUDE.md`: se trabaja en **`qa`**, CC no hace push ni toca `main`; todo `S##` se prueba en QA antes del pase; `doc/` con la regla de commits; tests (si se agregan) solo contra base local con la guarda de Galplace P157 (`pool` que se niega a cualquier host que no sea `localhost` bajo el runner de tests).

## Q11 — Primeros tests (opcional pero recomendado)
Vitest + base local `roipos_test`, con la guarda de P157 desde el primer día. Empezar por lo que más duele si se rompe: checkout de la tienda, feeds (`/api/v1/feeds/*`), sitemap/robots, facturación con `ARCA_MOCK`. Regla de Galplace: toda ruta con SQL nuevo lleva un test que la ejecute.

## Q12 — Checklist del primer uso
- [ ] `roipos-qa` activa en Supabase (se pausa tras 1 semana sin uso).
- [ ] QA publica solo desde `qa`, es pública (sin login de Netlify); PROD solo con *Publish deploy*.
- [ ] Healthcheck de QA con `APP_ENV = qa` y el ref de `roipos-qa`.
- [ ] Selector de negocio: MALEMA y NULARIONE en QA, cada una con su idioma y moneda; canónicas y links con la URL de QA.
- [ ] En QA: compra con MP de prueba, con PayPal sandbox y con transferencia; el mail va a la casilla de pruebas.
- [ ] En QA: factura en homologación (o mock); ninguna factura real.
- [ ] En QA: ningún pedido a CJ ni publicación en Mercado Libre.
- [ ] En QA: `robots.txt` con `Disallow: /`, sin GA4.
- [ ] `restaurar-qa.ps1` corrido dos veces; QA sin credenciales reales.
- [ ] `pase.ps1 -Simular` OK; backup automático OK.
- [ ] `doc/checklist-seo.md` corrido en QA antes del primer pase.


## Q13 — Revisar las variables de entorno contra el código (pedido de ROI, 24/11, después de Q12)
ROIPOS es multi-negocio: varias credenciales viven en `settings` por negocio y no deberían estar en Netlify. Primer relevamiento (24/11, `process.env.*` en `app/`, `lib/`, `middleware.ts`):
- En Netlify pero **no usadas** en el código: `MP_PUBLIC_KEY`, `ARCA_CUIT_ROISOL` (se usa solo `NEXT_PUBLIC_ARCA_CUIT_ROISOL`).
- `MP_ACCESS_TOKEN`: es un *fallback* global de `lib/mp.ts` cuando el negocio no tiene token propio. En multi-negocio, un negocio sin configurar cobraría con la cuenta global: decidir si se borra en PROD.
- ⚠ `PAYPAL_WEBHOOK_ID`: el código lo usa (`app/api/webhooks/paypal/route.ts:115`) pero **no está en Netlify** → hoy PROD **no verifica la firma** de los webhooks de PayPal (solo deja un warning). Revisar antes, no esperar a Q13.
- Usadas y no vistas en la lista de Netlify: `CORREO_ARGENTINO_API_KEY`, `CORREO_ARGENTINO_ENV`, `PRINT_SERVER_URL`, `NEXT_PUBLIC_APP_VERSION`, `NEXT_PUBLIC_BUILD_DATE`, `DATABASE_URL` (solo si no hay `DB_HOST`), `DEV_BUSINESS_ID` (solo local).
- Contexto *Local development* y *Deploy Previews* con valores de PROD: vaciarlos.

---

**Orden sugerido:** Q1 ✔ → Q2 → **Q7** → Q3 → Q4 (guardas, **antes** de cargar datos reales en QA) → Q8 → Q5 → Q6 → Q9 → Q10 → Q12; Q11 en paralelo.
