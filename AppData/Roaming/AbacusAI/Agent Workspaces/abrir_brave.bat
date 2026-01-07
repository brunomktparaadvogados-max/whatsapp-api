@echo off
echo ========================================
echo Abrindo Brave em modo debug...
echo ========================================
echo.
echo Depois que o Brave abrir:
echo 1. Faca login no mind-7.org
echo 2. Passe pelo Cloudflare
echo 3. Va ate a pagina de consultas
echo 4. Execute: python automacao_mind7.py
echo.
echo ========================================
pause
"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe" --remote-debugging-port=9222 --user-data-dir="%TEMP%\brave_debug"
