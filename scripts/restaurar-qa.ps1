<#
.SYNOPSIS
  Restaura la base QA de ROIPOS desde el último backup de PROD.

.DESCRIPTION
  Deja roipos-qa igual a PROD (del último .dump), adaptada para QA:
    0. Controles: .env, herramientas, guardas contra PROD, dump válido.
    1. Confirmación (escribir "QA").
    2. Backup de QA antes de borrar.
    3. DROP + pg_restore del dump de PROD.
    4. Adaptar a QA (10-adaptar-qa.sql): dominios, secretos, tokens, flags.
    5. Perfiles de ROI (20-perfiles-roi.sql).
    6. Aviso de migraciones pendientes de qa.
    7. Resumen.
  Con -SoloPerfiles corre solo el paso 5 (sin restaurar).
  Nunca toca PROD: solo lee un .dump de la carpeta de backups.

.EXAMPLE
  .\scripts\restaurar-qa.ps1
  .\scripts\restaurar-qa.ps1 -Simular
  .\scripts\restaurar-qa.ps1 -Dump C:\ruta\al\dump.dump
  .\scripts\restaurar-qa.ps1 -SoloPerfiles
  .\scripts\restaurar-qa.ps1 -SinBackupQA
#>
[CmdletBinding()]
param(
  [switch]$Simular,
  [switch]$Si,
  [string]$Dump,
  [switch]$SinBackupQA,
  [switch]$SoloPerfiles
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent   # c:\apps\roipos\roipos-app
$sw   = [System.Diagnostics.Stopwatch]::StartNew()

function Escribir($texto, $color = 'Gray') { Write-Host $texto -ForegroundColor $color }

function Limpiar-Secretos {
  param([switch]$Avisar)
  $habia = @()
  foreach ($n in @('DATABASE_URL', 'DATABASE_URL_PROD', 'DATABASE_URL_QA', 'APP_ENV', 'NODE_ENV', 'PGPASSWORD')) {
    if (Test-Path "Env:$n") { $habia += $n; Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  }
  foreach ($v in @('dbUrl', 'qaUrl', 'bckVars', 'cfg', 'cfgProd')) {
    Set-Variable -Name $v -Value $null -Scope Script -ErrorAction SilentlyContinue
  }
  if ($Avisar -and $habia.Count -gt 0) {
    Write-Host "  !   Había variables de entorno en esta consola ($($habia -join ', ')): las borré." -ForegroundColor Yellow
  }
}

function Salir([int]$Codigo = 0) { Limpiar-Secretos; exit $Codigo }

Limpiar-Secretos -Avisar

function Leer-Env($archivo) {
  $h = @{}
  foreach ($l in (Get-Content $archivo -Encoding UTF8)) {
    if ($l -match '^\s*([A-Za-z_]\w*)\s*=\s*"?(.+?)"?\s*$') { $h[$Matches[1]] = $Matches[2] }
  }
  $h
}

function Sanitizar($texto) {
  "$texto" -replace 'postgresql://[^@]*@', '***@'
}

function Vaciar-QA {
  Escribir '' 'Red'
  Escribir '   VACIANDO QA para no dejar secretos de PROD.' 'Red'
  $dropSql = "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;"
  $err2 = & $psqlExe "--dbname=$qaUrl" -v ON_ERROR_STOP=1 -c $dropSql 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -eq 0) {
    Escribir '   QA quedó vacía: no se dejó la copia de PROD sin adaptar.' 'Red'
  } else {
    Escribir "   ERROR al vaciar QA: $(Sanitizar ($err2 -join "`n"))" 'Red'
    Escribir '   QA puede tener secretos de PROD. Verificar manualmente.' 'Red'
  }
}

function Extraer-Host($url) {
  if ($url -match '@([^:/@]+)') { $Matches[1] } else { '***' }
}

function RunPsql {
  param([string]$DbUrl, [string]$Archivo, [string]$Descripcion)
  if ($Simular) { Escribir "   [simular] $Descripcion" 'DarkYellow'; return }
  Escribir "   $Descripcion"
  $err = & $psqlExe "--dbname=$DbUrl" -v ON_ERROR_STOP=1 -f $Archivo 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) {
    throw "psql falló ($Descripcion):`n$(Sanitizar ($err -join "`n"))"
  }
  $err | ForEach-Object { Escribir "   $_" 'DarkGray' }
}

# ── 0. Controles ─────────────────────────────────────────────────────────────
$envPath = Join-Path $root 'secrets\.env.restore.prod.to.QA'
$errores = @()

if (-not (Test-Path $envPath)) {
  $errores += "  X   No existe $envPath"
} else {
  $cfg = Leer-Env $envPath
  foreach ($k in @('DATABASE_URL_QA', 'PG_BIN', 'BACKUP_DIR')) {
    if (-not $cfg[$k]) { $errores += "  X   Falta $k en .env.restore.prod.to.QA" }
  }
}

if ($errores.Count -eq 0) {
  $psqlExe      = Join-Path $cfg.PG_BIN 'psql.exe'
  $pgDumpExe    = Join-Path $cfg.PG_BIN 'pg_dump.exe'
  $pgRestoreExe = Join-Path $cfg.PG_BIN 'pg_restore.exe'
  if (-not (Test-Path $psqlExe))      { $errores += "  X   No existe $psqlExe" }
  if (-not (Test-Path $pgDumpExe))    { $errores += "  X   No existe $pgDumpExe" }
  if (-not (Test-Path $pgRestoreExe)) { $errores += "  X   No existe $pgRestoreExe" }
  if (-not (Test-Path $cfg.BACKUP_DIR)) { $errores += "  X   No existe BACKUP_DIR ($($cfg.BACKUP_DIR))" }
}

# Guardas contra PROD
if ($errores.Count -eq 0) {
  $qaUrl = $cfg.DATABASE_URL_QA

  $envProd = Join-Path $root 'secrets\.env.bck.prod'
  if (Test-Path $envProd) {
    $cfgProd = Leer-Env $envProd
    if ($cfgProd.DATABASE_URL_PROD -and $qaUrl -eq $cfgProd.DATABASE_URL_PROD) {
      $errores += "  X   DATABASE_URL_QA es igual a DATABASE_URL_PROD. Abortando."
    }
  }

  # Host/usuario tiene que contener el ref de QA (obligatorio, sin default)
  if (-not $cfg.QA_PROJECT_REF) {
    $errores += "  X   Falta QA_PROJECT_REF en .env.restore.prod.to.QA"
  } else {
    $qaRef = $cfg.QA_PROJECT_REF
    if ($qaUrl -notmatch [regex]::Escape($qaRef)) {
      $errores += "  X   DATABASE_URL_QA no contiene '$qaRef'. ¿Apunta a PROD?"
    }
  }
}

# Dump
$dumpFile = $null
if ($errores.Count -eq 0 -and -not $SoloPerfiles) {
  if ($Dump) {
    if (-not (Test-Path $Dump)) { $errores += "  X   No existe el dump: $Dump" }
    else { $dumpFile = Get-Item $Dump }
  } else {
    $dumps = Get-ChildItem $cfg.BACKUP_DIR -Filter 'roipos-prod-*.dump' | Sort-Object LastWriteTime -Descending
    if ($dumps.Count -eq 0) { $errores += "  X   No hay dumps roipos-prod-*.dump en $($cfg.BACKUP_DIR)" }
    else { $dumpFile = $dumps[0] }
  }
}

if ($errores.Count -gt 0) {
  Escribir "`nNo se puede continuar:" 'Red'
  $errores | ForEach-Object { Escribir $_ 'Red' }
  Salir 1
}

# ── Mostrar plan ─────────────────────────────────────────────────────────────
$qaHost = Extraer-Host $qaUrl
Escribir "`nRestaurar QA$(if ($SoloPerfiles) { ' (solo perfiles)' })$(if ($Simular) { ' · SIMULACIÓN' })" 'Cyan'
Escribir "  Base QA: $qaHost"

if (-not $SoloPerfiles) {
  $edad = (Get-Date) - $dumpFile.LastWriteTime
  $edadTexto = if ($edad.TotalHours -lt 1) { "hace $([math]::Round($edad.TotalMinutes)) min" }
               elseif ($edad.TotalDays -lt 1) { "hace $([math]::Round($edad.TotalHours, 1)) horas" }
               else { "hace $([math]::Round($edad.TotalDays, 1)) días" }
  $mb = [math]::Round($dumpFile.Length / 1MB, 1)
  $dumpFechaInfo = $dumpFile.LastWriteTime.ToString('dd/MM/yyyy HH:mm')
  Escribir "  Dump: $($dumpFile.Name) · $mb MB · $dumpFechaInfo ($edadTexto)"
  if ($edad.TotalDays -gt 7) {
    Escribir "  !   El dump tiene más de 7 días. Considerá hacer un backup fresco de PROD primero." 'Yellow'
  }

  # Verificar dump
  $listado = & $pgRestoreExe -l $dumpFile.FullName 2>$null
  $tablas = @($listado | Where-Object { $_ -match 'TABLE DATA' }).Count
  if ($tablas -lt 20) {
    Escribir "  X   pg_restore -l muestra $tablas TABLE DATA (mínimo 20)" 'Red'; Salir 1
  }
  Escribir "  Dump verificado: $tablas TABLE DATA"
}

$sqlDir = Join-Path $root 'db\qa-restore'
Escribir "  SQL: $sqlDir"

if ($Simular) {
  Escribir "`n[simular] Plan:" 'DarkYellow'
  if (-not $SoloPerfiles) {
    Escribir "   1. Backup de QA ($qaHost)" 'DarkYellow'
    Escribir "   2. DROP SCHEMA public + pg_restore de $($dumpFile.Name)" 'DarkYellow'
    Escribir "   3. 10-adaptar-qa.sql (dominios, secretos, tokens, flags)" 'DarkYellow'
    Escribir "   4. 20-perfiles-roi.sql (admin con acceso a negocios)" 'DarkYellow'
    Escribir "   5. Verificar migraciones pendientes de qa" 'DarkYellow'
  } else {
    Escribir "   1. 20-perfiles-roi.sql (admin con acceso a negocios)" 'DarkYellow'
  }
  Escribir "`nSimulación terminada. Nada se tocó." 'Cyan'
  Salir 0
}

# ── 1. Confirmación ──────────────────────────────────────────────────────────
if (-not $Si) {
  Escribir ''
  $resp = Read-Host "Va a BORRAR COMPLETAMENTE la base QA ($qaHost) y reemplazarla con $($dumpFile.Name). Escribí QA para confirmar"
  if ($resp -cne 'QA') { Escribir 'Cancelado.' 'Yellow'; Salir 0 }
}

# ── 2. Backup de QA ─────────────────────────────────────────────────────────
if (-not $SoloPerfiles) {
  if (-not $SinBackupQA) {
    Escribir "`n== Backup de QA" 'Cyan'
    $bckDirQA = if ($cfg.BACKUP_DIR_QA) { $cfg.BACKUP_DIR_QA } else { Join-Path (Split-Path $cfg.BACKUP_DIR -Parent) 'QA' }
    if (-not (Test-Path $bckDirQA)) { New-Item -ItemType Directory -Force $bckDirQA | Out-Null }
    $stamp = Get-Date -Format 'yyyyMMddHHmm'
    $bckQA = Join-Path $bckDirQA "qa-roipos-antes-restore-${stamp}.dump"
    Escribir "   dump → $(Split-Path $bckQA -Leaf)"
    try {
      $err = & $pgDumpExe "--dbname=$qaUrl" -n public -Fc --no-owner --no-privileges -f $bckQA 2>&1 | ForEach-Object { "$_" }
      if ($LASTEXITCODE -ne 0) { throw "pg_dump falló:`n$(Sanitizar ($err -join "`n"))" }
    } catch {
      $qaUrl = $null
      Escribir "   ERROR: $($_.Exception.Message)" 'Red'; Salir 1
    }
    if (-not (Test-Path $bckQA) -or (Get-Item $bckQA).Length -lt 102400) {
      Escribir "   ERROR: backup de QA demasiado chico o no se creó" 'Red'; Salir 1
    }
    $bckMB = [math]::Round((Get-Item $bckQA).Length / 1MB, 1)
    Escribir "   OK: $(Split-Path $bckQA -Leaf) · $bckMB MB" 'Green'
  } else {
    Escribir "`n  !   -SinBackupQA: no se respalda QA" 'Yellow'
  }

  # ── 3. Vaciar y restaurar ──────────────────────────────────────────────────
  Escribir "`n== Vaciar y restaurar" 'Cyan'
  Escribir "   DROP SCHEMA public …"
  $dropSql = "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO PUBLIC;"
  $err = & $psqlExe "--dbname=$qaUrl" -v ON_ERROR_STOP=1 -c $dropSql 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) {
    Escribir "   ERROR drop: $(Sanitizar ($err -join "`n"))" 'Red'; Salir 1
  }

  Escribir "   pg_restore de $($dumpFile.Name) …"
  $err = & $pgRestoreExe "--dbname=$qaUrl" -n public --no-owner --no-privileges --exit-on-error $dumpFile.FullName 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) {
    Escribir "   ERROR pg_restore: $(Sanitizar ($err -join "`n"))" 'Red'
    Vaciar-QA
    Salir 1
  }
  Escribir "   Restauración OK" 'Green'
}

# ── 4. Adaptar a QA ─────────────────────────────────────────────────────────
if (-not $SoloPerfiles) {
  Escribir "`n== Adaptar a QA" 'Cyan'
  $sql10 = Join-Path $sqlDir '10-adaptar-qa.sql'
  try {
    RunPsql $qaUrl $sql10 '10-adaptar-qa.sql (dominios, secretos, tokens, flags, facturación)'
  } catch {
    Escribir "   ERROR: $($_.Exception.Message)" 'Red'
    Vaciar-QA
    Salir 1
  }
}

# ── 5. Perfiles de ROI ──────────────────────────────────────────────────────
Escribir "`n== Perfiles de ROI" 'Cyan'
$sql20 = Join-Path $sqlDir '20-perfiles-roi.sql'
try {
  RunPsql $qaUrl $sql20 '20-perfiles-roi.sql (admin con acceso a negocios)'
} catch {
  $qaUrl = $null
  Escribir "   ERROR: $($_.Exception.Message)" 'Red'; Salir 1
}

# ── 6. Migraciones de qa ────────────────────────────────────────────────────
if (-not $SoloPerfiles) {
  Escribir "`n== Migraciones" 'Cyan'
  $migDir = Join-Path $root 'db\migrations'
  if (Test-Path $migDir) {
    $migFiles = Get-ChildItem $migDir -Filter '*.sql' | ForEach-Object { $_.Name } | Sort-Object
    $applied = & $psqlExe "--dbname=$qaUrl" -t -A -c "SELECT version FROM schema_migrations ORDER BY version" 2>$null
    $appliedSet = @{}
    foreach ($v in $applied) { $v = $v.Trim(); if ($v) { $appliedSet[$v] = $true } }
    $pending = $migFiles | Where-Object { -not $appliedSet[$_] }
    if ($pending.Count -gt 0) {
      Escribir "   $($pending.Count) migraciones pendientes de qa:" 'Yellow'
      $pending | ForEach-Object { Escribir "     $_" 'Yellow' }
      Escribir "   Hacé un Retry deploy de QA en Netlify para correrlas." 'Yellow'
    } else {
      Escribir "   Todas las migraciones están aplicadas." 'Green'
    }
  } else {
    Escribir "   No existe $migDir — no hay migraciones que verificar." 'DarkGray'
  }
}

# ── 7. Resumen ───────────────────────────────────────────────────────────────
$qaUrl = $null
$sw.Stop()
$min = [math]::Round($sw.Elapsed.TotalMinutes, 1)

Escribir "`n════════════════════════════════════════════" 'Cyan'
if ($SoloPerfiles) {
  Escribir "Solo perfiles — listo en $min min." 'Cyan'
} else {
  Escribir "Restauración de QA lista en $min min." 'Cyan'
  $dumpFecha = $dumpFile.LastWriteTime.ToString('dd/MM/yyyy HH:mm')
  Escribir "  Dump: $($dumpFile.Name) ($dumpFecha)"
  if (-not $SinBackupQA -and $bckQA) {
    $bckNombre = Split-Path $bckQA -Leaf
    Escribir "  Backup QA previo: $bckNombre"
  }
}
Escribir ''
Escribir 'Recordatorios:' 'DarkGray'
Escribir '  - Cargá credenciales de prueba de Mercado Pago en los negocios con los que vayas a probar.' 'DarkGray'
Escribir '  - QA tiene datos personales reales de compradores: no compartir el acceso.' 'DarkGray'

Limpiar-Secretos
