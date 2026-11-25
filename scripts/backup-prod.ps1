<#
.SYNOPSIS
  Backup de PROD de ROIPOS (pg_dump custom-format).

.DESCRIPTION
  Lee la config de secrets\.env.bck.prod (DATABASE_URL_PROD, PG_BIN, BACKUP_DIR).
  Hace pg_dump -Fc, verifica tamaño y pg_restore -l.
  Nombre: roipos-prod-AAAAMMDDHHMM.dump.
  Limpia DATABASE_URL/APP_ENV/NODE_ENV/PG* de la consola al empezar y al terminar.
  Nunca muestra la URL ni la contraseña en pantalla.

.EXAMPLE
  .\scripts\backup-prod.ps1
  .\scripts\backup-prod.ps1 -Simular
  .\scripts\backup-prod.ps1 -SoloEsquema
#>
[CmdletBinding()]
param(
  [switch]$Simular,
  [switch]$SoloEsquema
)

$ErrorActionPreference = 'Continue'
$root = Split-Path $PSScriptRoot -Parent   # c:\apps\roipos\roipos-app

function Escribir($texto, $color = 'Gray') { Write-Host $texto -ForegroundColor $color }

function Limpiar-Secretos {
  param([switch]$Avisar)
  $habia = @()
  foreach ($n in @('DATABASE_URL', 'DATABASE_URL_PROD', 'DATABASE_URL_QA', 'APP_ENV', 'NODE_ENV', 'PGPASSWORD')) {
    if (Test-Path "Env:$n") { $habia += $n; Remove-Item "Env:$n" -ErrorAction SilentlyContinue }
  }
  foreach ($v in @('dbUrl', 'bckVars')) {
    Set-Variable -Name $v -Value $null -Scope Script -ErrorAction SilentlyContinue
  }
  if ($Avisar -and $habia.Count -gt 0) {
    Write-Host "  !   Había variables de entorno en esta consola ($($habia -join ', ')): las borré." -ForegroundColor Yellow
  }
}

function Salir([int]$Codigo = 0) { Limpiar-Secretos; exit $Codigo }

function Leer-Env($archivo) {
  $h = @{}
  foreach ($l in (Get-Content $archivo -Encoding UTF8)) {
    if ($l -match '^\s*([A-Za-z_]\w*)\s*=\s*"?(.+?)"?\s*$') { $h[$Matches[1]] = $Matches[2] }
  }
  $h
}

Escribir "`nBackup de PROD — ROIPOS$(if ($SoloEsquema) { ' · ESQUEMA' })$(if ($Simular) { ' · SIMULACIÓN' })" 'Cyan'
Limpiar-Secretos -Avisar

# ── 0. Controles ─────────────────────────────────────────────────────────────
$envPath = Join-Path $root 'secrets\.env.bck.prod'
$errores = @()

if (-not (Test-Path $envPath)) {
  $errores += "  X   No existe $envPath"
} else {
  $bckVars = Leer-Env $envPath
  foreach ($clave in @('DATABASE_URL_PROD', 'PG_BIN', 'BACKUP_DIR')) {
    if (-not $bckVars[$clave]) { $errores += "  X   Falta $clave en secrets\.env.bck.prod" }
  }
}

if ($errores.Count -eq 0) {
  $pgDumpExe    = Join-Path $bckVars.PG_BIN 'pg_dump.exe'
  $pgRestoreExe = Join-Path $bckVars.PG_BIN 'pg_restore.exe'
  if (-not (Test-Path $pgDumpExe))    { $errores += "  X   No existe $pgDumpExe" }
  if (-not (Test-Path $pgRestoreExe)) { $errores += "  X   No existe $pgRestoreExe" }
  if (-not (Test-Path $bckVars.BACKUP_DIR)) { $errores += "  X   No existe BACKUP_DIR ($($bckVars.BACKUP_DIR))" }
}

if ($errores.Count -gt 0) {
  Escribir "`nNo se puede continuar:" 'Red'
  $errores | ForEach-Object { Escribir $_ 'Red' }
  Salir 1
}

