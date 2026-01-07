@echo off
chcp 65001 >nul
cls

echo ========================================
echo   AUTOMAÇÃO OTIMIZADA - EDITAL + MIND-7
echo ========================================
echo.

echo PASSO 1: Fechando Chrome...
taskkill /F /IM chrome.exe 2>nul
timeout /t 2 /nobreak >nul
echo   ✓ Chrome fechado!
echo.

echo PASSO 2: Iniciando Chrome em modo debug...
start chrome --remote-debugging-port=9222 --user-data-dir="%USERPROFILE%\AppData\Local\Google\Chrome\User Data"
timeout /t 3 /nobreak >nul
echo   ✓ Chrome iniciado!
echo.

echo PASSO 3: INSTRUÇÕES
echo   1. Acesse o Mind-7 no Chrome
echo   2. Faça login
echo   3. Mantenha a aba aberta
echo.

pause

echo.
echo PASSO 4: Executando automação...
cd /d "%~dp0"
python automacao_otimizada_etapas.py

echo.
echo ========================================
echo   AUTOMAÇÃO FINALIZADA
echo ========================================
echo.

pause
