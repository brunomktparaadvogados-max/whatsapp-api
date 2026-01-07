# 🔧 ADICIONAR WEBHOOK AO WHATSAPP API

## 🚨 PROBLEMA IDENTIFICADO

A API WhatsApp **não tem suporte nativo para webhooks externos**. Ela salva as mensagens apenas no banco SQLite local.

Para integrar com o Supabase, precisamos adicionar código que envie as mensagens para o webhook.

## ✅ SOLUÇÃO: Adicionar Webhook ao SessionManager

### PASSO 1: Adicionar Configuração de Webhook

Edite o arquivo `whatsapp-api/src/SessionManager.js`:

**Linha 26-33** (adicionar campo webhook):
```javascript
const sessionData = {
  id: sessionId,
  userId,
  qrCode: null,
  status: 'initializing',
  client: null,
  info: null,
  webhookUrl: null  // ← ADICIONAR ESTA LINHA
};
```

### PASSO 2: Adicionar Função de Envio para Webhook

**Adicionar após linha 62** (antes de `setupClientEvents`):
```javascript
async sendToWebhook(webhookUrl, eventType, data) {
  if (!webhookUrl) return;
  
  try {
    const fetch = require('node-fetch');
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        event: eventType,
        data: data,
        timestamp: new Date().toISOString()
      })
    });
    
    if (!response.ok) {
      console.error(`Erro ao enviar webhook: ${response.status}`);
    }
  } catch (error) {
    console.error('Erro ao enviar webhook:', error.message);
  }
}
```

### PASSO 3: Modificar Evento de Mensagem

**Linha 135-173** (modificar para enviar webhook):
```javascript
client.on('message', async (message) => {
  const contactPhone = message.from.replace('@c.us', '');

  const messageData = {
    id: message.id._serialized,
    sessionId: sessionData.id,
    contactPhone,
    messageType: message.type,
    body: message.body,
    mediaUrl: null,
    mediaMimetype: null,
    fromMe: message.fromMe,
    timestamp: message.timestamp,
    status: 'received'
  };

  if (message.hasMedia) {
    try {
      const media = await message.downloadMedia();
      messageData.mediaUrl = `data:${media.mimetype};base64,${media.data}`;
      messageData.mediaMimetype = media.mimetype;
    } catch (error) {
      console.error('Erro ao baixar mídia:', error);
    }
  }

  await this.db.saveMessage(messageData);
  await this.db.upsertContact(sessionData.id, contactPhone, message._data.notifyName);

  // ← ADICIONAR ESTAS LINHAS
  if (sessionData.webhookUrl) {
    await this.sendToWebhook(sessionData.webhookUrl, 'message', messageData);
  }

  this.io.to(`user_${sessionData.userId}`).emit('new_message', {
    sessionId: sessionData.id,
    message: messageData
  });

  if (!message.fromMe) {
    await this.processAutoReplies(sessionData.id, message);
  }
});
```

### PASSO 4: Adicionar Método para Configurar Webhook

**Adicionar após linha 281** (após `deleteSession`):
```javascript
async setWebhook(sessionId, webhookUrl) {
  const session = this.sessions.get(sessionId);
  if (!session) {
    throw new Error('Sessão não encontrada');
  }

  session.webhookUrl = webhookUrl;
  
  // Salvar no banco de dados
  await this.db.updateSessionWebhook(sessionId, webhookUrl);
  
  return true;
}

async getWebhook(sessionId) {
  const session = this.sessions.get(sessionId);
  if (!session) {
    throw new Error('Sessão não encontrada');
  }

  return session.webhookUrl;
}
```

### PASSO 5: Adicionar Rota no Server

Edite o arquivo `whatsapp-api/src/server.js`:

**Adicionar após a rota de QR Code** (após linha ~220):
```javascript
// Configurar webhook
app.put('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { webhookUrl } = req.body;

    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl é obrigatório' });
    }

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    await sessionManager.setWebhook(sessionId, webhookUrl);

    res.json({
      success: true,
      message: 'Webhook configurado com sucesso',
      webhookUrl
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Obter webhook configurado
app.get('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const webhookUrl = await sessionManager.getWebhook(sessionId);

    res.json({
      success: true,
      webhookUrl
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### PASSO 6: Adicionar Método no Database

Edite o arquivo `whatsapp-api/src/database.js`:

**Adicionar método para salvar webhook**:
```javascript
async updateSessionWebhook(sessionId, webhookUrl) {
  return new Promise((resolve, reject) => {
    this.db.run(
      'UPDATE sessions SET webhook_url = ? WHERE id = ?',
      [webhookUrl, sessionId],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}
```

**Adicionar coluna webhook_url na tabela sessions** (se não existir):
```javascript
// No método de inicialização do banco, adicionar:
this.db.run(`
  ALTER TABLE sessions ADD COLUMN webhook_url TEXT
`, (err) => {
  if (err && !err.message.includes('duplicate column')) {
    console.error('Erro ao adicionar coluna webhook_url:', err);
  }
});
```

## 🚀 SOLUÇÃO ALTERNATIVA (SEM MODIFICAR CÓDIGO)

Como você não tem acesso direto ao código no Render, vou criar uma **solução intermediária**:

### Usar um Serviço Proxy

Crie um serviço que:
1. Monitora o banco SQLite da API
2. Envia novas mensagens para o Supabase

**OU**

### Usar a Interface Web + Script

A interface web já tem WebSocket que recebe mensagens em tempo real. Podemos criar um script que:
1. Conecta no WebSocket
2. Escuta mensagens
3. Envia para o Supabase

## 💡 SOLUÇÃO IMEDIATA: Testar Envio de Mensagem

Vamos testar se a API está funcionando corretamente:

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc2NzM4OTQ2MywiZXhwIjoxNzY3OTk0MjYzfQ.F5cqVqHr9kBirXSfVQUxYTCZo6egeC-JkF1LZ0m-N1U"

# Enviar mensagem de teste
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions/T/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511935001870",
    "message": "🎉 Teste de API WhatsApp funcionando!"
  }'
```

## 📊 STATUS ATUAL

✅ **Sessão T conectada** - Número: 5511935001870  
✅ **Sessão A deletada**  
❌ **Webhook não configurado** - API não tem suporte nativo  
⚠️ **Mensagens salvas apenas localmente** - No SQLite da API

## 🎯 PRÓXIMOS PASSOS

### OPÇÃO 1: Modificar Código da API (Recomendado)
Se você tem acesso ao repositório Git da API no Render:
1. Adicionar código de webhook (acima)
2. Fazer commit e push
3. Render fará deploy automático
4. Configurar webhook via API

### OPÇÃO 2: Criar Serviço Intermediário
Criar um serviço Node.js que:
1. Conecta no WebSocket da API
2. Escuta mensagens em tempo real
3. Envia para o Supabase

### OPÇÃO 3: Usar Apenas a API (Sem Webhook)
1. Usar a API para enviar mensagens
2. Buscar mensagens via API quando necessário
3. Não ter histórico automático no Supabase

---

**Qual opção você prefere?**

1. Modificar o código da API (precisa acesso ao Git)
2. Criar serviço intermediário (posso criar agora)
3. Usar apenas para envio (sem recebimento automático)
