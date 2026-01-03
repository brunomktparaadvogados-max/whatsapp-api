Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AGUARDANDO REBUILD E TESTANDO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$API_URL = "https://web-service-gxip.onrender.com"

Write-Host "Aguardando 4 minutos para o Render fazer rebuild completo..." -ForegroundColor Yellow
Write-Host ""

for ($i = 1; $i -le 24; $i++) {
    $remaining = 24 - $i
    Write-Host "[$i/24] Aguardando... ($remaining ciclos restantes)" -ForegroundColor Cyan
    Start-Sleep -Seconds 10
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "  TESTANDO ENDPOINTS" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

Write-Host "1. Testando /api/health..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/api/health" -Method Get -ErrorAction Stop
    Write-Host "   Status: OK" -ForegroundColor Green
    Write-Host "   Uptime: $($health.uptime) segundos" -ForegroundColor Cyan
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Testando /api/debug/chromium..." -ForegroundColor Yellow
try {
    $debug = Invoke-RestMethod -Uri "$API_URL/api/debug/chromium" -Method Get -ErrorAction Stop
    Write-Host "   Chromium Path: $($debug.chromiumPath)" -ForegroundColor Cyan
    Write-Host "   Chromium Exists: $($debug.chromiumExists)" -ForegroundColor $(if($debug.chromiumExists) {"Green"} else {"Red"})
    Write-Host "   Chromium Version: $($debug.chromiumVersion)" -ForegroundColor Cyan
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE CONCLUIDO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Agora execute: .\forcar-nova-sessao.ps1" -ForegroundColor Yellow
