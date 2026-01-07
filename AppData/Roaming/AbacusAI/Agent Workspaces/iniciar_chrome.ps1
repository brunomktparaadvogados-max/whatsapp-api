# ====================================================================
#           COMANDOS PARA POWERSHELL - AUTOMACAO MIND-7
# ====================================================================

# PASSO 1: FECHAR TODOS OS CHROME
# ====================================================================
Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
Write-Host "[OK] Chrome fechado" -ForegroundColor Green
Start-Sleep -Seconds 3

# PASSO 2: INICIAR CHROME EM MODO DEBUG
# ====================================================================
Write-Host "[!] Iniciando Chrome em modo debug..." -ForegroundColor Yellow

$chromePath = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$userDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data\Debug"

Start-Process -FilePath $chromePath -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$userDataDir`""

Start-Sleep -Seconds 3

Write-Host "[OK] Chrome iniciado!" -ForegroundColor Green
Write-Host "[!] Aguarde o Chrome abrir..." -ForegroundColor Yellow

Start-Sleep -Seconds 2

# PASSO 3: ABRIR MIND-7
# ====================================================================
Start-Process "https://mind-7.org"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  CHROME DEBUG ATIVO - PORTA 9222" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "  1. Faca login no Mind-7" -ForegroundColor White
Write-Host "  2. Execute: python automacao_simples.py" -ForegroundColor White
Write-Host ""
Write-Host "IMPORTANTE: MANTENHA ESTA JANELA ABERTA!" -ForegroundColor Red
Write-Host ""

# MANTER JANELA ABERTA
Write-Host "Pressione Ctrl+C para encerrar o Chrome debug..." -ForegroundColor Gray
while ($true) {
    Start-Sleep -Seconds 30
    $chromeRunning = Get-Process chrome -ErrorAction SilentlyContinue
    if ($chromeRunning) {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Chrome debug ativo" -ForegroundColor Green
    } else {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] [X] Chrome foi fechado!" -ForegroundColor Red
        break
    }
}
