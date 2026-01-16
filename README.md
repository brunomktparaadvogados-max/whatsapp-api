# 📱 WhatsApp API Gratuita

API REST completa e **100% gratuita** para integrar WhatsApp em seus sistemas, similar ao W-API mas totalmente open-source e sem custos.

## ✨ Características

- ✅ **Totalmente Gratuito** - Sem custos, sem limites
- 🔄 **Múltiplas Instâncias** - Gerencie várias contas WhatsApp simultaneamente
- 🪝 **Webhooks** - Receba eventos em tempo real (mensagens, status, etc)
- 📱 **QR Code** - Interface web para escanear e conectar
- 🚀 **REST API** - Endpoints simples e intuitivos
- 🐳 **Docker Ready** - Deploy fácil com Docker
- 💚 **Open Source** - Código aberto e personalizável

## 🚀 Instalação Rápida

### Opção 1: Docker (Recomendado)

```bash
cd whatsapp-api
docker-compose up -d
```

Acesse: http://localhost:3000

### Opção 2: Node.js

```bash
cd whatsapp-api
npm install
npm start
```

## 📖 Como Usar

### 1. Criar uma Sessão

**Via Interface Web:**
- Acesse http://localhost:3000
- Preencha o ID da sessão e webhook (opcional)
- Clique em "Criar Sessão"
- Escaneie o QR Code com seu WhatsApp

**Via API:**
```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "minha-sessao",
    "webhookUrl": "https://seu-servidor.com/webhook"
  }'
```

### 2. Obter QR Code

```bash
curl http://localhost:3000/api/sessions/minha-sessao/qr
```

### 3. Enviar Mensagem

```bash
curl -X POST http://localhost:3000/api/sessions/minha-sessao/messages \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "message": "Olá! Mensagem enviada pela API gratuita!"
  }'
```

### 4. Enviar Mídia (Imagem, Vídeo, Documento)

```bash
curl -X POST http://localhost:3000/api/sessions/minha-sessao/messages/media \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "mediaUrl": "https://exemplo.com/imagem.jpg",
    "caption": "Legenda da imagem"
  }'
```

## 🔌 Endpoints da API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/sessions` | Criar nova sessão |
| GET | `/api/sessions` | Listar todas as sessões |
| GET | `/api/sessions/:id` | Obter detalhes da sessão |
| GET | `/api/sessions/:id/qr` | Obter QR Code |
| DELETE | `/api/sessions/:id` | Deletar sessão |
| POST | `/api/sessions/:id/messages` | Enviar mensagem de texto |
| POST | `/api/sessions/:id/messages/media` | Enviar mídia |
| GET | `/api/sessions/:id/chats` | Listar conversas |
| GET | `/api/sessions/:id/contacts` | Listar contatos |
| PUT | `/api/sessions/:id/webhook` | Atualizar webhook |

## 🪝 Webhooks

Configure um webhook para receber eventos em tempo real:

### Eventos Disponíveis:

**1. ready** - Cliente conectado
```json
{
  "event": "ready",
  "sessionId": "minha-sessao",
  "data": {
    "wid": "5511999999999@c.us",
    "pushname": "Meu Nome",
    "platform": "android"
  }
}
```

**2. message** - Nova mensagem recebida
```json
{
  "event": "message",
  "sessionId": "minha-sessao",
  "data": {
    "id": "message-id",
    "from": "5511888888888@c.us",
    "to": "5511999999999@c.us",
    "body": "Olá!",
    "type": "chat",
    "timestamp": 1234567890,
    "fromMe": false,
    "hasMedia": false
  }
}
```

**3. message_ack** - Status da mensagem
```json
{
  "event": "message_ack",
  "sessionId": "minha-sessao",
  "data": {
    "id": "message-id",
    "ack": 3
  }
}
```

Status (ack):
- 0: Erro
- 1: Pendente
- 2: Enviada ao servidor
- 3: Entregue
- 4: Lida

**4. disconnected** - Cliente desconectado
```json
{
  "event": "disconnected",
  "sessionId": "minha-sessao",
  "reason": "LOGOUT"
}
```

## 🔧 Integração com N8N

1. No N8N, crie um Webhook node
2. Copie a URL do webhook
3. Configure na sua sessão:

```bash
curl -X PUT http://localhost:3000/api/sessions/minha-sessao/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://seu-n8n.com/webhook/whatsapp"
  }'
```

4. Pronto! Todos os eventos serão enviados para o N8N

## 📋 Exemplos de Uso

### Enviar mensagem para múltiplos contatos

```javascript
const contacts = ['5511999999999', '5511888888888'];
const message = 'Olá! Esta é uma mensagem em massa.';

for (const contact of contacts) {
  await fetch('http://localhost:3000/api/sessions/minha-sessao/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: contact, message })
  });
}
```

### Responder mensagens automaticamente

Configure um webhook e crie um endpoint que responde:

```javascript
app.post('/webhook', async (req, res) => {
  const { event, data } = req.body;
  
  if (event === 'message' && !data.fromMe) {
    await fetch('http://localhost:3000/api/sessions/minha-sessao/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: data.from,
        message: 'Obrigado pela mensagem! Responderemos em breve.'
      })
    });
  }
  
  res.sendStatus(200);
});
```

## 🆚 Comparação com W-API

| Recurso | W-API | Esta API |
|---------|-------|----------|
| Custo | Pago | **Gratuito** |
| Múltiplas Instâncias | ✅ | ✅ |
| Webhooks | ✅ | ✅ |
| QR Code | ✅ | ✅ |
| Enviar Mensagens | ✅ | ✅ |
| Enviar Mídia | ✅ | ✅ |
| Open Source | ❌ | ✅ |
| Self-Hosted | ❌ | ✅ |

## 🛠️ Tecnologias

- **Node.js** - Runtime JavaScript
- **Express** - Framework web
- **whatsapp-web.js** - Biblioteca WhatsApp Web
- **Puppeteer** - Automação do navegador
- **Docker** - Containerização

## ⚠️ Avisos Importantes

1. **Uso Responsável**: Use esta API de acordo com os Termos de Serviço do WhatsApp
2. **Não é Oficial**: Esta API não é oficial do WhatsApp
3. **Risco de Ban**: Uso excessivo pode resultar em banimento da conta
4. **Backup**: Faça backup da pasta `sessions` para não perder suas conexões

## 🤝 Contribuindo

Contribuições são bem-vindas! Sinta-se à vontade para:
- Reportar bugs
- Sugerir novas funcionalidades
- Enviar pull requests

## 📄 Licença

MIT License - Livre para uso pessoal e comercial

## 🌟 Créditos

Baseado em:
- [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js)
- Inspirado no W-API e outras soluções comerciais

---

**Desenvolvido com 💚 para a comunidade open-source**

Se este projeto foi útil, considere dar uma ⭐ no repositório!
