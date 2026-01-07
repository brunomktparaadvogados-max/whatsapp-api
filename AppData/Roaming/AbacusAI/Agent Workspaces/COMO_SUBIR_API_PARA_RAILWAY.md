# 🚀 COMO SUBIR API WHATSAPP PARA O RAILWAY

## 📋 PASSO A PASSO COMPLETO

### OPÇÃO 1: SEM GIT (MAIS FÁCIL) ⭐ RECOMENDADO

Se você não tem Git instalado, use esta opção:

#### 1. Criar Repositório no GitHub

1. Acesse: https://github.com
2. Faça login (ou crie uma conta)
3. Clique no botão **"+"** no canto superior direito
4. Selecione **"New repository"**
5. Preencha:
   - **Repository name**: `whatsapp-api`
   - **Description**: `API WhatsApp para integração com sistema Flow`
   - **Public** ou **Private** (escolha Private se quiser manter privado)
   - ✅ Marque: **"Add a README file"**
6. Clique em **"Create repository"**

#### 2. Fazer Upload dos Arquivos

1. No repositório criado, clique em **"Add file"** > **"Upload files"**
2. Abra o Windows Explorer e vá para:
   ```
   C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api
   ```
3. Selecione TODOS os arquivos e pastas, EXCETO:
   - ❌ `node_modules` (pasta)
   - ❌ `sessions` (pasta)
   - ❌ `data` (pasta)
   - ❌ `.wwebjs_auth` (pasta se existir)
   - ❌ `.wwebjs_cache` (pasta se existir)

4. Arraste os arquivos para a página do GitHub
5. Escreva uma mensagem: `Initial commit - WhatsApp API`
6. Clique em **"Commit changes"**

#### 3. Criar arquivo .gitignore

1. No repositório, clique em **"Add file"** > **"Create new file"**
2. Nome do arquivo: `.gitignore`
3. Cole este conteúdo:

```
node_modules/
sessions/
data/
.env
.wwebjs_auth/
.wwebjs_cache/
*.log
.DS_Store
```

4. Clique em **"Commit changes"**

#### 4. Deploy no Railway

1. Volte para: https://railway.app
2. Clique em **"New Project"**
3. Selecione **"Deploy from GitHub repo"**
4. Autorize o Railway a acessar seu GitHub (se pedir)
5. Selecione o repositório **"whatsapp-api"**
6. Railway vai detectar automaticamente que é Node.js
7. Aguarde o deploy (2-5 minutos)

#### 5. Configurar Variáveis de Ambiente (Opcional)

1. No Railway, clique no seu projeto
2. Vá em **"Variables"**
3. Adicione (se necessário):
   ```
   PORT=3000
   NODE_ENV=production
   ```

#### 6. Obter a URL Pública

1. No Railway, clique em **"Settings"**
2. Role até **"Domains"**
3. Clique em **"Generate Domain"**
4. Copie a URL gerada (ex: `https://whatsapp-api-production-xxxx.up.railway.app`)

#### 7. Usar no Lovable

Cole no chat do Lovable:

```
Configure a variável de ambiente:
VITE_WHATSAPP_API_URL=https://whatsapp-api-production-xxxx.up.railway.app

(substitua pela sua URL do Railway)
```

---

### OPÇÃO 2: COM GIT (SE VOCÊ TEM GIT INSTALADO)

#### 1. Instalar Git

Baixe e instale: https://git-scm.com/download/win

#### 2. Inicializar Repositório

Abra o PowerShell ou CMD:

```bash
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces\whatsapp-api"

git init
git add .
git commit -m "Initial commit"
```

#### 3. Criar Repositório no GitHub

1. Acesse: https://github.com/new
2. Nome: `whatsapp-api`
3. Clique em **"Create repository"**
4. Copie a URL do repositório

#### 4. Enviar para GitHub

```bash
git remote add origin https://github.com/SEU-USUARIO/whatsapp-api.git
git branch -M main
git push -u origin main
```

#### 5. Deploy no Railway

Siga os passos 4-7 da Opção 1 acima.

---

## 🎯 ARQUIVOS IMPORTANTES PARA O RAILWAY

Certifique-se de que estes arquivos estão no repositório:

✅ `package.json` - Dependências do projeto
✅ `src/server.js` - Código principal
✅ `src/` - Pasta com todo o código
✅ `.gitignore` - Ignora arquivos desnecessários

---

## ⚠️ IMPORTANTE

**NÃO ENVIE PARA O GITHUB:**
- ❌ `node_modules/` - Muito pesado, será instalado automaticamente
- ❌ `sessions/` - Dados sensíveis das sessões WhatsApp
- ❌ `data/` - Banco de dados local
- ❌ `.env` - Variáveis de ambiente sensíveis

---

## 🐛 PROBLEMAS COMUNS

### "Build failed"
- Verifique se `package.json` está no repositório
- Verifique se não há erros de sintaxe no código

### "Application failed to respond"
- Verifique se a porta está configurada corretamente
- Railway usa a variável `PORT` automaticamente

### "Cannot find module"
- Verifique se todas as dependências estão no `package.json`
- Railway instala automaticamente com `npm install`

---

## 📞 PRECISA DE AJUDA?

Se tiver dificuldade, me avise em qual passo você está!
