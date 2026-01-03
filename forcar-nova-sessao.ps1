$API_URL = "https://web-service-gxip.onrender.com"
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImlhdCI6MTc2NzQ0NTc1NiwiZXhwIjoxNzY4MDUwNTU2fQ.CZ58scHciMOeEenjQ5eDxFnNpOV9AxC7oGSR3II_N68"

$headers = @{
    "Authorization" = "Bearer $TOKEN"
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  FORCANDO NOVA SESSAO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Verificando sessao atual..." -ForegroundColor Yellow
try {
    $response = Invoke-RestMethod -Uri "$API_URL/api/my-session" -Method Get -Headers $headers -ErrorAction Stop
    Write-Host "   Session ID: $($response.id)" -ForegroundColor Cyan
    Write-Host "   Status: $($response.status)" -ForegroundColor Red
    Write-Host ""
} catch {
    Write-Host "   Nenhuma sessao encontrada (OK)" -ForegroundColor Green
    Write-Host ""
}

Write-Host "2. Deletando sessao user_2..." -ForegroundColor Yellow
try {
    $deleteResponse = Invoke-RestMethod -Uri "$API_URL/api/sessions/user_2" -Method Delete -Headers $headers -ErrorAction Stop
    Write-Host "   Sessao deletada com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "   Erro ao deletar (pode nao existir): $($_.Exception.Message)" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "3. Aguardando 3 segundos..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
Write-Host ""

Write-Host "4. Criando nova sessao..." -ForegroundColor Yellow
try {
    $body = @{
        sessionId = "user_2"
    } | ConvertTo-Json

    $createResponse = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method Post -Headers $headers -ContentType "application/json" -Body $body -ErrorAction Stop
    Write-Host "   Nova sessao criada!" -ForegroundColor Green
    Write-Host "   Session ID: $($createResponse.sessionId)" -ForegroundColor Cyan
    Write-Host "   Status: $($createResponse.status)" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  SUCESSO! Aguarde o QR Code..." -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Execute agora: .\monitorar-sessao.ps1" -ForegroundColor Yellow
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalhes do erro:" -ForegroundColor Yellow
    Write-Host $_.Exception | Format-List -Force
}
