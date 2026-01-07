Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ABRINDO CHROME COM DEBUGGING HABILITADO" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Este navegador permitira que a automacao" -ForegroundColor Yellow
Write-Host "se conecte as suas abas ja logadas!" -ForegroundColor Yellow
Write-Host ""
Write-Host "Faca login no Mind7 e Flow antes de" -ForegroundColor Yellow
Write-Host "iniciar a automacao." -ForegroundColor Yellow
Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

# Cria diretorio se nao existir
$profilePath = "C:\selenium\chrome_profile"
if (-not (Test-Path $profilePath)) {
    New-Item -ItemType Directory -Path $profilePath -Force | Out-Null
    Write-Host "Diretorio criado: $profilePath" -ForegroundColor Green
}

# Procura o Chrome em locais comuns
$chromePaths = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe"
)

$chromePath = $null
foreach ($path in $chromePaths) {
    if (Test-Path $path) {
        $chromePath = $path
        break
    }
}

if ($chromePath) {
    Write-Host ""
    Write-Host "Abrindo Chrome..." -ForegroundColor Green
    Start-Process -FilePath $chromePath -ArgumentList "--remote-debugging-port=9222", "--user-data-dir=`"$profilePath`""
    
    Write-Host ""
    Write-Host "Chrome aberto! Agora:" -ForegroundColor Green
    Write-Host "1. Faca login no Mind7 (https://mind-7.org)" -ForegroundColor White
    Write-Host "2. Faca login no Flow (https://sistemaflow.lovable.app)" -ForegroundColor White
    Write-Host "3. Execute: python automacao_edital_completa.py" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host ""
    Write-Host "ERRO: Chrome nao encontrado!" -ForegroundColor Red
    Write-Host "Instale o Google Chrome ou ajuste o caminho no script." -ForegroundColor Red
    Write-Host ""
}

Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
