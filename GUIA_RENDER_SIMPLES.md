# 🚀 GUIA RÁPIDO: DEPLOY NO RENDER (PASSO A PASSO)

## 📋 PASSO 1: ACESSAR O RENDER

1. Abra seu navegador
2. Acesse: **https://dashboard.render.com/register**
3. Clique em **"Sign up with GitHub"**
4. Autorize o Render a acessar seu GitHub
5. Você será redirecionado para o dashboard

---

## 📋 PASSO 2: CRIAR WEB SERVICE

1. No dashboard, clique no botão **"New +"** (canto superior direito)
2. No menu que abrir, clique em **"Web Service"**
3. Você verá a tela "Create a new Web Service"

---

## 📋 PASSO 3: CONECTAR REPOSITÓRIO

1. Na tela "Create a new Web Service", procure por **"Connect a repository"**
2. Se não aparecer seu repositório `whatsapp-api`:
   - Clique em **"Configure account"** (link azul)
   - Selecione seu repositório `brunomktparaadvogados-max/whatsapp-api`
   - Clique em **"Save"**
3. Agora você verá o repositório listado
4. Clique no botão **"Connect"** ao lado de `whatsapp-api`

---

## 📋 PASSO 4: CONFIGURAR O SERVIÇO

Preencha os campos EXATAMENTE assim:

### Informações Básicas:
- **Name**: `whatsapp-api` (ou qualquer nome que preferir)
- **Region**: `Oregon (US West)` (ou qualquer região)
- **Branch**: `main`
- **Root Directory**: `whatsapp-api` ⚠️ **MUITO IMPORTANTE!**

### Build & Deploy:
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`

### Plano:
- **Instance Type**: `Free` (deixe selecionado)

---

## 📋 PASSO 5: ADICIONAR VARIÁVEIS DE AMBIENTE

Role para baixo até encontrar **"Environment Variables"**

Clique em **"Add Environment Variable"** e adicione CADA UMA dessas (copie e cole):

### Variável 1:
```
Key: NODE_ENV
Value: production
```

### Variável 2:
```
Key: PORT
Value: 3000
```

### Variável 3:
```
Key: JWT_SECRET
Value: whatsapp-api-secret-2024-super-seguro-mude-isso
```

### Variável 4: ⚠️ **MAIS IMPORTANTE!**
```
Key: MONGODB_URI
Value: mongodb+srv://advsobdemanda23_db_user:vHlV3J2lZl0oe1yy@cluster0.cl02hcn.mongodb.net/whatsapp?retryWrites=true&w=majority&appName=Cluster0
```

### Variável 5:
```
Key: AUTO_CREATE_SESSION
Value: false
```

### Variável 6:
```
Key: PUPPETEER_EXECUTABLE_PATH
Value: /usr/bin/chromium-browser
```

### Variável 7: (deixe em branco por enquanto)
```
Key: RENDER_EXTERNAL_URL
Value: 
```
(Deixe o Value vazio, vamos preencher depois)

---

## 📋 PASSO 6: CRIAR O SERVIÇO

1. Depois de adicionar TODAS as variáveis, role até o final da página
2. Clique no botão azul **"Create Web Service"**
3. Aguarde o build (5-10 minutos)
4. Você verá logs aparecendo na tela

### Logs que você deve ver:
```
==> Building...
==> Installing dependencies
==> npm install
==> Build successful ✅
==> Starting service...
==> 🚀 WhatsApp API Server v2.0
==> 💾 MongoDB: ✅ Configurado
==> ✅ Conectado ao MongoDB Atlas
```

---

## 📋 PASSO 7: COPIAR URL E CONFIGURAR KEEP-ALIVE

1. Quando o deploy terminar, você verá no topo da página a URL do seu serviço:
   ```
   https://whatsapp-api-XXXXX.onrender.com
   ```
2. **COPIE ESSA URL COMPLETA**
3. No menu lateral esquerdo, clique em **"Environment"**
4. Procure pela variável `RENDER_EXTERNAL_URL`
5. Clique no ícone de **lápis (Edit)** ao lado dela
6. Cole a URL que você copiou no campo **Value**
7. Clique em **"Save Changes"**
8. O serviço vai reiniciar automaticamente (1-2 minutos)

---

## 📋 PASSO 8: TESTAR A API

### Teste 1: Health Check
Abra seu navegador e acesse:
```
https://SEU-SERVICO.onrender.com/health
```

Você deve ver algo assim:
```json
{
  "status": "ok",
  "mongoConnected": true,
  "totalSessions": 0
}
```

⚠️ **IMPORTANTE**: Se `mongoConnected: false`, volte e verifique a variável `MONGODB_URI`!

---

## ✅ PRONTO! API NO AR!

Agora sua API está rodando no Render com:
- ✅ MongoDB Atlas conectado
- ✅ Sessões persistentes
- ✅ Reconexão automática
- ✅ Keep-alive ativo (não entra em sleep)

---

## 🆘 SE ALGO DER ERRADO

### Erro no Build:
1. Verifique se `Root Directory` está como `whatsapp-api`
2. Veja os logs de build no Render
3. Confirme que o código está no GitHub

### MongoDB não conecta:
1. Verifique se a variável `MONGODB_URI` está correta
2. Confirme que `0.0.0.0/0` está liberado no MongoDB Atlas (Network Access)
3. Teste a connection string localmente primeiro

### Serviço não inicia:
1. Veja os logs no Render (aba "Logs")
2. Procure por erros em vermelho
3. Verifique se todas as variáveis de ambiente foram adicionadas

---

## 📞 PRÓXIMOS PASSOS

Depois que a API estiver no ar, você pode:
1. Criar um usuário via API
2. Criar uma sessão WhatsApp
3. Gerar QR Code
4. Escanear com seu WhatsApp
5. Enviar mensagens!

**Boa sorte! 🚀**
