# 🆓 ALTERNATIVAS GRATUITAS PARA HOSPEDAR API WHATSAPP

## ⚠️ Railway agora requer cartão de crédito

Vamos usar alternativas 100% gratuitas sem cartão!

---

## 🎯 OPÇÃO 1: RENDER (RECOMENDADO) ⭐

**Vantagens:**
- ✅ 100% Gratuito
- ✅ Não precisa de cartão
- ✅ SSL automático
- ✅ Deploy fácil
- ✅ 750 horas/mês grátis

**Desvantagem:**
- ⚠️ "Hiberna" após 15min sem uso (primeira requisição demora ~30s)

### PASSO A PASSO:

#### 1. Criar conta no Render
1. Acesse: https://render.com
2. Clique em **"Get Started"**
3. Faça login com GitHub

#### 2. Criar Web Service
1. No dashboard, clique em **"New +"**
2. Selecione **"Web Service"**
3. Clique em **"Connect a repository"**
4. Autorize o Render a acessar seu GitHub
5. Selecione o repositório **"whatsapp-api"**

#### 3. Configurar o Deploy
Preencha os campos:

- **Name**: `whatsapp-api` (ou qualquer nome)
- **Region**: `Oregon (US West)` (ou mais próximo)
- **Branch**: `main`
- **Root Directory**: deixe vazio
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `npm start`
- **Instance Type**: `Free`

#### 4. Variáveis de Ambiente (Opcional)
Role até **"Environment Variables"** e adicione:

```
PORT=3000
NODE_ENV=production
```

#### 5. Deploy!
1. Clique em **"Create Web Service"**
2. Aguarde 5-10 minutos (primeira vez demora mais)
3. Quando aparecer "Live", está pronto!

#### 6. Copiar URL
1. No topo da página, você verá a URL: `https://whatsapp-api-xxxx.onrender.com`
2. Copie essa URL

#### 7. Usar no Lovable
```
VITE_WHATSAPP_API_URL=https://whatsapp-api-xxxx.onrender.com
```

---

## 🎯 OPÇÃO 2: CYCLIC.SH (MUITO FÁCIL)

**Vantagens:**
- ✅ 100% Gratuito
- ✅ Não hiberna
- ✅ Deploy super rápido
- ✅ Não precisa de cartão

### PASSO A PASSO:

#### 1. Criar conta
1. Acesse: https://www.cyclic.sh
2. Clique em **"Deploy Now"**
3. Faça login com GitHub

#### 2. Deploy
1. Clique em **"Link Your Own"**
2. Selecione o repositório **"whatsapp-api"**
3. Clique em **"Connect"**
4. Aguarde o deploy (2-3 minutos)

#### 3. Copiar URL
1. URL será algo como: `https://whatsapp-api-xxxx.cyclic.app`
2. Copie e use no Lovable

---

## 🎯 OPÇÃO 3: FLY.IO

**Vantagens:**
- ✅ Gratuito (3 VMs pequenas)
- ✅ Não hiberna
- ✅ Boa performance

**Desvantagem:**
- ⚠️ Requer cartão de crédito (mas não cobra)

### PASSO A PASSO:

#### 1. Instalar Fly CLI
Baixe: https://fly.io/docs/hands-on/install-flyctl/

#### 2. Login
```bash
flyctl auth login
```

#### 3. Deploy
```bash
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api"
flyctl launch
```

Responda:
- App name: `whatsapp-api`
- Region: escolha o mais próximo
- PostgreSQL: `No`
- Redis: `No`

#### 4. Deploy
```bash
flyctl deploy
```

#### 5. Copiar URL
```bash
flyctl info
```

URL será: `https://whatsapp-api.fly.dev`

---

## 🎯 OPÇÃO 4: GLITCH (SUPER FÁCIL)

**Vantagens:**
- ✅ 100% Gratuito
- ✅ Editor online
- ✅ Não precisa de cartão

**Desvantagem:**
- ⚠️ Hiberna após 5min sem uso

### PASSO A PASSO:

#### 1. Criar conta
1. Acesse: https://glitch.com
2. Faça login com GitHub

#### 2. Importar do GitHub
1. Clique em **"New Project"**
2. Selecione **"Import from GitHub"**
3. Cole a URL do seu repositório: `https://github.com/SEU-USUARIO/whatsapp-api`
4. Aguarde a importação

#### 3. Copiar URL
URL será: `https://whatsapp-api.glitch.me`

---

## 🎯 OPÇÃO 5: KOYEB

**Vantagens:**
- ✅ Gratuito
- ✅ Não hiberna
- ✅ Deploy fácil

### PASSO A PASSO:

#### 1. Criar conta
1. Acesse: https://www.koyeb.com
2. Faça login com GitHub

#### 2. Deploy
1. Clique em **"Create App"**
2. Selecione **"GitHub"**
3. Escolha o repositório **"whatsapp-api"**
4. Configure:
   - **Build command**: `npm install`
   - **Run command**: `npm start`
   - **Port**: `3000`
5. Clique em **"Deploy"**

#### 3. Copiar URL
URL será: `https://whatsapp-api-xxxx.koyeb.app`

---

## 📊 COMPARAÇÃO RÁPIDA

| Plataforma | Gratuito | Cartão | Hiberna | Facilidade | Recomendado |
|------------|----------|--------|---------|------------|-------------|
| **Render** | ✅ | ❌ | Sim (15min) | ⭐⭐⭐⭐⭐ | **SIM** ⭐ |
| **Cyclic** | ✅ | ❌ | Não | ⭐⭐⭐⭐⭐ | **SIM** ⭐ |
| **Fly.io** | ✅ | Sim | Não | ⭐⭐⭐ | Sim |
| **Glitch** | ✅ | ❌ | Sim (5min) | ⭐⭐⭐⭐ | Não |
| **Koyeb** | ✅ | ❌ | Não | ⭐⭐⭐⭐ | Sim |

---

## 🎯 RECOMENDAÇÃO FINAL

### Para você: Use **RENDER** ou **CYCLIC**

**RENDER** - Se não se importa com hibernação (30s na primeira requisição)
**CYCLIC** - Se quer que fique sempre ativo

Ambos são 100% gratuitos e não precisam de cartão!

---

## 🔧 DEPOIS DE HOSPEDAR

1. Copie a URL gerada
2. No Lovable, configure:
   ```
   VITE_WHATSAPP_API_URL=https://sua-url-aqui.onrender.com
   ```
3. Pronto! Todos os usuários poderão acessar

---

## ⚠️ SOBRE HIBERNAÇÃO

**O que é?**
Quando não há requisições por 15min, o servidor "dorme" para economizar recursos.

**Como resolver?**
- Use um serviço de "ping" gratuito: https://uptimerobot.com
- Ele faz uma requisição a cada 5min mantendo o servidor ativo
- 100% gratuito

---

## 📝 PRÓXIMO PASSO

Escolha **RENDER** ou **CYCLIC** e siga o passo a passo acima!
