# Script para testar API localmente

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE LOCAL - WHATSAPP API" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se o servidor está rodando localmente
Write-Host "1. Verificando se o servidor local esta rodando..." -ForegroundColor Yellow

$localRunning = $false
try {
    $health = Invoke-RestMethod -Uri "http://localhost:3000/health" -Method Get -TimeoutSec 5
    Write-Host "   Servidor LOCAL esta rodando!" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Green
    $localRunning = $true
} catch {
    Write-Host "   Servidor local NAO esta rodando" -ForegroundColor Red
    Write-Host ""
    Write-Host "   Para iniciar o servidor local:" -ForegroundColor Yellow
    Write-Host "   1. Abra um novo terminal" -ForegroundColor White
    Write-Host "   2. cd 'C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api'" -ForegroundColor White
    Write-Host "   3. npm start" -ForegroundColor White
    Write-Host ""
}

if (-not $localRunning) {
    Write-Host "Deseja que eu inicie o servidor agora? (S/N): " -ForegroundColor Yellow -NoNewline
    $response = Read-Host
    
    if ($response -eq "S" -or $response -eq "s") {
        Write-Host ""
        Write-Host "Iniciando servidor..." -ForegroundColor Cyan
        Write-Host ""
        Write-Host "IMPORTANTE: Deixe esta janela aberta!" -ForegroundColor Yellow
        Write-Host "Apos o servidor iniciar, execute o script de teste novamente em OUTRA janela" -ForegroundColor Yellow
        Write-Host ""
        
        Set-Location "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api"
        npm start
    }
    exit
}

Write-Host ""
Write-Host "2. Testando criacao de sessao LOCAL..." -ForegroundColor Yellow
Write-Host "   (Isso funciona melhor localmente)" -ForegroundColor Gray
Write-Host ""

# Criar usuário de teste se necessário
try {
    $registerBody = @{
        email = "teste@local.com"
        password = "teste123"
        name = "Usuario Teste"
        company = "Teste Local"
    } | ConvertTo-Json
    
    $register = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/register" -Method Post -Body $registerBody -ContentType "application/json" -ErrorAction SilentlyContinue
    $TOKEN = $register.token
    Write-Host "   Usuario criado com sucesso!" -ForegroundColor Green
} catch {
    # Tentar login
    try {
        $loginBody = @{
            email = "teste@local.com"
            password = "teste123"
        } | ConvertTo-Json
        
        $login = Invoke-RestMethod -Uri "http://localhost:3000/api/auth/login" -Method Post -Body $loginBody -ContentType "application/json"
        $TOKEN = $login.token
        Write-Host "   Login realizado com sucesso!" -ForegroundColor Green
    } catch {
        Write-Host "   ERRO ao autenticar" -ForegroundColor Red
        exit 1
    }
}

Write-Host ""
Write-Host "3. Criando sessao WhatsApp..." -ForegroundColor Yellow

$headers = @{
    "Authorization" = "Bearer $TOKEN"
    "Content-Type" = "application/json"
}

$body = @{
    sessionId = "TestLocal"
} | ConvertTo-Json

try {
    $session = Invoke-RestMethod -Uri "http://localhost:3000/api/sessions" -Method Post -Headers $headers -Body $body -TimeoutSec 180
    Write-Host "   Sessao criada: $($session.sessionId)" -ForegroundColor Green
    Write-Host "   Status: $($session.status)" -ForegroundColor Green
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "4. Aguardando QR Code (30 segundos)..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host ""
Write-Host "5. Obtendo QR Code..." -ForegroundColor Yellow

try {
    $qr = Invoke-RestMethod -Uri "http://localhost:3000/api/sessions/TestLocal/qr" -Method Get -Headers $headers
    
    if ($qr.qrCode) {
        Write-Host "   QR Code disponivel!" -ForegroundColor Green
        Write-Host ""
        Write-Host "   ABRA ESTE LINK NO NAVEGADOR:" -ForegroundColor Yellow
        Write-Host "   http://localhost:3000/api/sessions/TestLocal/qr" -ForegroundColor White
        Write-Host ""
        Write-Host "   Escaneie com seu WhatsApp!" -ForegroundColor Cyan
    } else {
        Write-Host "   Status: $($qr.status)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE CONCLUIDO!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
