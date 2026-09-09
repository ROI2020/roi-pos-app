$PORT    = 3000
$LOGFILE = "$env:TEMP\cf-tunnel.txt"

# Matar cloudflared previo si habia
$prev = Get-Process -Name "cloudflared" -ErrorAction SilentlyContinue
if ($prev) { $prev | Stop-Process -Force; Start-Sleep -Milliseconds 400 }
if (Test-Path $LOGFILE) { Remove-Item $LOGFILE -Force }

# Instalar cloudflared si no esta
if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
    Write-Host "Instalando cloudflared via winget..." -ForegroundColor Yellow
    winget install Cloudflare.cloudflared --accept-source-agreements --accept-package-agreements -h
    $newPath = [System.Environment]::GetEnvironmentVariable("PATH","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH","User")
    $env:PATH = $newPath
    if (-not (Get-Command cloudflared -ErrorAction SilentlyContinue)) {
        Write-Host "ERROR: cloudflared no se pudo instalar. Reinicia la terminal e intentalo de nuevo." -ForegroundColor Red
        exit 1
    }
}

# Abrir tunel cloudflared en background, redirigir stderr al log
Write-Host "Abriendo tunel cloudflared en puerto $PORT..." -ForegroundColor Cyan
$proc = Start-Process -FilePath "cloudflared" `
    -ArgumentList "tunnel --url http://localhost:$PORT" `
    -RedirectStandardError $LOGFILE `
    -WindowStyle Hidden -PassThru

# Esperar la URL publica
Write-Host "Esperando URL del tunel..." -ForegroundColor Yellow
$tunnelUrl = $null
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 700
    if (Test-Path $LOGFILE) {
        $content = Get-Content $LOGFILE -Raw -ErrorAction SilentlyContinue
        if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
            $tunnelUrl = $Matches[0]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Host "ERROR: No se obtuvo URL del tunel. Log:" -ForegroundColor Red
    if (Test-Path $LOGFILE) { Get-Content $LOGFILE | Select-Object -Last 15 }
    exit 1
}

$callbackUrl = "$tunnelUrl/api/ml/auth/callback"
$webhookUrl  = "$tunnelUrl/api/ml/webhook"

Write-Host ""
Write-Host "=======================================================" -ForegroundColor Green
Write-Host "  Tunel activo: $tunnelUrl" -ForegroundColor Green
Write-Host "=======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "ML Developer Console -> https://developers.mercadolibre.com.ar/devcenter" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Redirect URI : $callbackUrl" -ForegroundColor Yellow
Write-Host "  Webhook URL  : $webhookUrl  (topic: orders_v2)" -ForegroundColor Yellow
Write-Host ""

# Copiar al portapapeles
$callbackUrl | Set-Clipboard
Write-Host "Redirect URI copiado al portapapeles." -ForegroundColor Green
Write-Host ""

# Arrancar Next.js con la URL del tunel
$env:NEXT_PUBLIC_BASE_URL = $tunnelUrl
Write-Host "Iniciando Next.js con NEXT_PUBLIC_BASE_URL=$tunnelUrl" -ForegroundColor Green
Write-Host "(Ctrl+C para detener)" -ForegroundColor Gray
Write-Host ""

Set-Location "c:\roi-pos-app"
npm run dev
