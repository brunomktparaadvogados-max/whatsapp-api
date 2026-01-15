# Script PowerShell para executar limpeza de mensagens
# Uso: .\executar-limpeza.ps1

Write-Host "🧹 Script de Limpeza de Mensagens Antigas" -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se o arquivo .env existe
if (-not (Test-Path ".env")) {
    Write-Host "❌ Arquivo .env não encontrado!" -ForegroundColor Red
    Write-Host "💡 Certifique-se de estar no diretório whatsapp-api" -ForegroundColor Yellow
    exit 1
}

# Verificar se node_modules existe
if (-not (Test-Path "node_modules")) {
    Write-Host "⚠️  node_modules não encontrado. Instalando dependências..." -ForegroundColor Yellow
    npm install
}

Write-Host "🚀 Executando limpeza de mensagens..." -ForegroundColor Green
Write-Host ""

# Executar o script de limpeza
node cleanup-messages.js

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Limpeza concluída com sucesso!" -ForegroundColor Green
    Write-Host ""
    Write-Host "📝 Próximos passos:" -ForegroundColor Cyan
    Write-Host "   1. Fazer commit das mudanças: git add . && git commit -m 'feat: limpeza automática'" -ForegroundColor White
    Write-Host "   2. Fazer push para o Koyeb: git push origin main" -ForegroundColor White
    Write-Host "   3. Aguardar deploy automático no Koyeb" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "❌ Erro ao executar limpeza!" -ForegroundColor Red
    Write-Host "💡 Verifique se a DATABASE_URL está correta no .env" -ForegroundColor Yellow
}

Write-Host ""
Read-Host "Pressione Enter para sair"
