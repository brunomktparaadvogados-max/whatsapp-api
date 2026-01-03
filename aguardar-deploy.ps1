# Script para aguardar o deploy do Render

$API_URL = "https://web-service-gxip.onrender.com"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  AGUARDANDO DEPLOY DO RENDER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Verificando se o servidor esta respondendo..." -ForegroundColor Yellow
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Gray
Write-Host ""

$attempt = 0
$maxAttempts = 60
$lastStatus = ""

while ($attempt -lt $maxAttempts) {
    $attempt++
    $timestamp = Get-Date -Format "HH:mm:ss"
    
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/api/health" -Method Get -TimeoutSec 10 -ErrorAction Stop
        
        if ($response.status -eq "ok") {
            Write-Host "[$timestamp] Servidor ONLINE!" -ForegroundColor Green
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "  DEPLOY CONCLUIDO!" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "MongoDB: $($response.mongodb)" -ForegroundColor Cyan
            Write-Host "Sessoes ativas: $($response.sessions)" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Agora voce pode criar uma sessao!" -ForegroundColor Yellow
            Write-Host "Execute: .\verificar-logs.ps1" -ForegroundColor White
            break
        }
    } catch {
        $currentStatus = "OFFLINE"
        
        if ($currentStatus -ne $lastStatus) {
            Write-Host "[$timestamp] Servidor offline (aguardando deploy...)" -ForegroundColor Yellow
            $lastStatus = $currentStatus
        } else {
            Write-Host "[$timestamp] ..." -ForegroundColor Gray
        }
    }
    
    if ($attempt -lt $maxAttempts) {
        Start-Sleep -Seconds 10
    }
}

if ($attempt -eq $maxAttempts) {
    Write-Host ""
    Write-Host "Timeout atingido apos $($maxAttempts * 10) segundos" -ForegroundColor Red
    Write-Host "O deploy pode estar demorando mais que o esperado." -ForegroundColor Yellow
    Write-Host "Verifique manualmente em: https://dashboard.render.com" -ForegroundColor White
}

Write-Host ""
