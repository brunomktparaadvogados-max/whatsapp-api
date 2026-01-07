# Script para reconectar sessoes WhatsApp

$API_URL = "https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app"

Write-Host "Reconectando sessoes WhatsApp..." -ForegroundColor Cyan
Write-Host ""

Write-Host "1. Fazendo login como admin..." -ForegroundColor Yellow
$loginBody = @{
    email = "admin@flow.com"
    password = "admin123"
} | ConvertTo-Json

try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/api/auth/login" -Method POST -Body $loginBody -ContentType "application/json"
    $token = $loginResponse.token
    Write-Host "Login realizado com sucesso!" -ForegroundColor Green
} catch {
    Write-Host "Erro ao fazer login: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""

Write-Host "2. Criando sessao user_1..." -ForegroundColor Yellow
$headers = @{
    "Authorization" = "Bearer $token"
    "Content-Type" = "application/json"
}

$sessionBody = @{
    sessionId = "user_1"
} | ConvertTo-Json

try {
    $session1Response = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method POST -Headers $headers -Body $sessionBody
    Write-Host "Sessao user_1 criada!" -ForegroundColor Green
} catch {
    Write-Host "Sessao user_1: $_" -ForegroundColor Yellow
}

Write-Host ""

Write-Host "3. Criando sessao user_2..." -ForegroundColor Yellow
$sessionBody = @{
    sessionId = "user_2"
} | ConvertTo-Json

try {
    $session2Response = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method POST -Headers $headers -Body $sessionBody
    Write-Host "Sessao user_2 criada!" -ForegroundColor Green
} catch {
    Write-Host "Sessao user_2: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Sessoes criadas com sucesso!" -ForegroundColor Green
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Yellow
Write-Host "1. Acesse: $API_URL" -ForegroundColor White
Write-Host "2. Faca login com: admin@flow.com / admin123" -ForegroundColor White
Write-Host "3. Escaneie o QR Code para cada sessao" -ForegroundColor White
Write-Host ""
