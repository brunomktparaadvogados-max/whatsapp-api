@echo off
title CHROME DEBUG - MANTENHA ABERTO
color 0A
echo ============================================================
echo INICIANDO CHROME EM MODO DEBUG
echo ============================================================

echo Fechando Chrome existente...
taskkill /F /IM chrome.exe 2>nul
timeout /t 3 /nobreak >nul

echo Iniciando Chrome em modo debug na porta 9222...
start /B "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data\Debug"

timeout /t 5 /nobreak >nul

cls
color 0A
echo ============================================================
echo          CHROME DEBUG ATIVO - PORTA 9222
echo ============================================================
echo.
echo  STATUS: RODANDO
echo.
echo  INSTRUCOES:
echo    1. Faca login no Mind-7
echo    2. Execute: python automacao_completa_duas_fases.py
echo    3. MANTENHA ESTA JANELA ABERTA!
echo.
echo ============================================================
echo  AGUARDANDO... (Pressione Ctrl+C para encerrar)
echo ============================================================
echo.

:loop
echo [%date% %time%] Chrome debug ativo...
timeout /t 30 /nobreak >nul
goto loop
