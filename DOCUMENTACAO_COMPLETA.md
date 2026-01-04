# 📚 Documentação Completa da API WhatsApp

## 🏗️ Arquitetura do Sistema

### Visão Geral
API REST para integração com WhatsApp usando `whatsapp-web.js`, com suporte a múltiplas sessões, CRM, chat em tempo real via WebSocket e persistência de dados.

---

## 📁 Estrutura de Arquivos

```
whatsapp-api/
├── src/
│   ├── server.js           # Servidor principal Express + Socket.IO
│   ├── SessionManager.js   # Gerenciador de sessões WhatsApp
│   ├── database.js         # Gerenciador de banco de dados (SQLite + MongoDB)
│   ├── auth.js             # Autenticação JWT
│   └── MetaAPI.js          # Integração com Meta WhatsApp Business API
├── public/                 # Interface web (HTML/CSS/JS)
├── data/                   # Banco de dados SQLite
├── sessions/               # Dados de sessão do WhatsApp
├── Dockerfile              # Container Alpine Linux
├── build.sh                # Script de build para Render (Ubuntu)
├── render.yaml             # Configuração do Render
└── package.json            # Dependências Node.js
```

---

## 🔧 Tecnologias Utilizadas

### Backend
- **Node.js 18+** - Runtime JavaScript
- **Express 4.18** - Framework web
- **Socket.IO 4.6** - WebSocket para comunicação em tempo real
- **whatsapp-web.js 1.23** - Biblioteca para WhatsApp Web
- **Puppeteer** - Automação do navegador Chromium

### Banco de Dados
- **SQLite 5.1** - Banco local para usuários, sessões e mensagens
- **MongoDB (opcional)** - Persistência de sessões WhatsApp via `wwebjs-mongo`
- **Mongoose 8.0** - ODM para MongoDB

### Autenticação
- **JWT (jsonwebtoken 9.0)** - Tokens de autenticação
- **bcryptjs 2.4** - Hash de senhas

### Utilitários
- **QRCode 1.5** - Geração de QR Code
- **node-cron 3.0** - Tarefas agendadas
- **axios 1.6** - Cliente HTTP
- **uuid 9.0** - Geração de IDs únicos

---

## 🚀 Fluxo de Funcionamento

### 1. Inicialização do Servidor (`server.js`)

```javascript
// Linha 1-17: Importações e configuração
const express = require('express');
const socketIo = require('socket.io');
const DatabaseManager = require('./database');
const SessionManager = require('./SessionManager');

// Linha 18-25: Criação do servidor HTTP + WebSocket
const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: '*' } });

// Linha 32-33: Inicialização dos gerenciadores
const db = new DatabaseManager();
const sessionManager = new SessionManager(db, io);
```

**O que acontece:**
1. Express cria servidor HTTP
2. Socket.IO adiciona suporte a WebSocket
3. DatabaseManager conecta ao SQLite e MongoDB
4. SessionManager gerencia sessões WhatsApp

---

### 2. Autenticação de Usuário

#### Registro (`POST /api/auth/register`)
```javascript
// Linha 58-96: Endpoint de registro
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, company } = req.body;
  
  // 1. Valida dados
  // 2. Verifica se email já existe
  // 3. Cria usuário no banco
  const userId = await db.createUser(email, password, name, company);
  
  // 4. Gera token JWT
  const token = generateToken(userId);
  
  // 5. Cria sessão WhatsApp automaticamente
  const sessionId = `user_${userId}`;
  setImmediate(async () => {
    await sessionManager.createSession(sessionId, userId);
  });
  
  return { token, user, sessionId };
});
```

**Fluxo:**
```
Cliente → POST /api/auth/register
         ↓
    Valida dados
         ↓
    Cria usuário (SQLite)
         ↓
    Gera token JWT
         ↓
    Cria sessão WhatsApp (background)
         ↓
    Retorna token + sessionId
```

---

### 3. Gerenciamento de Sessões WhatsApp (`SessionManager.js`)

#### Criação de Sessão
```javascript
// Linha 176-215: Criar nova sessão
async createSession(sessionId, userId) {
  // 1. Verifica se sessão já existe
  if (this.sessions.has(sessionId)) {
    throw new Error('Sessão já existe');
  }
  
  // 2. Cria registro no banco
  await this.db.createSession(sessionId, userId);
  
  // 3. Cria cliente WhatsApp com Puppeteer
  const client = await this.createWhatsAppClient(sessionId);
  
  // 4. Configura eventos (qr, authenticated, ready, etc)
  this.setupClientEvents(client, sessionData);
  
  // 5. Inicializa em background
  this.initializeClientInBackground(client, sessionData);
  
  return sessionData;
}
```

