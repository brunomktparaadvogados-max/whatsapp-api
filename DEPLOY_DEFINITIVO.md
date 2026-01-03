# 🚀 GUIA DEFINITIVO - Deploy WhatsApp API no Render

## 📋 PROBLEMAS RESOLVIDOS

### ✅ O que foi corrigido:

1. **Persistência de Sessões** - Migrado de LocalAuth para RemoteAuth com MongoDB
2. **Reconexão Automática** - Sistema inteligente com backoff exponencial
3. **Keep-Alive** - Ping automático a cada 10 minutos para evitar sleep
4. **Health Check** - Endpoints `/health` e `/api/health` para monitoramento
5. **Puppeteer Otimizado** - Configuração específica para ambientes serverless
6. **Graceful Shutdown** - Desconexão limpa de todas as sessões ao reiniciar
7. **Limpeza Automática** - Sessões inativas são removidas a cada hora

---

## 🔧 CONFIGURAÇÃO MONGODB (OBRIGATÓRIO)

### Opção 1: MongoDB Atlas (Recomendado - GRÁTIS)

1. Acesse: https://www.mongodb.com/cloud/atlas/register
2. Crie uma conta gratuita
3. Crie um cluster (M0 Sandbox - FREE)
4. Em "Database Access", crie um usuário:
   - Username: `whatsapp_user`
   - Password: Gere uma senha forte
5. Em "Network Access", adicione: `0.0.0.0/0` (permitir de qualquer lugar)
6. Clique em "Connect" > "Connect your application"
7. Copie a connection string:
   ```
   mongodb+srv://whatsapp_user:<password>@cluster0.xxxxx.mongodb.net/whatsapp?retryWrites=true&w=majority
   ```

### Opção 2: MongoDB Local (Desenvolvimento)

```bash
# Instalar MongoDB localmente
# Windows: https://www.mongodb.com/try/download/community
# Linux: sudo apt-get install mongodb
# Mac: brew install mongodb-community

# Connection string local:
mongodb://localhost:27017/whatsapp
```

---

## 📦 INSTALAÇÃO LOCAL

```bash
cd whatsapp-api

# Instalar dependências
npm install

# Criar arquivo .env
cp .env.example .env

# Editar .env e adicionar MONGODB_URI
# MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/whatsapp

# Testar localmente
npm start
```

---

## 🌐 DEPLOY NO RENDER

### Passo 1: Preparar Repositório

```bash
cd whatsapp-api

# Adicionar mudanças ao git
git add .
git commit -m "feat: Migrar para RemoteAuth com MongoDB e adicionar reconexão automática"
git push origin main
```

### Passo 2: Configurar no Render

1. Acesse: https://dashboard.render.com/
2. Clique em "New +" > "Web Service"
3. Conecte seu repositório GitHub
4. Configurações:
   - **Name**: `whatsapp-api`
   - **Region**: `Oregon (US West)` ou mais próximo
   - **Branch**: `main`
   - **Root Directory**: `whatsapp-api`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

### Passo 3: Variáveis de Ambiente

Adicione as seguintes variáveis em "Environment":

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=seu-secret-super-seguro-mude-isso-123456
MONGODB_URI=mongodb+srv://usuario:senha@cluster.mongodb.net/whatsapp?retryWrites=true&w=majority
AUTO_CREATE_SESSION=false
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
RENDER_EXTERNAL_URL=https://whatsapp-api-ugdv.onrender.com
```

**⚠️ IMPORTANTE**: Substitua `MONGODB_URI` pela sua connection string real!

### Passo 4: Deploy

1. Clique em "Create Web Service"
2. Aguarde o build (5-10 minutos)
3. Acesse a URL fornecida pelo Render

---

## 🧪 TESTAR A API

### 1. Health Check

```bash
curl https://whatsapp-api-ugdv.onrender.com/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 123.45,
  "totalSessions": 0,
  "connectedSessions": 0,
  "mongoConnected": true
}
```

### 2. Criar Usuário

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "seu@email.com",
    "password": "suasenha123",
    "name": "Seu Nome",
    "company": "Sua Empresa"
  }'
```

### 3. Fazer Login

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "seu@email.com",
    "password": "suasenha123"
  }'
```

Copie o `token` da resposta.

### 4. Criar Sessão WhatsApp

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "sessionId": "MinhaEmpresa"
  }'
```

### 5. Obter QR Code

```bash
curl https://whatsapp-api-ugdv.onrender.com/api/sessions/MinhaEmpresa/qr \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

### 6. Enviar Mensagem

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions/MinhaEmpresa/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "phone": "5511999999999",
    "message": "Olá! Mensagem de teste da API"
  }'
```

---

## 🔍 MONITORAMENTO

### Logs no Render

1. Acesse seu serviço no Render
2. Clique em "Logs"
3. Procure por:
   - `✅ MongoDB conectado com sucesso!`
   - `🟢 Cliente PRONTO e CONECTADO`
   - `💓 Keep-alive ping enviado`

### Verificar Sessões Ativas

```bash
curl https://whatsapp-api-ugdv.onrender.com/api/health \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## ⚠️ TROUBLESHOOTING

### Problema: "MongoDB não conectado"

**Solução**:
1. Verifique se `MONGODB_URI` está correta
2. Confirme que o IP `0.0.0.0/0` está liberado no MongoDB Atlas
3. Teste a connection string localmente primeiro

### Problema: "Sessão não persiste após restart"

**Solução**:
- Isso é NORMAL se MongoDB não estiver configurado
- Configure MongoDB Atlas (gratuito) seguindo o guia acima
- Após configurar, as sessões persistirão automaticamente

### Problema: "QR Code não aparece"

**Solução**:
1. Aguarde 30-60 segundos (cold start do Render)
2. Verifique logs: `client.on('qr')`
3. Tente criar nova sessão com ID diferente

### Problema: "Render fica em sleep"

**Solução**:
- O keep-alive automático já está configurado
- Pings a cada 10 minutos mantêm o servidor ativo
- Plano gratuito tem limite de 750 horas/mês

---

## 📊 DIFERENÇAS: LOCAL vs RENDER

| Recurso | Local (LocalAuth) | Render (RemoteAuth) |
|---------|-------------------|---------------------|
| Persistência | Pasta `./sessions` | MongoDB Atlas |
| Após Restart | ✅ Mantém | ✅ Mantém (com MongoDB) |
| Múltiplos Servidores | ❌ Não | ✅ Sim |
| Backup Automático | ❌ Não | ✅ Sim |
| Escalabilidade | ❌ Limitada | ✅ Ilimitada |

---

## 🎯 PRÓXIMOS PASSOS

1. ✅ Configurar MongoDB Atlas
2. ✅ Fazer deploy no Render
3. ✅ Testar criação de sessão
4. ✅ Escanear QR Code
5. ✅ Enviar mensagem de teste
6. 🔄 Integrar com seu frontend (Lovable)
7. 🔄 Configurar webhooks (opcional)
8. 🔄 Adicionar respostas automáticas

---

## 📞 SUPORTE

Se encontrar problemas:

1. Verifique os logs no Render
2. Teste o endpoint `/health`
3. Confirme que MongoDB está conectado
4. Revise as variáveis de ambiente

---

## 🎉 SUCESSO!

Se você chegou até aqui e tudo está funcionando:

- ✅ API rodando no Render
- ✅ MongoDB conectado
- ✅ Sessões persistindo
- ✅ QR Code funcionando
- ✅ Mensagens sendo enviadas

**Parabéns! Sua API WhatsApp está 100% funcional e pronta para produção!** 🚀
