# ========================================
# EXPONDO API WHATSAPP PUBLICAMENTE
# ========================================

Write-Host ""
Write-Host "Este script vai expor sua API local na porta 3000 para a internet" -ForegroundColor Cyan
Write-Host "usando o servico localtunnel." -ForegroundColor Cyan
Write-Host ""
Write-Host "A URL publica sera exibida abaixo." -ForegroundColor Yellow
Write-Host "Use essa URL no Lovable como VITE_WHATSAPP_API_URL" -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Inicia a API em uma nova janela
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd whatsapp-api; npm start"

# Aguarda 5 segundos
Start-Sleep -Seconds 5

Write-Host "Iniciando tunel publico..." -ForegroundColor Green
Write-Host ""

# Inicia o localtunnel
lt --port 3000
