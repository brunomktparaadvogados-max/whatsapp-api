# Script para monitorar a sessão até o QR Code aparecer

$API_URL = "https://web-service-gxip.onrender.com"
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImlhdCI6MTc2NzQ0NTc1NiwiZXhwIjoxNzY4MDUwNTU2fQ.CZ58scHciMOeEenjQ5eDxFnNpOV9AxC7oGSR3II_N68"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MONITORANDO SESSAO WHATSAPP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $TOKEN"
}

Write-Host "Verificando status da sessao a cada 15 segundos..." -ForegroundColor Yellow
Write-Host "Pressione Ctrl+C para parar" -ForegroundColor Gray
Write-Host ""

$attempt = 0
$maxAttempts = 40

while ($attempt -lt $maxAttempts) {
    $attempt++
    
    try {
        $response = Invoke-RestMethod -Uri "$API_URL/api/my-session" -Method Get -Headers $headers -ErrorAction Stop
        
        $timestamp = Get-Date -Format "HH:mm:ss"
        Write-Host "[$timestamp] Status: $($response.status)" -ForegroundColor Cyan
        
        if ($response.status -eq "qr_code" -and $response.qrCode) {
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "  QR CODE DISPONIVEL!" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "ABRA ESTE LINK NO NAVEGADOR:" -ForegroundColor Yellow
            Write-Host "https://web-service-gxip.onrender.com/api/my-qr" -ForegroundColor White
            Write-Host ""
            Write-Host "Ou use este endpoint com o token:" -ForegroundColor Gray
            Write-Host "GET /api/my-qr" -ForegroundColor Gray
            Write-Host "Authorization: Bearer $TOKEN" -ForegroundColor Gray
            Write-Host ""
            Write-Host "Escaneie o QR Code com seu WhatsApp!" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Continuando monitoramento..." -ForegroundColor Gray
            Write-Host ""
        }
        
        if ($response.status -eq "connected") {
            Write-Host ""
            Write-Host "========================================" -ForegroundColor Green
            Write-Host "  WHATSAPP CONECTADO!" -ForegroundColor Green
            Write-Host "========================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "Numero: $($response.info.wid)" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Sua API esta pronta para enviar mensagens!" -ForegroundColor Green
            break
        }
        
        if ($response.status -eq "authenticated") {
            Write-Host "[$timestamp] QR Code escaneado! Conectando..." -ForegroundColor Yellow
        }
        
    } catch {
        $timestamp = Get-Date -Format "HH:mm:ss"
        
        if ($_.Exception.Response.StatusCode -eq 404) {
            Write-Host "[$timestamp] Sessao ainda nao criada... aguardando" -ForegroundColor Gray
        } else {
            Write-Host "[$timestamp] Erro: $($_.Exception.Message)" -ForegroundColor Red
        }
    }
    
    if ($attempt -lt $maxAttempts) {
        Start-Sleep -Seconds 15
    }
}

if ($attempt -eq $maxAttempts) {
    Write-Host ""
    Write-Host "Timeout atingido apos $($maxAttempts * 15) segundos" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "A sessao pode estar demorando mais que o esperado." -ForegroundColor Yellow
    Write-Host "Verifique manualmente em:" -ForegroundColor Yellow
    Write-Host "https://web-service-gxip.onrender.com/api/my-qr" -ForegroundColor White
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  MONITORAMENTO FINALIZADO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
