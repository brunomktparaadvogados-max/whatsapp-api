Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AGUARDANDO DEPLOY NO RENDER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$API_URL = "https://web-service-gxip.onrender.com"
$maxAttempts = 30
$attempt = 0

Write-Host "Verificando se o deploy foi concluido..." -ForegroundColor Yellow
Write-Host "Isso pode levar de 3-5 minutos..." -ForegroundColor Yellow
Write-Host ""

while ($attempt -lt $maxAttempts) {
    $attempt++
    Write-Host "[$attempt/$maxAttempts] Testando API..." -NoNewline
    
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/api/health" -Method Get -TimeoutSec 5 -ErrorAction Stop
        Write-Host " OK!" -ForegroundColor Green
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  DEPLOY CONCLUIDO!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Testando endpoint de debug do Chromium..." -ForegroundColor Yellow
        
        try {
            $debugResponse = Invoke-RestMethod -Uri "$API_URL/api/debug/chromium" -Method Get -ErrorAction Stop
            Write-Host ""
            Write-Host "Chromium Path: $($debugResponse.chromiumPath)" -ForegroundColor Cyan
            Write-Host "Chromium Exists: $($debugResponse.chromiumExists)" -ForegroundColor Cyan
            Write-Host "Chromium Version: $($debugResponse.chromiumVersion)" -ForegroundColor Cyan
            Write-Host ""
        } catch {
            Write-Host "Erro ao testar debug: $($_.Exception.Message)" -ForegroundColor Red
        }
        
        Write-Host "Agora execute: .\forcar-nova-sessao.ps1" -ForegroundColor Yellow
        exit 0
    }
    catch {
        Write-Host " Aguardando..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Red
Write-Host "  TIMEOUT - Deploy demorou muito" -ForegroundColor Red
Write-Host "========================================" -ForegroundColor Red
Write-Host ""
Write-Host "Verifique o status no Render Dashboard" -ForegroundColor Yellow
