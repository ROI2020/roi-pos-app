# Fix: rename active_plan_id → active_subscription_id + bugs de creación y routing

**Fecha:** 2026-07-18  
**Tipo:** fix + refactor DB  
**Autor:** ROI2020  

---

## Contexto

`business.active_plan_id` era un nombre confuso: suena como si apuntara a `plans.id`,
pero en realidad es FK a `business_plan.id` (el registro de suscripción activa).
Esto provocó múltiples bugs donde el código intentaba usar el valor como `plans.id`.

---

## Cadena FK correcta

```
business.active_subscription_id  →  business_plan.id
business_plan.plan_id             →  plans.id
```

Para obtener el `plans.id` de un negocio:
```sql
SELECT p.id
FROM business b
JOIN business_plan bp ON bp.id = b.active_subscription_id
JOIN plans p          ON p.id  = bp.plan_id
WHERE b.id = $1
```

---

## Bugs corregidos

| # | Síntoma | Causa | Fix |
|---|---|---|---|
| 1 | Sesión con `plan_id=3` en vez de `10` | Login query leía `b.active_plan_id` (=3, subscription id) directo | JOIN via `business_plan` para obtener `plans.id` real |
| 2 | FR layout siempre redirige a `/login` | Comparaba `business_plan.id` (3) contra `plans.id` (10) | Query con JOIN correcto |
| 3 | FK error al crear cliente | `INSERT business (active_plan_id=4)` donde FK espera `business_plan.id` | Insertar business → crear business_plan → UPDATE con su id |
| 4 | Plan names `—` en lista clientes | `JOIN plans p ON p.id = b.active_plan_id` accidental | JOIN correcto via business_plan |
| 5 | Regex error en browser (pattern attribute) | `^[a-z0-9-]{1,63}$` inválido en modo Unicode-sets (v-flag) | Eliminado atributo HTML (JS ya valida en submit) |
| 6 | `/roisol` → 404 | No había página en esa ruta | Redirect a `/roisol/clientes` |

---

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `db/migrations/20260718_rename_active_subscription_id.sql` | Migración: ALTER TABLE RENAME COLUMN |
| `lib/plan-gate.ts` | `b.active_plan_id` → `b.active_subscription_id` |
| `app/api/auth/google/route.ts` | JOIN via business_plan para obtener plans.id correcto |
| `app/(factura-rapida)/layout.tsx` | JOIN correcto + redirect a `/login` en vez de `/sin-acceso` |
| `app/api/roisol/clientes/route.ts` | INSERT business → INSERT business_plan → UPDATE active_subscription_id |
| `app/roisol/clientes/page.tsx` | JOIN correcto, campo `active_plan_id` eliminado de la interfaz |
| `app/roisol/clientes/[id]/page.tsx` | JOIN correcto, campo `active_plan_id` eliminado de la interfaz |
| `app/api/tenant/resolve/route.ts` | `active_plan_id` → `active_subscription_id` |
| `components/roisol/ClienteDetalle.tsx` | Campo `active_plan_id` eliminado de la interfaz Props (no se usaba) |
| `app/roisol/page.tsx` | Nuevo: redirect a `/roisol/clientes` |
| `components/roisol/NuevoClienteForm.tsx` | Eliminado `pattern` HTML (redundante con validación JS) |

---

## Migración requerida

```sql
-- db/migrations/20260718_rename_active_subscription_id.sql
ALTER TABLE business
  RENAME COLUMN active_plan_id TO active_subscription_id;
```

**Ejecutar ANTES de desplegar el código** o simultáneamente en deploy atómico.

---

## Causa del "MALEMA data" en sesión

El usuario cambió su `business_id` en la DB pero tenía una **cookie de sesión vieja** con
`business_id=1`. Solución: hacer **logout y volver a entrar** para regenerar la cookie con
los valores actualizados del DB.

---

## Orden de deploy seguro

1. Ejecutar migración SQL en producción
2. Deployar código
3. Usuarios con sesiones viejas (sin `plan_id`) son tratados como ROIPOS por compatibilidad
4. Al hacer logout + login reciben sesión correcta con `plan_id` real
