# Script para iniciar API do WhatsApp
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   INICIANDO API DO WHATSAPP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Set-Location whatsapp-api

Write-Host "Verificando se a porta 3000 esta em uso..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 3000 -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Host ""
    Write-Host "[AVISO] A porta 3000 ja esta em uso!" -ForegroundColor Red
    Write-Host ""
    $response = Read-Host "Deseja matar o processo e reiniciar a API? (S/N)"
    
    if ($response -eq "S" -or $response -eq "s") {
        $processId = $portInUse.OwningProcess
        Write-Host "Matando processo $processId..." -ForegroundColor Yellow
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
    } else {
        Write-Host "Operacao cancelada." -ForegroundColor Yellow
        exit
    }
}

Write-Host ""
Write-Host "Iniciando API do WhatsApp..." -ForegroundColor Green
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "   API RODANDO EM: http://localhost:3000" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Login padrao:" -ForegroundColor Yellow
Write-Host "  Email: admin@flow.com" -ForegroundColor White
Write-Host "  Senha: admin123" -ForegroundColor White
Write-Host ""
Write-Host "Pressione Ctrl+C para parar a API" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

npm start
