# Migración a producción — refactor Cuentas/Fops/Transactions

**Fecha objetivo:** 2 o 3 de julio de 2026 (confirmar antes de ejecutar, aunque ya haya llegado la fecha).

Este doc es el checklist para no perder nada el día de la migración. Todo lo de
acá fue verificado **solo en local** hasta ahora — nada de esto se corrió ni
desplegó en producción todavía.

## 1. Qué incluye esta migración

### Schema (`database/migrate.sql`, idempotente, ya probado en local)
- v9: tabla `business` + `business_id` en todas las tablas de negocio (aditivo,
  default 1, no rompe nada existente) + tablas `accounts`/`fops`/`transactions`
  + carga de cuentas/fops iniciales (2 por sucursal + 1 Caja Central).
- v10: backfill histórico de `transactions` desde `sales`/`daily_expenses`/
  `exchanges`/`cash_transfers`/`purchases`. Supuesto documentado en el script:
  las compras históricas se asumen pagadas desde "Efectivo Caja Central"
  (no hay forma de saberlo con certeza — dejarlo auditable).
- v11: corrección de `created_at` en las transactions backfilleadas.

### Código (todo sigue **sin commitear** a esta fecha — revisar con `git status`)
Escritura en vivo de `transactions` agregada a:
- `app/api/sales/route.ts`
- `app/api/expenses/route.ts`
- `app/api/exchanges/route.ts`
- `app/api/cash-transfers/route.ts`
- `app/api/purchases/route.ts`

Lectura desde `transactions` en vez del UNION ALL viejo:
- `app/api/reports/cash-flow/route.ts` + `components/cash-flow-report.tsx`

ABM de Cuentas/Fops (nuevo, `/configuracion` → tab "Cuentas"):
- `app/api/accounts/`, `app/api/fops/` (GET/POST/PATCH/DELETE)
- `components/settings-panel.tsx` (`CuentasTab`, `AccountDialog`, `FopDialog`)

POS conectado a `fops.use_for_sales` por sucursal (en vez de los 5 métodos
hardcodeados):
- `lib/payment-methods.ts` (nuevo)
- `components/pos-terminal.tsx`, `components/exchange-dialog.tsx`

Reportes nuevos (verificar alcance antes de migrar — no se auditaron a fondo
en esta ronda de trabajo):
- `app/api/reports/accounts/`, `app/api/reports/expenses/`, `app/api/reports/sales/`
- `components/accounts-report-tab.tsx`, `components/expenses-report-tab.tsx`, `components/sales-report-tab.tsx`

Otros: `lib/db.ts` (modificado), `lib/transactions.ts` (nuevo, `PAYMENT_FOP_MAP`/`getFopId`/`insertTransaction`).

## 2. Bug ya encontrado y corregido en local (2026-06-23)

El fop de efectivo de la sucursal Malema 197 había quedado seedeado como
`"Cash"` en vez de `"Efectivo"` — rompía 10 de 17 filas del reporte de caja
(las mostraba en $0) y hubiera ocultado la opción "efectivo" del POS en esa
sucursal. Corregido renombrando el fop vía API. Como mitigación, **ya no se
puede editar el `name` de un fop una vez creado** (`app/api/fops/[id]/route.ts`
+ `FopDialog` en `settings-panel.tsx`) — solo se define al crearlo.

**Antes de migrar a producción: correr el mismo chequeo de consistencia que se
usó para encontrar este bug**, contra los datos reales de prod después de
correr `migrate.sql`:

```sql
-- cualquier mismatch acá es la misma clase de bug
SELECT * FROM (
  -- pegar la query de cash-flow/route.ts con un rango amplio de fechas
) x WHERE ABS((efectivo+debito+credito+mp+transferencia) - total) > 0.01;
```

## 3. Fuera de alcance (deliberadamente, fase aparte post-migración)

No tocar esto ahora — es un rediseño más grande, decidido el 2026-06-23:

- Sacar `payment_method`/`payment_split` de `sales`/`daily_expenses`/`exchanges`
  (hoy se escriben en paralelo a `transactions`, no derivados de ahí — es la
  causa raíz de que el nombre del fop esté hardcodeado en 3+ lugares).
- Cambiar el pago dividido del POS de `Partial<Record<PayMethod,string>>` a
  `{fop_id, amount}[]`.
- Reescribir `getFopId`/`insertTransaction` para recibir `fop_id` directo.
- Reescribir `app/api/pos/sessions/route.ts` (hoy recalcula totales leyendo
  `sales.payment_method`, una 3ª reimplementación de la misma lógica).
- Pivot dinámico por fop en `cash-flow-report.tsx` (hoy son 5 columnas fijas).
- Unificar `PAY_ICONS`/`PAY_LABELS`/`PAY_COLORS` (duplicados en
  `sales-report-tab.tsx` y `today-sales-dialog.tsx`), idealmente basados en
  `accounts.type` en vez del nombre del fop.
- Mover `business_name`/`business_logo`/etc. de `settings` a `business`.
- Corregir `branches.is_default` (hoy es un singleton global, no por negocio).
- Endurecer autenticación (JWT, sesión firmada/HttpOnly).

## 4. Checklist del día de la migración

1. **Confirmar explícitamente con el usuario** antes de tocar producción,
   aunque ya sea 2 o 3 de julio.
2. Backup de la base de producción.
3. Commitear y revisar el diff completo de todo lo listado en la sección 1
   (hoy está todo sin commitear).
4. Correr `database/migrate.sql` contra producción (es idempotente, pero
   revisar el resultado de cada bloque igual).
5. Correr el chequeo de consistencia de la sección 2 contra los datos reales.
6. Confirmar que todas las sucursales con ventas tienen sus `accounts`/`fops`
   esperados (en local, la sucursal "Deposito" no tiene cuentas — confirmar
   si eso es correcto en prod o si esa sucursal vende y necesita las suyas).
7. Deployar el código.
8. Smoke test en prod: una venta de prueba con pago simple, una con pago
   dividido, un gasto, un retiro, y confirmar que aparecen correctamente en
   Movimientos de Caja y en el ABM de Cuentas.
9. Confirmar con el usuario que todo se ve bien antes de dar por cerrada la
   migración.

## 5. Referencias

Memoria de la sesión (fuera del repo): `project_roipos_prod_migration_date.md`
y `project_roipos_accounts_fops_abm_pending.md` en el sistema de memoria de
Claude — tienen el mismo contenido resumido, este doc es la versión completa
y la que vive con el código.
