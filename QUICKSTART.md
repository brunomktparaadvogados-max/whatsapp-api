# 🚀 GUIA RÁPIDO - INTEGRAÇÃO FLOW + WHATSAPP

## ⚡ INÍCIO RÁPIDO (5 minutos)

### 1️⃣ Instalar Dependências

```bash
cd whatsapp-api
npm install
```

### 2️⃣ Iniciar Servidor

```bash
npm start
```

✅ Servidor rodando em: http://localhost:3000

### 3️⃣ Testar API

**Login padrão:**
- Email: `admin@flow.com`
- Senha: `admin123`

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"admin123"}'
```

Copie o `token` retornado.

### 4️⃣ Criar Sessão WhatsApp

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{"sessionId":"minha-sessao"}'
```

### 5️⃣ Obter QR Code

```bash
curl http://localhost:3000/api/sessions/minha-sessao/qr \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

Escaneie o QR Code com WhatsApp!

### 6️⃣ Enviar Mensagem

```bash
curl -X POST http://localhost:3000/api/sessions/minha-sessao/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{"to":"5511999999999","message":"Olá do Flow!"}'
```

---

## 🎯 INTEGRAÇÃO COM LOVABLE

### Passo 1: Abra o arquivo `LOVABLE_INTEGRATION.md`

```bash
cat whatsapp-api/LOVABLE_INTEGRATION.md
```

### Passo 2: Copie TODO o conteúdo do prompt

### Passo 3: Cole no chat do Lovable

O Lovable criará automaticamente:
- ✅ Serviço de API WhatsApp
- ✅ Páginas de gerenciamento
- ✅ CRM com chat em tempo real
- ✅ Sistema de automações
- ✅ Agendamento de mensagens
- ✅ Integração Meta API

### Passo 4: Configure no Flow

1. Adicione no `.env` do Lovable:
   ```
   VITE_WHATSAPP_API_URL=http://localhost:3000
   ```

2. Faça login no sistema Flow

3. Acesse: **WhatsApp > Sessões**

4. Crie uma sessão e escaneie QR Code

5. Pronto! Use o CRM para conversar

---

## 📊 RECURSOS DISPONÍVEIS

### ✅ Autenticação Multi-usuário
- Cada usuário tem suas próprias sessões
- Login seguro com JWT
- Isolamento de dados

### ✅ CRM Completo
- Histórico de conversas
- Status de mensagens (enviado/entregue/lido)
- Chat em tempo real via WebSocket
- Busca de mensagens
- Envio de texto e mídia

### ✅ Automações
- **Respostas automáticas**
  - Por palavra-chave
  - Por mensagem exata
  - Primeira mensagem (boas-vindas)
- **Agendamento**
  - Mensagens futuras
  - Campanhas programadas

### ✅ Envio em Massa (Meta API)
- Sem bloqueio do WhatsApp
- Delay configurável entre envios
- Templates aprovados
- Relatório de resultados

---

## 🔐 CRIAR NOVO USUÁRIO

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email":"usuario@flow.com",
    "password":"senha123",
    "name":"Nome do Usuário",
    "company":"Empresa XYZ"
  }'
```

---

## 🤖 CRIAR RESPOSTA AUTOMÁTICA

```bash
curl -X POST http://localhost:3000/api/sessions/minha-sessao/auto-replies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "triggerType":"keyword",
    "triggerValue":"oi,olá,ola",
    "responseMessage":"Olá! Como posso ajudar?"
  }'
```

**Tipos de gatilho:**
- `keyword`: responde se mensagem contém palavra-chave
- `exact`: responde apenas se mensagem for exata
- `first_message`: responde na primeira mensagem do contato

---

## 📅 AGENDAR MENSAGEM

```bash
curl -X POST http://localhost:3000/api/sessions/minha-sessao/scheduled-messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "contactPhone":"5511999999999",
    "message":"Lembrete: reunião às 15h!",
    "scheduledAt":"2024-12-31T15:00:00Z"
  }'
```

---

## 🚀 CONFIGURAR META API (Envio em Massa)

### 1. Obter Credenciais

1. Acesse: https://developers.facebook.com
2. Crie um App Business
3. Adicione produto "WhatsApp"
4. Obtenha:
   - Access Token
   - Phone Number ID

### 2. Configurar na API

```bash
curl -X POST http://localhost:3000/api/meta/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "accessToken":"SEU_ACCESS_TOKEN_META",
    "phoneNumberId":"SEU_PHONE_NUMBER_ID"
  }'
```

### 3. Enviar em Massa

```bash
curl -X POST http://localhost:3000/api/meta/send-bulk \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{
    "contacts":["5511999999999","5511888888888"],
    "message":"Promoção especial!",
    "delayMs":2000
  }'
```

---

## 📱 WEBSOCKET (Tempo Real)

### Conectar via JavaScript

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  socket.emit('authenticate', 'SEU_TOKEN_JWT');
});

socket.on('new_message', (data) => {
  console.log('Nova mensagem:', data);
});

socket.on('qr_code', (data) => {
  console.log('QR Code:', data.qrCode);
});

socket.on('session_connected', (data) => {
  console.log('Sessão conectada:', data);
});

socket.on('message_status', (data) => {
  console.log('Status:', data.status);
});
```

---

## 🎨 ESTRUTURA DO BANCO DE DADOS

O sistema usa SQLite com as seguintes tabelas:

- **users**: usuários do sistema
- **sessions**: sessões WhatsApp por usuário
- **contacts**: contatos de cada sessão
- **messages**: histórico completo de mensagens
- **auto_replies**: regras de resposta automática
- **scheduled_messages**: mensagens agendadas
- **meta_configs**: configurações da API Meta

Tudo é criado automaticamente na primeira execução!

---

## 🔧 TROUBLESHOOTING

### Erro: "Token inválido"
- Faça login novamente para obter novo token
- Tokens expiram em 7 dias

### Erro: "Sessão não conectada"
- Verifique se escaneou o QR Code
- Aguarde alguns segundos após escanear

### Erro: "Failed to launch chrome"
- Instale dependências do Chrome:
  ```bash
  # Ubuntu/Debian
  sudo apt-get install -y chromium-browser
  ```

### QR Code não aparece
- Aguarde 10-15 segundos após criar sessão
- Tente obter QR Code novamente

---

## 📞 SUPORTE

- 📖 Documentação completa: `README.md`
- 🔌 Integração Lovable: `LOVABLE_INTEGRATION.md`
- 🚀 Deploy: `DEPLOY.md`

---

**🎉 Pronto! Você tem WhatsApp + CRM + Automações integrado ao Flow!**
