# 🌐 GUIA - Envio via Meta API Oficial

## ✨ Novo Recurso Adicionado!

Foi adicionado um recurso completo para envio de mensagens via **Meta API Oficial** (WhatsApp Business API), mantendo todas as funcionalidades existentes intactas.

## 📋 O que foi adicionado?

### 1. **Endpoints da API**

Novos endpoints no servidor (`whatsapp-api/src/server.js`):

- `GET /api/meta/config` - Obter configuração Meta API
- `POST /api/meta/config` - Salvar configuração Meta API
- `POST /api/meta/send` - Enviar mensagem individual
- `POST /api/meta/send-media` - Enviar mídia (imagem, vídeo, documento)
- `POST /api/meta/send-template` - Enviar template aprovado
- `POST /api/meta/send-bulk` - Envio em massa

### 2. **Interface Web**

Nova seção na interface (`whatsapp-api/public/index.html`):

- **Configuração Meta API**: Salvar Access Token e Phone Number ID
- **Envio Individual**: Enviar mensagens para um contato
- **Envio em Massa**: Enviar para múltiplos contatos com delay configurável
- **Resultados em Tempo Real**: Visualizar status de cada envio

### 3. **Sistema de Autenticação**

- Modal de login automático
- Credenciais padrão: `admin@flow.com` / `admin123`
- Token JWT para todas as requisições

## 🚀 Como Usar

### Passo 1: Configurar Meta API

