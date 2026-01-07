@echo off
echo ============================================================
echo INICIANDO CHROME EM MODO DEBUG
echo ============================================================

echo Verificando se Chrome ja esta rodando...
tasklist /FI "IMAGENAME eq chrome.exe" 2>NUL | find /I /N "chrome.exe">NUL
if "%ERRORLEVEL%"=="0" (
    echo [!] Chrome ja esta rodando. Fechando para reiniciar em modo debug...
    taskkill /F /IM chrome.exe 2>nul
    timeout /t 3 /nobreak >nul
)

echo Iniciando Chrome em modo debug na porta 9222...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --user-data-dir="%LOCALAPPDATA%\Google\Chrome\User Data\Debug"

timeout /t 2 /nobreak >nul

echo.
echo [OK] Chrome iniciado em modo debug!
echo [OK] Porta: 9222
echo.
