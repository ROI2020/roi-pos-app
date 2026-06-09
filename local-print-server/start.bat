@echo off
title ROI POS Print Server
cd /d "%~dp0"

:INICIO
echo.
echo  ====================================
echo   ROI POS Print Server  v1.0
echo   Impresora : XP-80C Recibos
echo   Puerto    : http://localhost:3002
echo  ====================================
echo.

node server.js

echo.
echo  Servidor detenido. Reiniciando en 5 segundos...
echo  (Cierra esta ventana para detenerlo definitivamente)
timeout /t 5 /nobreak >nul
goto INICIO
