# Script alternativo - Criar sessão de forma assíncrona

$API_URL = "https://web-service-gxip.onrender.com"
$TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjIsImlhdCI6MTc2NzQ0NTc1NiwiZXhwIjoxNzY4MDUwNTU2fQ.CZ58scHciMOeEenjQ5eDxFnNpOV9AxC7oGSR3II_N68"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE RAPIDO - API WHATSAPP" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

# 1. Health Check
Write-Host "1. Verificando servidor..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_URL/health" -Method Get
    Write-Host "   Status: OK" -ForegroundColor Green
} catch {
    Write-Host "   ERRO: Servidor offline" -ForegroundColor Red
    exit 1
}

# 2. Verificar sessões existentes
Write-Host "2. Verificando sessoes..." -ForegroundColor Yellow
try {
    $sessions = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method Get -Headers $headers
    
    $existingSession = $sessions.sessions | Where-Object { $_.sessionId -eq "MinhaEmpresa" }
    
    if ($existingSession) {
        Write-Host "   Sessao encontrada: $($existingSession.status)" -ForegroundColor Cyan
        
        if ($existingSession.status -eq "connected") {
            Write-Host "   WhatsApp JA CONECTADO!" -ForegroundColor Green
            Write-Host ""
            Write-Host "   Sua API esta funcionando!" -ForegroundColor Green
            exit 0
        }
        
        if ($existingSession.status -eq "qr_code") {
            Write-Host "   QR Code disponivel!" -ForegroundColor Yellow
            Write-Host ""
            Write-Host "   ABRA ESTE LINK:" -ForegroundColor Yellow
            Write-Host "   https://web-service-gxip.onrender.com/api/sessions/MinhaEmpresa/qr" -ForegroundColor White
            exit 0
        }
        
        Write-Host "   Deletando sessao antiga..." -ForegroundColor Yellow
        Invoke-RestMethod -Uri "$API_URL/api/sessions/MinhaEmpresa" -Method Delete -Headers $headers | Out-Null
        Start-Sleep -Seconds 3
    }
} catch {
    Write-Host "   Nenhuma sessao encontrada" -ForegroundColor Gray
}

# 3. Criar sessão em background
Write-Host "3. Iniciando nova sessao..." -ForegroundColor Yellow
Write-Host "   (Processo em background - pode levar alguns minutos)" -ForegroundColor Gray
Write-Host ""

$body = @{
    sessionId = "MinhaEmpresa"
} | ConvertTo-Json

# Criar job assíncrono
$job = Start-Job -ScriptBlock {
    param($url, $headers, $body)
    try {
        Invoke-RestMethod -Uri $url -Method Post -Headers $headers -Body $body -TimeoutSec 300
    } catch {
        $_.Exception.Message
    }
} -ArgumentList "$API_URL/api/sessions", $headers, $body

Write-Host "Aguardando inicializacao (verificando a cada 15 segundos)..." -ForegroundColor Cyan
Write-Host ""

# Verificar status a cada 15 segundos
$maxAttempts = 20
$attempt = 0

while ($attempt -lt $maxAttempts) {
    $attempt++
    Start-Sleep -Seconds 15
    
    try {
        $sessions = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method Get -Headers $headers
        $session = $sessions.sessions | Where-Object { $_.sessionId -eq "MinhaEmpresa" }
        
        if ($session) {
            Write-Host "[$attempt] Status: $($session.status)" -ForegroundColor Cyan
            
            if ($session.status -eq "qr_code") {
                Write-Host ""
                Write-Host "QR CODE DISPONIVEL!" -ForegroundColor Green
                Write-Host ""
                Write-Host "ABRA ESTE LINK NO NAVEGADOR:" -ForegroundColor Yellow
                Write-Host "https://web-service-gxip.onrender.com/api/sessions/MinhaEmpresa/qr" -ForegroundColor White
                Write-Host ""
                Write-Host "Escaneie o QR Code com seu WhatsApp" -ForegroundColor Cyan
                
                Stop-Job $job
                Remove-Job $job
                exit 0
            }
            
            if ($session.status -eq "connected") {
                Write-Host ""
                Write-Host "WHATSAPP CONECTADO!" -ForegroundColor Green
                Stop-Job $job
                Remove-Job $job
                exit 0
            }
        } else {
            Write-Host "[$attempt] Aguardando sessao ser criada..." -ForegroundColor Gray
        }
    } catch {
        Write-Host "[$attempt] Verificando..." -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "Timeout atingido. Verifique manualmente:" -ForegroundColor Yellow
Write-Host "https://web-service-gxip.onrender.com/api/sessions/MinhaEmpresa/qr" -ForegroundColor White

Stop-Job $job
Remove-Job $job