#### Configuração do Puppeteer
```javascript
// Linha 104-173: Criar cliente WhatsApp
async createWhatsAppClient(sessionId) {
  const clientConfig = {
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-gpu',
        // ... mais 20+ argumentos de otimização
      ],
      executablePath: '/usr/bin/chromium-browser', // Ubuntu
      timeout: 60000
    }
  };
  
  // Se MongoDB disponível, usa RemoteAuth para persistência
  if (this.isMongoConnected) {
    clientConfig.authStrategy = new RemoteAuth({
      clientId: sessionId,
      store: this.mongoStore
    });
  }
  
  return new Client(clientConfig);
}
```

**Importante:** 
- **Alpine Linux**: Chromium em `/usr/bin/chromium`
- **Ubuntu (Render)**: Chromium em `/usr/bin/chromium-browser`

---

### 4. Eventos do WhatsApp

```javascript
// Linha 252-338: Eventos do cliente
setupClientEvents(client, sessionData) {
  
  // 1. QR Code gerado
  client.on('qr', async (qr) => {
    sessionData.qrCode = await QRCode.toDataURL(qr);
    sessionData.status = 'qr_code';
    
    // Envia via WebSocket para o usuário
    this.io.to(`user_${sessionData.userId}`).emit('qr_code', {
      sessionId: sessionData.id,
      qrCode: sessionData.qrCode
    });
  });
  
  // 2. Autenticado (QR escaneado)
  client.on('authenticated', async () => {
    sessionData.status = 'authenticated';
    await this.db.updateSessionStatus(sessionId, 'authenticated');
  });
  
  // 3. Pronto para uso
  client.on('ready', async () => {
    sessionData.status = 'connected';
    sessionData.info = {
      wid: client.info.wid._serialized,
      pushname: client.info.pushname,
      platform: client.info.platform
    };
    await this.db.updateSessionStatus(sessionId, 'connected');
  });
  
  // 4. Mensagem recebida
  client.on('message', async (message) => {
    // Salva no banco
    await this.db.saveMessage(sessionData.id, message);
    
    // Envia via WebSocket
    this.io.to(`user_${sessionData.userId}`).emit('new_message', {
      sessionId: sessionData.id,
      message: messageData
    });
  });
  
  // 5. Desconectado
  client.on('disconnected', async (reason) => {
    sessionData.status = 'disconnected';
    await this.attemptReconnect(sessionData);
  });
}
```

---

## 🔌 Endpoints da API

### Autenticação

#### `POST /api/auth/register`
Cria novo usuário e sessão WhatsApp.

**Request:**
```json
{
  "email": "usuario@exemplo.com",
  "password": "senha123",
  "name": "João Silva",
  "company": "Empresa XYZ"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": 2,
    "email": "usuario@exemplo.com",
    "name": "João Silva",
    "company": "Empresa XYZ"
  },
  "sessionId": "user_2",
  "message": "Usuário criado! Sua sessão WhatsApp está sendo inicializada."
}
```

#### `POST /api/auth/login`
Faz login e retorna token JWT.

---

### Sessões WhatsApp

#### `GET /api/my-session`
Retorna status da sessão do usuário autenticado.

**Headers:**
```
Authorization: Bearer {token}
```

**Response:**
```json
{
  "success": true,
  "sessionId": "user_2",
  "status": "qr_code",
  "qrCode": "data:image/png;base64,iVBORw0KG..."
}
```

**Status possíveis:**
- `initializing` - Iniciando Chromium
- `qr_code` - QR Code gerado, aguardando scan
- `authenticated` - QR escaneado
- `connected` - Conectado e pronto
- `disconnected` - Desconectado
- `failed` - Falha na inicialização

#### `GET /api/my-qr`
Retorna apenas o QR Code em base64.

#### `POST /api/sessions`
Cria nova sessão manualmente.

**Request:**
```json
{
  "sessionId": "user_2"
}
```

#### `DELETE /api/sessions/:sessionId`
Deleta uma sessão.

---

### Mensagens

#### `POST /api/send-message`
Envia mensagem de texto.

**Request:**
```json
{
  "to": "5511999999999",
  "message": "Olá! Como posso ajudar?"
}
```

#### `POST /api/send-media`
Envia imagem, vídeo ou documento.

**Request:**
```json
{
  "to": "5511999999999",
  "mediaUrl": "https://exemplo.com/imagem.jpg",
  "caption": "Legenda da imagem"
}
```

