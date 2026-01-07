# 🔧 CORREÇÃO COMPLETA: Problemas da API WhatsApp

## 🚨 PROBLEMAS IDENTIFICADOS

### 1. Sessões "Fantasma" no Banco de Dados
- Sessões existem no banco mas não na memória
- Não podem ser deletadas (erro: "Sessão não encontrada")
- Não podem enviar mensagens
- Acontece quando o servidor Render reinicia

### 2. API Não Reconecta Sessões Automaticamente
- Após restart, sessões antigas ficam órfãs
- Precisam ser recriadas manualmente

### 3. API Não Tem Suporte a Webhook
- Não envia mensagens para Supabase automaticamente
- Salva apenas no SQLite local

## ✅ SOLUÇÃO IMEDIATA: Limpar Banco e Recomeçar

Como você não tem acesso ao código-fonte, vou criar uma **solução alternativa**:

### PASSO 1: Forçar Restart do Servidor Render

Acesse o dashboard do Render e force um restart completo:

1. Acesse: https://dashboard.render.com/
2. Encontre o serviço `whatsapp-api-ugdv`
3. Clique em **"Manual Deploy"** → **"Clear build cache & deploy"**
4. Aguarde 5-10 minutos

**OU** use a API do Render (se tiver a chave):

```bash
# Reiniciar serviço via API do Render
curl -X POST https://api.render.com/v1/services/YOUR_SERVICE_ID/restart \
  -H "Authorization: Bearer YOUR_RENDER_API_KEY"
```

### PASSO 2: Criar Script de Limpeza

Vou criar um script que acessa diretamente o banco SQLite e limpa as sessões:

**Opção A: Via SSH no Render** (se tiver acesso)
```bash
# Conectar no servidor
render ssh whatsapp-api-ugdv

# Acessar banco SQLite
sqlite3 data/database.sqlite

# Deletar todas as sessões
DELETE FROM sessions;

# Sair
.exit
exit
```

**Opção B: Via API (Criar endpoint de limpeza)**

Precisaria adicionar uma rota administrativa no código.

### PASSO 3: Solução Definitiva - Modificar Código

Edite `whatsapp-api/src/SessionManager.js` linha 262-281:

**ANTES:**
```javascript
async deleteSession(sessionId) {
  const session = this.sessions.get(sessionId);
  if (!session) {
    throw new Error('Sessão não encontrada');  // ← PROBLEMA AQUI
  }

  if (session.client) {
    await session.client.destroy();
  }

  this.sessions.delete(sessionId);
  await this.db.deleteSession(sessionId);

  const sessionPath = path.join(this.sessionDir, `session-${sessionId}`);
  if (fs.existsSync(sessionPath)) {
    fs.rmSync(sessionPath, { recursive: true, force: true });
  }

  return true;
}
```

**DEPOIS:**
```javascript
async deleteSession(sessionId) {
  const session = this.sessions.get(sessionId);
  
  // Permitir deletar mesmo se não estiver na memória
  if (session) {
    if (session.client) {
      try {
        await session.client.destroy();
      } catch (error) {
        console.error('Erro ao destruir cliente:', error);
      }
    }
    this.sessions.delete(sessionId);
  }

  // Sempre deletar do banco
  try {
    await this.db.deleteSession(sessionId);
  } catch (error) {
    console.error('Erro ao deletar do banco:', error);
  }

  // Sempre deletar arquivos de sessão
  const sessionPath = path.join(this.sessionDir, `session-${sessionId}`);
  if (fs.existsSync(sessionPath)) {
    try {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Erro ao deletar arquivos:', error);
    }
  }

  return true;
}
```

## 🎯 SOLUÇÃO PRÁTICA AGORA

Como você não pode modificar o código imediatamente, vou criar uma **nova sessão do zero**:

### PASSO 1: Criar Nova Sessão com ID Único

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc2NzM4OTQ2MywiZXhwIjoxNzY3OTk0MjYzfQ.F5cqVqHr9kBirXSfVQUxYTCZo6egeC-JkF1LZ0m-N1U"

# Criar nova sessão com ID único
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"BRUNO_JAN_2026"}'
```

### PASSO 2: Aguardar e Buscar QR Code

```bash
# Aguardar 15 segundos para gerar QR Code
echo "Aguardando 15 segundos..."
sleep 15

# Buscar QR Code
curl -s https://whatsapp-api-ugdv.onrender.com/api/sessions/BRUNO_JAN_2026/qr \
  -H "Authorization: Bearer $TOKEN"
```

### PASSO 3: Escanear IMEDIATAMENTE

⚠️ **Você tem 60 segundos!**

1. Abra WhatsApp no celular
2. Configurações → Aparelhos conectados
3. Conectar um aparelho
4. Escaneie o QR Code

### PASSO 4: Testar Envio

```bash
# Enviar mensagem de teste
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions/BRUNO_JAN_2026/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511935001870",
    "message": "✅ Nova sessão funcionando!"
  }'
```

## 🚀 EXECUTANDO AGORA

Vou executar os comandos para você:
