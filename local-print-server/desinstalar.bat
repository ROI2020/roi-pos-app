@echo off
title ROI POS Print Server - Desinstalar
color 0E
echo.
echo  ============================================
echo    ROI POS Print Server  -  Desinstalar
echo  ============================================
echo.

set "REG_KEY=HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Run"
set "REG_NAME=ROI POS Print Server"

reg query "%REG_KEY%" /v "%REG_NAME%" >nul 2>&1
if %errorlevel% equ 0 (
    reg delete "%REG_KEY%" /v "%REG_NAME%" /f >nul 2>&1
    echo  OK - Inicio automatico removido.
    echo  El servidor ya no arrancara con Windows.
) else (
    echo  INFO - No estaba configurado el inicio automatico.
)

echo.
echo  Los archivos del servidor NO fueron borrados.
echo  Podes eliminir la carpeta manualmente si ya no lo necesitas.
echo.
color 07
pause
