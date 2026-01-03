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
    exit 1
}
Write-Host ""

# 2. Listar Sessoes Existentes
Write-Host "2. Listando sessoes existentes..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $sessions = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method Get -Headers $headers

    if ($sessions.sessions.Count -gt 0) {
        Write-Host "   Sessoes encontradas: $($sessions.sessions.Count)" -ForegroundColor Green
        foreach ($session in $sessions.sessions) {
            Write-Host "   - ID: $($session.sessionId) | Status: $($session.status)" -ForegroundColor Cyan
        }

        $existingSession = $sessions.sessions | Where-Object { $_.sessionId -eq "MinhaEmpresa" }
        if ($existingSession) {
            Write-Host ""
            Write-Host "   Sessao 'MinhaEmpresa' ja existe!" -ForegroundColor Yellow
            Write-Host "   Status: $($existingSession.status)" -ForegroundColor Yellow

            if ($existingSession.status -eq "connected") {
                Write-Host ""
                Write-Host "   Sessao ja esta conectada! Pulando criacao..." -ForegroundColor Green
                $skipCreation = $true
            } else {
                Write-Host ""
                Write-Host "   Deletando sessao antiga para criar nova..." -ForegroundColor Yellow
                try {
                    Invoke-RestMethod -Uri "$API_URL/api/sessions/MinhaEmpresa" -Method Delete -Headers $headers
                    Write-Host "   Sessao deletada com sucesso!" -ForegroundColor Green
                    Start-Sleep -Seconds 5
                } catch {
                    Write-Host "   ERRO ao deletar: $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
    } else {
        Write-Host "   Nenhuma sessao encontrada" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# 3. Criar Sessao (se necessario)
if (-not $skipCreation) {
    Write-Host "3. Criando nova sessao WhatsApp..." -ForegroundColor Yellow
    Write-Host "   (Isso pode levar ate 2 minutos...)" -ForegroundColor Gray
    try {
        $headers = @{
            "Authorization" = "Bearer $TOKEN"
            "Content-Type" = "application/json"
        }

        $body = @{
            sessionId = "MinhaEmpresa"
        } | ConvertTo-Json

        $session = Invoke-RestMethod -Uri "$API_URL/api/sessions" -Method Post -Headers $headers -Body $body -TimeoutSec 150
        Write-Host "   Sessao criada: $($session.sessionId)" -ForegroundColor Green
        Write-Host "   Status: $($session.status)" -ForegroundColor Green
    } catch {
        Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
        if ($_.Exception.Response) {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $responseBody = $reader.ReadToEnd()
            Write-Host "   Detalhes: $responseBody" -ForegroundColor Red
        }
        Write-Host ""
        Write-Host "   DICA: O servidor pode estar em modo sleep no Render." -ForegroundColor Yellow
        Write-Host "   Aguarde alguns minutos e tente novamente." -ForegroundColor Yellow
    }
    Write-Host ""

    # 4. Aguardar QR Code
    Write-Host "4. Aguardando QR Code (30 segundos)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
    Write-Host ""
}

# 5. Obter QR Code
Write-Host "5. Obtendo QR Code..." -ForegroundColor Yellow
try {
    $headers = @{
        "Authorization" = "Bearer $TOKEN"
    }

    $qr = Invoke-RestMethod -Uri "$API_URL/api/sessions/MinhaEmpresa/qr" -Method Get -Headers $headers

    if ($qr.qrCode) {
        Write-Host "   QR Code gerado com sucesso!" -ForegroundColor Green
        Write-Host ""
        Write-Host "   ABRA ESTE LINK NO NAVEGADOR:" -ForegroundColor Yellow
        Write-Host "   https://web-service-gxip.onrender.com/api/sessions/MinhaEmpresa/qr" -ForegroundColor White
        Write-Host ""
        Write-Host "   Escaneie o QR Code com seu WhatsApp" -ForegroundColor Cyan
    } else {
        Write-Host "   Status da sessao: $($qr.status)" -ForegroundColor Yellow
        if ($qr.status -eq "connected") {
            Write-Host "   WhatsApp ja esta conectado!" -ForegroundColor Green
        } else {
            Write-Host "   QR Code ainda nao disponivel" -ForegroundColor Yellow
        }
    }
} catch {
    Write-Host "   ERRO: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   A sessao pode nao existir ou ainda estar inicializando" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  TESTE CONCLUIDO!" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
