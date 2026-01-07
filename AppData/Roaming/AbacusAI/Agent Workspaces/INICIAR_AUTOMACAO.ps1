# ========================================
# SCRIPT DE INICIALIZAÇÃO - AUTOMAÇÃO
# ========================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  INICIALIZANDO AUTOMAÇÃO OTIMIZADA" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$workspacePath = "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces"

Write-Host "PASSO 1: Fechando Chrome existente..." -ForegroundColor Yellow
taskkill /F /IM chrome.exe 2>$null
Start-Sleep -Seconds 2
Write-Host "  OK Chrome fechado!" -ForegroundColor Green
Write-Host ""

Write-Host "PASSO 2: Iniciando Chrome em modo debug..." -ForegroundColor Yellow
$chromeUserData = "$env:USERPROFILE\AppData\Local\Google\Chrome\User Data"
Start-Process chrome -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$chromeUserData`""
Start-Sleep -Seconds 3
Write-Host "  OK Chrome iniciado em modo debug!" -ForegroundColor Green
Write-Host ""

Write-Host "PASSO 3: Aguarde o Chrome abrir completamente..." -ForegroundColor Yellow
Write-Host "  - Acesse o Mind-7" -ForegroundColor White
Write-Host "  - Faca login" -ForegroundColor White
Write-Host "  - Mantenha a aba aberta" -ForegroundColor White
Write-Host ""

Write-Host "Pressione ENTER quando estiver pronto para executar a automacao..." -ForegroundColor Cyan
Read-Host

Write-Host ""
Write-Host "PASSO 4: Executando automacao..." -ForegroundColor Yellow
Set-Location $workspacePath
python automacao_otimizada_etapas.py

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AUTOMACAO FINALIZADA" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Read-Host "Pressione ENTER para sair"
