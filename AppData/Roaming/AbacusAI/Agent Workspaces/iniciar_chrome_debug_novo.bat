@echo off
title INICIANDO CHROME DEBUG
color 0A

echo ============================================================
echo        INICIANDO CHROME EM MODO DEBUG
echo ============================================================
echo.

powershell.exe -ExecutionPolicy Bypass -File "%~dp0iniciar_chrome_debug_melhorado.ps1"

if errorlevel 1 (
    echo.
    echo [X] ERRO ao executar o script PowerShell
    echo.
    pause
    exit /b 1
)

pause
