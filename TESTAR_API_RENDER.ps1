# Script para testar a API WhatsApp no Render

$API_URL = "https://web-service-gxip.onrender.com"
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImlhdCI6MTc2NzQ0NTc1NiwiZXhwIjoxNzY4MDUwNTU2fQ.CZ58scHciMOeEenjQ5eDxFnNpOV9AxC7oGSR3II_N68"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE DA API WHATSAPP NO RENDER" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Health Check
Write-Host "1. Testando Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/health" -Method Get
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    Write-Host "   MongoDB: $($health.mongoConnected)" -ForegroundColor Green
    Write-Host "   Sessoes: $($health.totalSessions)" -ForegroundColor Green
} catch {
    Write-Host "   ERRO: $_" -ForegroundColor Red
}
Write-Host ""

# 2. Criar Sessao
Write-Host "2. Criando sessao WhatsApp..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
        "Content-Type" = "application/json"
    }
    
    $body = @{
        sessionId = "MinhaEmpresa"
    } | ConvertTo-Json
    
    $session = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method Post -Headers $headers -Body $body
    Write-Host "   Sessao criada: $($session.sessionId)" -ForegroundColor Green
    Write-Host "   Status: $($session.status)" -ForegroundColor Green
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Detalhes: $responseBody" -ForegroundColor Red
    }
}
Write-Host ""

# 3. Aguardar QR Code
Write-Host "3. Aguardando QR Code (30 segundos)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

# 4. Obter QR Code
Write-Host "4. Obtendo QR Code..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }
    
    $qr = Invoke-RestMethod -Uri "$API_URL/api/sessions/MinhaEmpresa/qr" -Method Get -Headers $headers
    
    if ($qr.qrCode) {
        Write-Host "   QR Code gerado com sucesso!" -ForegroundColor Green
        Write-Host "   Acesse no navegador: $API_URL/api/sessions/MinhaEmpresa/qr" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "   Ou cole este link no navegador:" -ForegroundColor Yellow
        Write-Host "   https://web-service-gxip.onrender.com/api/sessions/MinhaEmpresa/qr" -ForegroundColor White
    } else {
        Write-Host "   QR Code ainda nao disponivel" -ForegroundColor Yellow
        Write-Host "   Status: $($qr.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE CONCLUIDO!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
