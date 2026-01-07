@echo off
echo ========================================
echo EXPONDO API WHATSAPP PUBLICAMENTE
echo ========================================
echo.
echo Este script vai expor sua API local na porta 3000 para a internet
echo usando o servico localtunnel.
echo.
echo A URL publica sera exibida abaixo.
echo Use essa URL no Lovable como VITE_WHATSAPP_API_URL
echo.
echo ========================================
echo.

cd whatsapp-api
start "API WhatsApp" cmd /k "npm start"

timeout /t 5 /nobreak >nul

echo Iniciando tunel publico...
echo.
lt --port 3000

pause
