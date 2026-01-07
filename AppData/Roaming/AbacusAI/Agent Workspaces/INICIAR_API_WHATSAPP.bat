@echo off
echo ========================================
echo   INICIANDO API DO WHATSAPP
echo ========================================
echo.

cd whatsapp-api

echo Verificando se a porta 3000 esta em uso...
netstat -ano | findstr :3000 >nul
if %errorlevel% equ 0 (
    echo.
    echo [AVISO] A porta 3000 ja esta em uso!
    echo.
    choice /C SN /M "Deseja matar o processo e reiniciar a API"
    if errorlevel 2 goto :end
    if errorlevel 1 (
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr :3000') do (
            echo Matando processo %%a...
            taskkill /PID %%a /F >nul 2>&1
        )
        timeout /t 2 /nobreak >nul
    )
)

echo.
echo Iniciando API do WhatsApp...
echo.
echo ========================================
echo   API RODANDO EM: http://localhost:3000
echo ========================================
echo.
echo Login padrao:
echo   Email: admin@flow.com
echo   Senha: admin123
echo.
echo Pressione Ctrl+C para parar a API
echo ========================================
echo.

npm start

:end
