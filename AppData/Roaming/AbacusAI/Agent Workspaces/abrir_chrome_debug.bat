@echo off
echo ========================================
echo ABRINDO CHROME COM DEBUGGING HABILITADO
echo ========================================
echo.
echo Este navegador permitira que a automacao
echo se conecte as suas abas ja logadas!
echo.
echo Faca login no Mind7 e Flow antes de
echo iniciar a automacao.
echo.
echo ========================================

REM Cria diretorio se nao existir
if not exist "C:\selenium\chrome_profile" mkdir "C:\selenium\chrome_profile"

REM Abre Chrome com debugging
start chrome.exe --remote-debugging-port=9222 --user-data-dir="C:\selenium\chrome_profile"

echo.
echo Chrome aberto! Agora:
echo 1. Faca login no Mind7
echo 2. Faca login no Flow
echo 3. Execute a automacao Python
echo.
pause
