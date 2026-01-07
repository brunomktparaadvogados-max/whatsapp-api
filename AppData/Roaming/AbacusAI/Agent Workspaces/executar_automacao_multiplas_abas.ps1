# ========================================
# AUTOMAÇÃO COM MÚLTIPLAS ABAS - MIND-7
# ========================================
# Versão otimizada que abre várias abas
# do Mind-7 simultaneamente para processar
# múltiplos nomes ao mesmo tempo
# ========================================

Write-Host "=" -NoNewline -ForegroundColor Cyan
Write-Host ("="*59) -ForegroundColor Cyan
Write-Host "AUTOMAÇÃO - MÚLTIPLAS ABAS SIMULTÂNEAS" -ForegroundColor Yellow
Write-Host ("="*60) -ForegroundColor Cyan

Write-Host "`nPasso 1: Verificando Chrome em modo debug..." -ForegroundColor Green

$chromeProcess = Get-Process chrome -ErrorAction SilentlyContinue | Where-Object {$_.CommandLine -like "*remote-debugging-port=9222*"}

if (-not $chromeProcess) {
    Write-Host "Chrome não está em modo debug!" -ForegroundColor Red
    Write-Host "`nExecutando abrir_chrome_debug.bat..." -ForegroundColor Yellow
    Start-Process -FilePath ".\abrir_chrome_debug.bat" -Wait
    Start-Sleep -Seconds 3
}

Write-Host "`nPasso 2: Iniciando automação..." -ForegroundColor Green
Write-Host "Arquivo: automacao_flow_multiplas_abas.py" -ForegroundColor Cyan

python automacao_flow_multiplas_abas.py

Write-Host "`n" -NoNewline
Write-Host ("="*60) -ForegroundColor Cyan
Write-Host "AUTOMAÇÃO FINALIZADA" -ForegroundColor Yellow
Write-Host ("="*60) -ForegroundColor Cyan

pause