# ── SoloEsquema: pg_dump --schema-only → db/migrations/000_baseline.sql ──────
if ($SoloEsquema) {
  $dbUrl = $bckVars.DATABASE_URL_PROD
  if ($dbUrl -match '@([^:/@]+)') { $hostDb = $Matches[1] } else { $hostDb = '***' }
  $baselineFile = Join-Path $root 'db\migrations\000_baseline.sql'
  Escribir "  Host: $hostDb"
  Escribir "  Destino: $baselineFile"

  if (Test-Path $baselineFile) {
    Escribir "`n  X   $baselineFile ya existe. La baseline no se regenera." 'Red'
    Salir 1
  }

  if ($Simular) {
    Escribir "`n[simular] Haría pg_dump --schema-only a 000_baseline.sql y limpiaría automáticamente." 'DarkYellow'
    Escribir "`nSimulación terminada. Nada se tocó." 'Cyan'
    Salir 0
  }

  $migDir = Join-Path $root 'db\migrations'
  if (-not (Test-Path $migDir)) { New-Item -ItemType Directory -Force $migDir | Out-Null }

  Escribir "`n  schema-only dump …"
  $pgDumpExe = Join-Path $bckVars.PG_BIN 'pg_dump.exe'
  $rawFile = Join-Path $root 'db\migrations\000_baseline.raw.sql'
  try {
    $err = & $pgDumpExe "--dbname=$dbUrl" --schema-only --schema=public --no-owner --no-privileges -f $rawFile 2>&1 | ForEach-Object { "$_" }
    if ($LASTEXITCODE -ne 0) {
      $errSafe = ($err -join "`n") -replace 'postgresql://[^@]*@', '***@'
      throw "pg_dump --schema-only falló (exit $LASTEXITCODE):`n$errSafe"
    }
  } catch {
    $dbUrl = $null
    if (Test-Path $rawFile) { Remove-Item $rawFile -Force }
    Escribir "  ERROR: $($_.Exception.Message)" 'Red'
    Salir 1
  }
  $dbUrl = $null

  if (-not (Test-Path $rawFile) -or (Get-Item $rawFile).Length -eq 0) {
    Escribir "  ERROR: el archivo de esquema está vacío o no se creó" 'Red'; Salir 1
  }

  # ── Limpieza automática ──────────────────────────────────────────────────
  Escribir "  Limpiando salida de pg_dump …"
  $stamp = Get-Date -Format 'yyyy-MM-dd'
  $header = "-- 000_baseline.sql — Esquema de PROD al $stamp (generado por backup-prod.ps1 -SoloEsquema)"
  $lines = Get-Content $rawFile -Encoding UTF8
  $cleaned = @($header, '')
  foreach ($line in $lines) {
    # Saltar líneas de psql que pg no entiende (\restrict, \unrestrict)
    if ($line -match '^\\\w') { continue }
    # Saltar CREATE SCHEMA public (ya existe en bases nuevas)
    if ($line -match '^\s*CREATE SCHEMA\s+public') { continue }
    # Saltar COMMENT ON SCHEMA public
    if ($line -match '^\s*COMMENT ON SCHEMA\s+public') { continue }
    # Saltar set_config('search_path', '', false) — rompe las queries siguientes
    if ($line -match "set_config\s*\(\s*'search_path'") { continue }
    # Saltar SET default_table_access_method (no existe en PG < 12 vanilla)
    if ($line -match '^\s*SET\s+default_table_access_method') { continue }
    $cleaned += $line
  }
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllLines($baselineFile, $cleaned, $utf8NoBom)
  Remove-Item $rawFile -Force

  $kb = [math]::Round((Get-Item $baselineFile).Length / 1KB, 1)
  Escribir "`n  Esquema OK: 000_baseline.sql · ${kb} KB (limpio)" 'Green'
  Limpiar-Secretos
  exit 0
}

# ── 1. Plan ──────────────────────────────────────────────────────────────────
$stamp    = Get-Date -Format 'yyyyMMddHHmm'
$dumpFile = Join-Path $bckVars.BACKUP_DIR "roipos-prod-${stamp}.dump"

$dbUrl = $bckVars.DATABASE_URL_PROD
if ($dbUrl -match '@([^:/@]+)') { $hostDb = $Matches[1] } else { $hostDb = '***' }

Escribir "  Host: $hostDb"
Escribir "  Destino: $(Split-Path $dumpFile -Leaf)"
Escribir "  Carpeta: $($bckVars.BACKUP_DIR)"

if ($Simular) {
  Escribir "`n[simular] Haría pg_dump -Fc a $($dumpFile | Split-Path -Leaf) y verificaría con pg_restore -l." 'DarkYellow'
  Escribir "`nSimulación terminada. Nada se tocó." 'Cyan'
  Salir 0
}

# ── 2. Backup ────────────────────────────────────────────────────────────────
Escribir "`n  dump custom …"
try {
  $err = & $pgDumpExe "--dbname=$dbUrl" -n public -Fc --no-owner --no-privileges -f $dumpFile 2>&1 | ForEach-Object { "$_" }
  if ($LASTEXITCODE -ne 0) {
    $errSafe = ($err -join "`n") -replace 'postgresql://[^@]*@', '***@'
    throw "pg_dump -Fc falló (exit $LASTEXITCODE):`n$errSafe"
  }
} catch {
  $dbUrl = $null
  Escribir "  ERROR: $($_.Exception.Message)" 'Red'
  Salir 1
}
$dbUrl = $null

# ── 3. Verificación ──────────────────────────────────────────────────────────
if (-not (Test-Path $dumpFile)) {
  Escribir "  ERROR: el .dump no se creó" 'Red'; Salir 1
}
$tamano = (Get-Item $dumpFile).Length
if ($tamano -eq 0) {
  Escribir "  ERROR: el .dump está vacío" 'Red'; Salir 1
}

$listado = & $pgRestoreExe -l $dumpFile 2>$null
$tablas = @($listado | Where-Object { $_ -match 'TABLE DATA' }).Count
if ($tablas -lt 20) {
  Escribir "  ERROR: pg_restore -l muestra $tablas TABLE DATA (mínimo 20)" 'Red'; Salir 1
}

$mb = [math]::Round($tamano / 1MB, 1)
Escribir "`n  Backup OK: $(Split-Path $dumpFile -Leaf) · ${mb} MB · $tablas tablas" 'Green'
Escribir "  Carpeta: $(Split-Path $dumpFile -Parent)" 'DarkGray'

Limpiar-Secretos
