# 🔧 CORRIGIR TIMEOUT NO RENDER

## ❌ Problema
O Render gratuito não tem Chromium instalado, causando timeout ao criar sessões WhatsApp.

## ✅ Solução

### OPÇÃO 1: Atualizar Configuração do Render (RECOMENDADO)

1. **Fazer commit das alterações:**
```bash
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api"
git add .
git commit -m "Adicionar build script para instalar Chromium no Render"
git push
```

2. **Atualizar Build Command no Render:**
   - Acesse: https://dashboard.render.com
   - Clique no seu serviço `web-service-gxip`
   - Vá em **Settings**
   - Em **Build & Deploy**, altere:
     - **Build Command**: `chmod +x build.sh && ./build.sh`
   - Clique em **Save Changes**

3. **Adicionar variável de ambiente:**
   - Ainda em Settings, vá em **Environment**
   - Adicione:
     ```
     Key: PUPPETEER_EXECUTABLE_PATH
     Value: /usr/bin/chromium
     ```
   - Clique em **Save Changes**

4. **Fazer Manual Deploy:**
   - Clique em **Manual Deploy** > **Deploy latest commit**
   - Aguarde 10-15 minutos (primeira vez demora mais)

---

### OPÇÃO 2: Usar Railway (Melhor para WhatsApp)

O Railway tem melhor suporte para Puppeteer/Chromium:

1. **Criar conta no Railway:**
   - Acesse: https://railway.app
   - Faça login com GitHub

2. **Criar novo projeto:**
   - Clique em **New Project**
   - Selecione **Deploy from GitHub repo**
   - Escolha `whatsapp-api`

3. **Configurar variáveis:**
   ```
   NODE_ENV=production
   PORT=3000
   MONGODB_URI=mongodb+srv://advsobdemanda23_db_user:vHlV3J2lZl0oe1yy@cluster0.cl02hcn.mongodb.net/whatsapp?retryWrites=true&w=majority&appName=Cluster0
   JWT_SECRET=whatsapp-api-secret-2024-super-seguro-mude-isso
   PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
   ```

4. **Deploy automático**
   - Railway faz deploy automaticamente
   - Copia a URL gerada

---

### OPÇÃO 3: Usar Localmente + Ngrok (Temporário)

Para testar rapidamente enquanto configura o servidor:

1. **Instalar Ngrok:**
   - Baixe: https://ngrok.com/download
   - Extraia e coloque em uma pasta

2. **Iniciar servidor local:**
```powershell
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api"
npm start
```

3. **Em outro terminal, iniciar Ngrok:**
```powershell
ngrok http 3000
```

4. **Copiar URL pública:**
   - Ngrok mostrará uma URL tipo: `https://xxxx-xxxx.ngrok.io`
   - Use essa URL no Lovable temporariamente

---

## 🎯 Qual opção escolher?

- **Opção 1**: Se quer manter no Render (gratuito, mas pode ser lento)
- **Opção 2**: Se quer melhor performance (Railway tem $5 grátis/mês)
- **Opção 3**: Para testes rápidos (temporário, só funciona com PC ligado)

---

## 📝 Próximos Passos

Depois de escolher uma opção, execute o script de teste:

```powershell
powershell -ExecutionPolicy Bypass -File "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api\testar.ps1"
```

Se funcionar, atualize a URL no Lovable!