#### `GET /api/messages`
Lista mensagens do usuário.

**Query params:**
- `contactPhone` - Filtrar por contato
- `limit` - Limite de resultados (padrão: 50)
- `offset` - Paginação

---

### Contatos

#### `GET /api/contacts`
Lista todos os contatos.

#### `GET /api/contacts/:phone`
Detalhes de um contato específico.

#### `PUT /api/contacts/:phone`
Atualiza informações do contato (tags, notas).

---

### Webhooks

#### `POST /api/webhooks`
Configura webhook para receber eventos.

**Request:**
```json
{
  "url": "https://seu-servidor.com/webhook",
  "events": ["message", "status"]
}
```

**Eventos enviados:**
```json
{
  "event": "message",
  "sessionId": "user_2",
  "data": {
    "from": "5511999999999",
    "body": "Olá!",
    "timestamp": 1234567890
  }
}
```

---

### Debug

#### `GET /api/health`
Status do servidor.

**Response:**
```json
{
  "success": true,
  "status": "healthy",
  "uptime": 3600,
  "sessions": {
    "id": "user_2",
    "status": "connected",
    "lastSeen": 1234567890
  },
  "mongodb": "connected",
  "environment": "production"
}
```

#### `GET /api/debug/chromium`
Informações do Chromium.

**Response:**
```json
{
  "chromiumPath": "/usr/bin/chromium-browser",
  "chromiumExists": true,
  "chromiumVersion": "Chromium 136.0.7103.113 Alpine Linux"
}
```

---

## 🗄️ Banco de Dados

### SQLite (Local)

#### Tabela `users`
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabela `sessions`
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  status TEXT DEFAULT 'initializing',
  phone_number TEXT,
  phone_name TEXT,
  last_seen DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

#### Tabela `messages`
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  message_type TEXT,
  body TEXT,
  media_url TEXT,
  timestamp DATETIME,
  is_from_me BOOLEAN,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

#### Tabela `contacts`
```sql
CREATE TABLE contacts (
  phone TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  name TEXT,
  profile_pic_url TEXT,
  tags TEXT,
  notes TEXT,
  last_message_at DATETIME,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

### MongoDB (Opcional)

Usado apenas para persistir sessões WhatsApp via `RemoteAuth`:

```javascript
// Estrutura no MongoDB
{
  _id: "user_2",
  session: "<dados_criptografados_da_sessão>",
  updatedAt: ISODate("2024-01-01T00:00:00Z")
}
```

---

## 🌐 WebSocket (Socket.IO)

### Conexão
```javascript
const socket = io('https://web-service-gxip.onrender.com');

// Autenticar
socket.emit('authenticate', 'seu-token-jwt');

socket.on('authenticated', (data) => {
  console.log('Autenticado!', data);
});
```

### Eventos Recebidos

#### `qr_code`
QR Code gerado.
```javascript
socket.on('qr_code', (data) => {
  console.log('QR Code:', data.qrCode);
  // Exibir QR Code para o usuário
});
```

#### `session_connected`
Sessão conectada.
```javascript
socket.on('session_connected', (data) => {
  console.log('Conectado!', data.info);
});
```

#### `new_message`
Nova mensagem recebida.
```javascript
socket.on('new_message', (data) => {
  console.log('Mensagem:', data.message);
});
```

#### `session_disconnected`
Sessão desconectada.
```javascript
socket.on('session_disconnected', (data) => {
  console.log('Desconectado:', data.reason);
});
```

---

## 🐳 Deploy

### Render (Ubuntu)

**Configuração (`render.yaml`):**
```yaml
services:
  - type: web
    name: whatsapp-api
    runtime: node
    buildCommand: chmod +x build.sh && ./build.sh
    startCommand: npm start
    envVars:
      - key: PUPPETEER_EXECUTABLE_PATH
        value: /usr/bin/chromium-browser  # IMPORTANTE: Ubuntu usa chromium-browser
      - key: MONGODB_URI
        sync: false
      - key: JWT_SECRET
        sync: false
```

**Build Script (`build.sh`):**
```bash
#!/bin/bash
apt-get update
apt-get install -y chromium chromium-sandbox fonts-liberation
npm install
```

### Docker (Alpine)

**Dockerfile:**
```dockerfile
FROM node:18-alpine

RUN apk add --no-cache chromium nss freetype harfbuzz

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

---

## ⚙️ Variáveis de Ambiente

