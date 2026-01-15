# 🔄 MIGRAÇÃO PARA NOVO PROJETO SUPABASE

## 📋 INFORMAÇÕES DO NOVO PROJETO

- **Nome:** API
- **Senha:** Advogado26@
- **Status:** Aguardando DATABASE_URL

## 🎯 PASSOS DA MIGRAÇÃO

### 1️⃣ Obter a nova DATABASE_URL

1. Acesse: https://supabase.com/dashboard
2. Selecione o projeto **API**
3. Vá em **Settings** → **Database**
4. Copie a **Connection String** (URI)
5. Substitua `[YOUR-PASSWORD]` por `Advogado26@`

Formato esperado:
```
postgresql://postgres.xxxxx:Advogado26@@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

### 2️⃣ Executar migração de dados

O script irá:
- ✅ Criar as tabelas no novo banco
- ✅ Copiar apenas usuários ativos
- ✅ Copiar sessões ativas (últimos 7 dias)
- ❌ **NÃO** copiar mensagens antigas (causa do problema)

### 3️⃣ Atualizar Koyeb

1. Acesse: https://app.koyeb.com/apps
2. Selecione a aplicação **racial-debby-1brunomktecomercial**
3. Vá em **Settings** → **Environment Variables**
4. Atualize `DATABASE_URL` com a nova conexão
5. **Remova** `MONGODB_URI` (se existir)
6. Clique em **Deploy**

### 4️⃣ Verificar funcionamento

- Teste o endpoint: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/
- Faça login com um usuário
- Verifique se consegue enviar mensagens

## ⚠️ IMPORTANTE

- O novo banco começa vazio (0 MB)
- Usuários precisarão reconectar o WhatsApp (escanear QR code)
- Mensagens antigas não serão migradas (isso é bom!)
- A limpeza automática já está configurada no código

## 📊 BENEFÍCIOS

- ✅ Banco limpo e rápido
- ✅ Sem modo read-only
- ✅ Limpeza automática funcionando
- ✅ Espaço livre para crescer
