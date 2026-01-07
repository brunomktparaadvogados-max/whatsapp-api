# AUTOMAÇÃO OTIMIZADA - EDITAL PDF + MIND-7
# Script PowerShell para executar a automação com todas as melhorias

Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host "           AUTOMAÇÃO OTIMIZADA - EDITAL PDF + MIND-7" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "RECURSOS IMPLEMENTADOS:" -ForegroundColor Green
Write-Host "  ✓ Processamento inteligente de PDF com validação" -ForegroundColor White
Write-Host "  ✓ Conexão robusta ao navegador em debug mode" -ForegroundColor White
Write-Host "  ✓ Pesquisa paralela com controle de rate limiting" -ForegroundColor White
Write-Host "  ✓ Filtro automático: mantém apenas resultados únicos" -ForegroundColor White
Write-Host "  ✓ Clique automático nos CPFs encontrados" -ForegroundColor White
Write-Host "  ✓ Sistema de checkpoint para recuperação de falhas" -ForegroundColor White
Write-Host "  ✓ Logs detalhados de todas as operações" -ForegroundColor White
Write-Host ""

Write-Host "ETAPAS DA AUTOMAÇÃO:" -ForegroundColor Cyan
Write-Host "  1. Processar PDF e extrair dados (Nome, RENACH, Processo)" -ForegroundColor White
Write-Host "  2. Conectar ao navegador Chrome em modo debug" -ForegroundColor White
Write-Host "  3. Pesquisar cada nome no Mind-7 em abas separadas" -ForegroundColor White
Write-Host "  4. Fechar abas com múltiplos resultados ou sem resultados" -ForegroundColor White
Write-Host "  5. Clicar automaticamente no CPF das abas com resultado único" -ForegroundColor White
Write-Host ""

Write-Host "PREPARAÇÃO:" -ForegroundColor Yellow
Write-Host "  1. Certifique-se de ter o Chrome fechado" -ForegroundColor White
Write-Host "  2. Execute: .\iniciar_chrome_debug.bat" -ForegroundColor White
Write-Host "  3. Acesse o Mind-7 e faça login" -ForegroundColor White
Write-Host "  4. Mantenha o navegador aberto durante a execução" -ForegroundColor White
Write-Host ""

$continuar = Read-Host "Deseja continuar? (S/N)"

if ($continuar -ne "S" -and $continuar -ne "s") {
    Write-Host "`nAutomação cancelada pelo usuário." -ForegroundColor Red
    exit
}

Write-Host "`nVerificando dependências Python..." -ForegroundColor Cyan

$dependencias = @("selenium", "PyPDF2")
$faltando = @()

foreach ($dep in $dependencias) {
    $resultado = python -c "import $dep" 2>&1
    if ($LASTEXITCODE -ne 0) {
        $faltando += $dep
    }
}

if ($faltando.Count -gt 0) {
    Write-Host "`nDependências faltando: $($faltando -join ', ')" -ForegroundColor Red
    Write-Host "Instalando dependências..." -ForegroundColor Yellow
    
    foreach ($dep in $faltando) {
        Write-Host "  Instalando $dep..." -ForegroundColor White
        pip install $dep
    }
    
    Write-Host "`n✓ Dependências instaladas!" -ForegroundColor Green
} else {
    Write-Host "✓ Todas as dependências estão instaladas!" -ForegroundColor Green
}

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "                    INICIANDO AUTOMAÇÃO" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""

python automacao_otimizada_etapas.py

Write-Host "`n================================================================================" -ForegroundColor Cyan
Write-Host "                    AUTOMAÇÃO FINALIZADA" -ForegroundColor Yellow
Write-Host "================================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Verifique os arquivos gerados:" -ForegroundColor Green
Write-Host "  - log_automacao_*.txt (Log detalhado)" -ForegroundColor White
Write-Host "  - relatorio_automacao_*.txt (Relatório final)" -ForegroundColor White
Write-Host "  - checkpoint_automacao.json (Checkpoint para recuperação)" -ForegroundColor White
Write-Host ""

Read-Host "Pressione ENTER para sair"
