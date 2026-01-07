@echo off
title CHROME DEBUG - PORTA 9222
color 0A

echo ============================================================
echo INICIANDO CHROME EM MODO DEBUG
echo ============================================================
echo.

echo [1] Fechando Chrome...
taskkill /F /IM chrome.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo [2] Iniciando Chrome em modo debug...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data\Debug"

timeout /t 3 /nobreak >nul

echo [3] Abrindo Mind-7...
start "" "https://mind-7.org"

echo.
echo ============================================================
echo CHROME DEBUG ATIVO - PORTA 9222
echo ============================================================
echo.
echo PROXIMOS PASSOS:
echo   1. Faca login no Mind-7
echo   2. Execute: python automacao_completa_duas_fases.py
echo.
echo IMPORTANTE: MANTENHA ESTA JANELA ABERTA!
echo ============================================================
echo.

:loop
echo [%time%] Chrome debug rodando...
timeout /t 30 /nobreak >nul
goto loop