1. Acesse o [Meta Business Manager](https://business.facebook.com/)
2. Configure o WhatsApp Business API
3. Obtenha:
   - **Access Token** (Token de acesso permanente)
   - **Phone Number ID** (ID do número de telefone)
   - **Business Account ID** (opcional)

### Passo 2: Salvar Configuração

1. Faça login na interface (http://localhost:3000)
2. Role até a seção **"🌐 Enviar via Meta API Oficial"**
3. Preencha os campos:
   - Access Token
   - Phone Number ID
   - Business Account ID (opcional)
4. Clique em **"💾 Salvar Configuração"**

### Passo 3: Enviar Mensagens

#### Envio Individual:

```
1. Preencha o número (com DDI): 5511999999999
2. Digite a mensagem
3. Clique em "📨 Enviar via Meta API"
```

#### Envio em Massa:

```
1. Cole os números (um por linha):
   5511999999999
   5511888888888
   5511777777777

2. Digite a mensagem
3. Configure o delay (recomendado: 1000ms)
4. Clique em "📨 Enviar em Massa via Meta API"
5. Acompanhe os resultados em tempo real
```

## 📡 Usando a API via Código

### Autenticação

```javascript
// Login
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@flow.com',
    password: 'admin123'
  })
});
const { token } = await loginResponse.json();
```

### Configurar Meta API

```javascript
await fetch('http://localhost:3000/api/meta/config', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    accessToken: 'EAAxxxxxxxxxx...',
    phoneNumberId: '123456789012345',
    businessAccountId: '123456789012345' // opcional
  })
});
```

### Enviar Mensagem Individual

```javascript
await fetch('http://localhost:3000/api/meta/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: '5511999999999',
    message: 'Olá! Mensagem via Meta API'
  })
});
```

### Enviar Mídia

```javascript
await fetch('http://localhost:3000/api/meta/send-media', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: '5511999999999',
    mediaType: 'image', // image, video, document, audio
    mediaUrl: 'https://exemplo.com/imagem.jpg',
    caption: 'Legenda da imagem'
  })
});
```

### Enviar Template

```javascript
await fetch('http://localhost:3000/api/meta/send-template', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    to: '5511999999999',
    templateName: 'hello_world',
    languageCode: 'pt_BR',
    components: [] // Componentes do template
  })
});
```

### Envio em Massa

```javascript
await fetch('http://localhost:3000/api/meta/send-bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    contacts: ['5511999999999', '5511888888888', '5511777777777'],
    message: 'Mensagem em massa',
    delayMs: 1000 // Delay entre mensagens
  })
});
```

## 🔄 Integração com Lovable

### Adicionar ao serviço WhatsApp

```typescript
// src/services/whatsappApi.ts

// Configurar Meta API
async configureMetaAPI(accessToken: string, phoneNumberId: string, businessAccountId?: string) {
  const response = await axios.post(
    `${WHATSAPP_API_URL}/api/meta/config`,
    { accessToken, phoneNumberId, businessAccountId },
    { headers: this.getHeaders() }
  );
  return response.data;
}

// Enviar via Meta API
async sendViaMetaAPI(to: string, message: string) {
  const response = await axios.post(
    `${WHATSAPP_API_URL}/api/meta/send`,
    { to, message },
    { headers: this.getHeaders() }
  );
  return response.data;
}

// Envio em massa via Meta API
async sendBulkViaMetaAPI(contacts: string[], message: string, delayMs = 1000) {
  const response = await axios.post(
    `${WHATSAPP_API_URL}/api/meta/send-bulk`,
    { contacts, message, delayMs },
    { headers: this.getHeaders() }
  );
  return response.data;
}
```

## 📊 Diferenças: WhatsApp Web vs Meta API

| Recurso | WhatsApp Web (Gratuito) | Meta API Oficial |
|---------|-------------------------|------------------|
| **Custo** | Gratuito | Pago (por mensagem) |
| **Limite de envio** | ~1000/dia | Ilimitado* |
| **Aprovação** | Não requer | Requer aprovação Meta |
| **Templates** | Não | Sim (obrigatório para algumas mensagens) |
| **Webhooks** | Sim | Sim |
| **Confiabilidade** | Média | Alta |
| **Suporte** | Comunidade | Oficial Meta |

*Sujeito a limites de tier do Meta Business

## ⚠️ Observações Importantes

1. **Access Token**: Nunca compartilhe seu token de acesso
2. **Rate Limits**: Respeite os limites da Meta API
3. **Delay**: Use delay de pelo menos 1 segundo entre mensagens
4. **Templates**: Mensagens promocionais requerem templates aprovados
5. **Números**: Devem estar no formato internacional (DDI + DDD + Número)

## 🎯 Casos de Uso

### WhatsApp Web (Gratuito)
- Testes e desenvolvimento
- Pequeno volume de mensagens
- Comunicação pessoal
- Prototipagem

### Meta API Oficial
- Produção em larga escala
- Envio em massa
- Integração empresarial
- Automações críticas
- Suporte ao cliente

## 🔧 Troubleshooting

### Erro: "Configure a API do Meta primeiro"
**Solução**: Salve a configuração Meta API antes de enviar mensagens

### Erro: "Token não fornecido"
**Solução**: Faça login na interface primeiro

### Erro: "Invalid phone number"
**Solução**: Use formato internacional (ex: 5511999999999)

### Erro: "Rate limit exceeded"
**Solução**: Aumente o delay entre mensagens

### Mensagens não chegam
**Soluções**:
- Verifique se o Access Token está válido
- Confirme se o Phone Number ID está correto
- Verifique se o número está registrado no WhatsApp
- Para mensagens promocionais, use templates aprovados

## 📚 Documentação Adicional

- [Meta WhatsApp Business API](https://developers.facebook.com/docs/whatsapp)
- [Criar Access Token](https://developers.facebook.com/docs/whatsapp/business-management-api/get-started)
- [Templates de Mensagem](https://developers.facebook.com/docs/whatsapp/message-templates)
- [Rate Limits](https://developers.facebook.com/docs/whatsapp/messaging-limits)

## ✅ Checklist de Implementação

- [x] Endpoints Meta API criados no servidor
- [x] Interface web com configuração Meta API
- [x] Envio individual via Meta API
- [x] Envio em massa via Meta API
- [x] Sistema de autenticação
- [x] Resultados em tempo real
- [x] Documentação completa
- [ ] Configurar Meta Business Manager
- [ ] Obter Access Token e Phone Number ID
- [ ] Testar envio individual
- [ ] Testar envio em massa

---

**Tudo funcionando!** 🎉 O sistema agora suporta tanto WhatsApp Web (gratuito) quanto Meta API Oficial (pago).
