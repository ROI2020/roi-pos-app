@echo off
title ROI POS Print Server - Instalador
color 0A
cd /d "%~dp0"

echo.
echo  ============================================
echo    ROI POS Print Server  -  Instalacion
echo  ============================================
echo.

:: ── 1. Verificar Node.js ──────────────────────────────────────────────────────
echo  [1/3]  Verificando Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Node.js no esta instalado en esta PC.
    echo.
    echo  Pasos para instalarlo:
    echo    1. Abre el navegador y ve a:  https://nodejs.org
    echo    2. Descarga la version LTS ^(boton verde grande^)
    echo    3. Ejecuta el instalador ^(siguiente, siguiente, instalar^)
    echo    4. Reinicia esta instalacion
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  OK - Node.js %%v

:: ── 2. Instalar dependencias npm ──────────────────────────────────────────────
echo.
echo  [2/3]  Instalando paquetes (puede tardar 1-2 minutos)...
call npm install --no-audit --no-fund --loglevel=error
if %errorlevel% neq 0 (
    color 0C
    echo.
    echo  ERROR: Fallo la instalacion de paquetes.
    echo  Verifica que la PC tenga conexion a Internet e intenta de nuevo.
    echo.
    pause
    exit /b 1
)
echo  OK - Paquetes instalados

:: ── 3. Agregar al inicio de Windows (registro HKCU) ──────────────────────────
echo.
echo  [3/3]  Configurando inicio automatico con Windows...
set "REG_KEY=HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
set "REG_NAME=ROI POS Print Server"
set "VBS_PATH=%~dp0iniciar.vbs"

reg add "%REG_KEY%" /v "%REG_NAME%" /t REG_SZ /d "wscript.exe /b \"%VBS_PATH%\"" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo  OK - Iniciara automaticamente cada vez que enciendas la PC
) else (
    echo  AVISO: No se pudo configurar el inicio automatico.
    echo         Podes igualmente iniciarlo manualmente con start.bat
)

:: ── Resumen ───────────────────────────────────────────────────────────────────
echo.
echo  ============================================
echo    Instalacion completada!
echo  ============================================
echo.
echo   - Arranca solo al encender la PC
echo   - Para iniciarlo ahora:    doble click en  start.bat
echo   - Para desinstalarlo:      ejecuta          desinstalar.bat
echo.

set /p "AHORA=  Iniciar el servidor ahora? (S para si, Enter para omitir): "
if /i "%AHORA%"=="S" (
    echo.
    echo  Iniciando servidor en segundo plano...
    wscript.exe /b "%~dp0iniciar.vbs"
    echo  Listo - corriendo minimizado.
)

echo.
color 07
pause
