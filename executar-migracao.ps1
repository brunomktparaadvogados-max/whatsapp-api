# ========================================
# SCRIPT PARA EXECUTAR MIGRAÇÃO VIA API
# ========================================
# Execute este script no PowerShell para corrigir a tabela messages

$DATABASE_URL = $env:DATABASE_URL

if (-not $DATABASE_URL) {
    Write-Host "❌ Variável DATABASE_URL não encontrada!" -ForegroundColor Red
    Write-Host "Configure com: `$env:DATABASE_URL = 'sua_connection_string'" -ForegroundColor Yellow
    exit 1
}

Write-Host "🔄 Executando migração da tabela messages..." -ForegroundColor Cyan

# SQL da migração
$sql = @"
-- Backup da tabela antiga
CREATE TABLE IF NOT EXISTS messages_backup AS SELECT * FROM messages;

-- Dropar tabela antiga
DROP TABLE IF EXISTS messages CASCADE;

-- Recriar com schema correto
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  message_type TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  media_mimetype TEXT,
  from_me BOOLEAN NOT NULL,
  timestamp BIGINT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact_phone ON messages(contact_phone);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_from_me ON messages(from_me);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
"@

# Salvar SQL em arquivo temporário
$sqlFile = "migration_temp.sql"
$sql | Out-File -FilePath $sqlFile -Encoding UTF8

Write-Host "📝 SQL salvo em: $sqlFile" -ForegroundColor Green

# Executar via psql (se disponível)
try {
    Write-Host "🚀 Executando migração..." -ForegroundColor Cyan
    psql $DATABASE_URL -f $sqlFile
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "✅ Migração executada com sucesso!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🎉 Tabela messages recriada com schema correto!" -ForegroundColor Green
        Write-Host ""
        Write-Host "📋 Próximos passos:" -ForegroundColor Yellow
        Write-Host "1. Envie uma mensagem do celular para o WhatsApp" -ForegroundColor White
        Write-Host "2. Verifique os logs do Koyeb (não deve ter mais erro)" -ForegroundColor White
        Write-Host "3. Acesse o CRM/Flow e clique em 'Assumir conversa'" -ForegroundColor White
        Write-Host "4. As mensagens devem aparecer no chat!" -ForegroundColor White
    } else {
        Write-Host "❌ Erro ao executar migração!" -ForegroundColor Red
        Write-Host "Execute manualmente no Supabase SQL Editor" -ForegroundColor Yellow
    }
} catch {
    Write-Host "❌ psql não encontrado!" -ForegroundColor Red
    Write-Host ""
    Write-Host "📋 ALTERNATIVA - Execute manualmente:" -ForegroundColor Yellow
    Write-Host "1. Acesse: https://supabase.com/dashboard" -ForegroundColor White
    Write-Host "2. Vá em SQL Editor" -ForegroundColor White
    Write-Host "3. Cole o conteúdo do arquivo: $sqlFile" -ForegroundColor White
    Write-Host "4. Clique em RUN" -ForegroundColor White
}

# Limpar arquivo temporário
# Remove-Item $sqlFile -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "📄 Arquivo SQL disponível em: $sqlFile" -ForegroundColor Cyan
Write-Host "Você pode executar manualmente se preferir." -ForegroundColor Gray
