# Script para iniciar Chrome em modo debug
Write-Host "============================================================" -ForegroundColor Green
Write-Host "       INICIANDO CHROME EM MODO DEBUG - PORTA 9222" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# Verificar se Chrome está rodando
Write-Host "[1/5] Verificando processos do Chrome..." -ForegroundColor Yellow
$chromeProcesses = Get-Process chrome -ErrorAction SilentlyContinue

if ($chromeProcesses) {
    Write-Host "      Chrome esta rodando. Fechando todos os processos..." -ForegroundColor Yellow
    Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
    Write-Host "      [OK] Chrome fechado" -ForegroundColor Green
} else {
    Write-Host "      [OK] Chrome nao esta rodando" -ForegroundColor Green
}

# Verificar se a porta 9222 está livre
Write-Host ""
Write-Host "[2/5] Verificando porta 9222..." -ForegroundColor Yellow
$portInUse = Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue

if ($portInUse) {
    Write-Host "      [!] AVISO: Porta 9222 em uso" -ForegroundColor Red
    Write-Host "      Tentando liberar..." -ForegroundColor Yellow
    Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
} else {
    Write-Host "      [OK] Porta 9222 livre" -ForegroundColor Green
}

# Localizar Chrome
Write-Host ""
Write-Host "[3/5] Localizando Chrome..." -ForegroundColor Yellow

$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        Write-Host "      [OK] Chrome encontrado: $path" -ForegroundColor Green
        break
    }
}

if (-not $chromePath) {
    Write-Host "      [X] ERRO: Chrome nao encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Instale o Google Chrome ou especifique o caminho manualmente." -ForegroundColor Red
    Write-Host ""
    Read-Host "Pressione ENTER para sair"
    exit 1
}

# Criar diretório de dados do usuário
Write-Host ""
Write-Host "[4/5] Preparando diretorio de dados..." -ForegroundColor Yellow
$userDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data\Debug"

if (-not (Test-Path $userDataDir)) {
    New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
    Write-Host "      [OK] Diretorio criado: $userDataDir" -ForegroundColor Green
} else {
    Write-Host "      [OK] Diretorio existe: $userDataDir" -ForegroundColor Green
}

# Iniciar Chrome em modo debug
Write-Host ""
Write-Host "[5/5] Iniciando Chrome em modo debug..." -ForegroundColor Yellow

$arguments = @(
    "--remote-debugging-port=9222",
    "--user-data-dir=`"$userDataDir`"",
    "--no-first-run",
    "--no-default-browser-check"
)

try {
    $process = Start-Process -FilePath $chromePath -ArgumentList $arguments -PassThru
    Start-Sleep -Seconds 3
    
    # Verificar se o processo está rodando
    if (Get-Process -Id $process.Id -ErrorAction SilentlyContinue) {
        Write-Host "      [OK] Chrome iniciado com sucesso!" -ForegroundColor Green
        
        # Verificar se a porta está escutando
        Start-Sleep -Seconds 2
        $portCheck = Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue
        
        if ($portCheck) {
            Write-Host "      [OK] Porta 9222 esta escutando!" -ForegroundColor Green
        } else {
            Write-Host "      [!] AVISO: Porta 9222 ainda nao esta escutando" -ForegroundColor Yellow
            Write-Host "      Aguardando mais 3 segundos..." -ForegroundColor Yellow
            Start-Sleep -Seconds 3
        }
    } else {
        Write-Host "      [X] ERRO: Chrome nao iniciou corretamente" -ForegroundColor Red
        exit 1
    }
    
} catch {
    Write-Host "      [X] ERRO ao iniciar Chrome: $_" -ForegroundColor Red
    exit 1
}

# Sucesso
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "           CHROME DEBUG ATIVO - PORTA 9222" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "  STATUS: " -NoNewline -ForegroundColor White
Write-Host "RODANDO" -ForegroundColor Green
Write-Host ""
Write-Host "  PROXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host "    1. Acesse: https://mind-7.org" -ForegroundColor White
Write-Host "    2. Faca login no Mind-7" -ForegroundColor White
Write-Host "    3. Execute: python automacao_completa_duas_fases.py" -ForegroundColor White
Write-Host ""
Write-Host "  IMPORTANTE:" -ForegroundColor Yellow
Write-Host "    - MANTENHA ESTA JANELA ABERTA!" -ForegroundColor Yellow
Write-Host "    - NAO FECHE O CHROME durante a automacao" -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""

# Abrir Mind-7 automaticamente
Write-Host "Abrindo Mind-7 automaticamente em 3 segundos..." -ForegroundColor Cyan
Start-Sleep -Seconds 3

try {
    Start-Process "http://localhost:9222/json" -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
    Start-Process "https://mind-7.org" -ErrorAction SilentlyContinue
} catch {
    Write-Host "[!] Nao foi possivel abrir automaticamente. Abra manualmente." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Monitorando Chrome... (Pressione Ctrl+C para encerrar)" -ForegroundColor Gray
Write-Host ""

# Loop de monitoramento
$counter = 0
while ($true) {
    $counter++
    $timestamp = Get-Date -Format "HH:mm:ss"
    
    # Verificar se Chrome ainda está rodando
    $chromeRunning = Get-Process chrome -ErrorAction SilentlyContinue
    
    if (-not $chromeRunning) {
        Write-Host "[$timestamp] [X] ERRO: Chrome foi fechado!" -ForegroundColor Red
        Write-Host ""
        Write-Host "Execute este script novamente para reiniciar." -ForegroundColor Yellow
        Read-Host "Pressione ENTER para sair"
        exit 1
    }
    
    # Verificar porta
    $portActive = Get-NetTCPConnection -LocalPort 9222 -State Listen -ErrorAction SilentlyContinue
    
    if ($portActive) {
        Write-Host "[$timestamp] Chrome debug ativo (porta 9222)" -ForegroundColor Green
    } else {
        Write-Host "[$timestamp] [!] AVISO: Porta 9222 nao esta escutando" -ForegroundColor Yellow
    }
    
    Start-Sleep -Seconds 30
}
