# Script para verificar informações de debug da API

$API_URL = "https://web-service-gxip.onrender.com"
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImlhdCI6MTc2NzQ0NTc1NiwiZXhwIjoxNzY4MDUwNTU2fQ.CZ58scHciMOeEenjQ5eDxFnNpOV9AxC7oGSR3II_N68"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VERIFICANDO CONFIGURACAO DO SERVIDOR" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $TOKEN"
}

Write-Host "1. Verificando variaveis de ambiente..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_URL/api/health" -Method Get -ErrorAction Stop
    Write-Host "   Node Environment: $($response.environment)" -ForegroundColor Cyan
    Write-Host "   MongoDB: $($response.mongodb)" -ForegroundColor Cyan
    Write-Host "   Sessoes ativas: $($response.sessions)" -ForegroundColor Cyan
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "2. Verificando sessao atual..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_URL/api/my-session" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "   Session ID: $($response.id)" -ForegroundColor Cyan
    Write-Host "   Status: $($response.status)" -ForegroundColor Cyan
    Write-Host "   User ID: $($response.userId)" -ForegroundColor Cyan
    Write-Host "   Last Seen: $($response.lastSeen)" -ForegroundColor Cyan
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "3. Tentando deletar e recriar sessao..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$API_URL/api/sessions/user_2" -Method Delete -Headers $headers -ErrorAction Stop
    Write-Host "   Sessao deletada com sucesso" -ForegroundColor Green
    
    Start-Sleep -Seconds 2
    
    Write-Host "   Criando nova sessao..." -ForegroundColor Yellow
    $createResponse = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method Post -Headers $headers -ContentType "application/json" -Body '{"sessionId":"user_2"}' -ErrorAction Stop
    Write-Host "   Nova sessao criada: $($createResponse.sessionId)" -ForegroundColor Green
    Write-Host "   Status: $($createResponse.status)" -ForegroundColor Cyan
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  VERIFICACAO CONCLUIDA" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