```bash
# Servidor
PORT=3000
HOST=0.0.0.0
NODE_ENV=production

# Chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Autenticação
JWT_SECRET=seu-secret-super-seguro-mude-isso

# MongoDB (opcional)
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/whatsapp

# Render
RENDER_EXTERNAL_URL=https://seu-app.onrender.com
```

---

## 🔍 Troubleshooting

### Sessão travada em "initializing"

**Causa:** Chromium não está no caminho correto.

**Solução:**
1. Verificar caminho: `GET /api/debug/chromium`
2. Ajustar `PUPPETEER_EXECUTABLE_PATH`
3. Ubuntu: `/usr/bin/chromium-browser`
4. Alpine: `/usr/bin/chromium`

### Timeout ao inicializar

**Causa:** Recursos insuficientes ou argumentos do Puppeteer.

**Solução:**
```javascript
// SessionManager.js - Linha 108-136
args: [
  '--no-sandbox',              // OBRIGATÓRIO em containers
  '--disable-setuid-sandbox',  // OBRIGATÓRIO em containers
  '--disable-dev-shm-usage',   // Evita problemas de memória
  '--single-process',          // Reduz uso de memória
  '--disable-gpu'              // Não precisa de GPU
]
```

### MongoDB não conecta

**Causa:** URL inválida ou rede bloqueada.

**Solução:**
- API funciona sem MongoDB (sessões não persistem)
- Verificar whitelist de IPs no MongoDB Atlas
- Testar conexão: `GET /api/health`

---

## 📊 Monitoramento

### Logs do Servidor
```bash
# Render
https://dashboard.render.com → Logs

# Docker
docker logs -f container-name

# Local
npm start
```

### Scripts PowerShell

**Monitorar sessão:**
```powershell
.\monitorar-sessao.ps1
```

**Forçar nova sessão:**
```powershell
.\forcar-nova-sessao.ps1
```

**Verificar logs:**
```powershell
.\verificar-logs.ps1
```

---

## 🔐 Segurança

### JWT
- Tokens expiram em 7 dias
- Secret deve ser alterado em produção
- Tokens armazenados no cliente

### Senhas
- Hash com bcrypt (10 rounds)
- Nunca armazenadas em texto plano

### CORS
- Configurado para aceitar todas as origens (`*`)
- Em produção, restringir para domínios específicos

### Rate Limiting
- **TODO:** Implementar rate limiting
- Sugestão: `express-rate-limit`

---

## 📈 Performance

### Otimizações Aplicadas

1. **Puppeteer:**
   - `--single-process` - Reduz uso de memória
   - `--disable-dev-shm-usage` - Evita problemas de /dev/shm
   - Timeout de 60s para inicialização

2. **Sessões:**
   - Inicialização em background (`setImmediate`)
   - Cleanup automático de sessões inativas (cron)
   - Reconexão automática em caso de queda

3. **Banco de Dados:**
   - SQLite para dados locais (rápido)
   - MongoDB apenas para sessões (opcional)
   - Índices em campos de busca

4. **WebSocket:**
   - Rooms por usuário (`user_${userId}`)
   - Eventos específicos (não broadcast)

---

## 🚧 Limitações Conhecidas

1. **Render Free Tier:**
   - Sleep após 15 min de inatividade
   - 512 MB RAM (pode causar timeout)
   - Keep-alive configurado (cron a cada 10 min)

2. **WhatsApp Web:**
   - Limite de ~15 mensagens/segundo
   - Pode ser banido se detectar automação
   - Requer celular conectado à internet

3. **Sessões:**
   - Máximo 1 sessão por usuário
   - Sessão expira se não usar por 30 dias
   - QR Code expira em 60 segundos

---

## 📞 Suporte

**Documentos úteis:**
- `DIAGNOSTICO_SESSAO_TRAVADA.md` - Problemas de inicialização
- `QUICKSTART.md` - Guia rápido
- `API_FUNCIONANDO.md` - Testes e validação

**Endpoints de debug:**
- `/api/health` - Status geral
- `/api/debug/chromium` - Info do Chromium
- `/api/debug/system` - Info do sistema

---

## 📝 Changelog

### v2.0.0 (Atual)
- ✅ Sessão automática por usuário
- ✅ WebSocket para eventos em tempo real
- ✅ CRM com contatos e tags
- ✅ Persistência com MongoDB
- ✅ Deploy no Render
- ✅ Logs detalhados de debug

### v1.0.0
- ✅ API REST básica
- ✅ Envio de mensagens
- ✅ QR Code
- ✅ Webhooks

---

**Desenvolvido com ❤️ usando Node.js + whatsapp-web.js**
