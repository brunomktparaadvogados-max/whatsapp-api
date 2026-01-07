# 🚨 PROBLEMA: Usuários e Sessões Perdidos no Koyeb

## ❌ O QUE ACONTECEU?

Quando o Koyeb faz deploy, ele **reinicia a aplicação** e o banco de dados SQLite é **perdido** porque:

1. **Koyeb não tem armazenamento persistente** para arquivos
2. O arquivo `data/whatsapp.db` é **efêmero** (temporário)
3. A cada deploy/reinício, um novo banco vazio é criado
4. **Todos os usuários, sessões e QR codes são perdidos**

---

## ✅ SOLUÇÃO: Usar MongoDB (Banco Persistente)

A API já tem suporte ao MongoDB! Só precisa configurar a variável de ambiente `MONGODB_URI`.

---

## 🚀 PASSO A PASSO PARA RESOLVER

### 1️⃣ Criar Conta no MongoDB Atlas (GRÁTIS)

1. Acesse: https://www.mongodb.com/cloud/atlas/register
2. Crie uma conta gratuita
3. Crie um cluster gratuito (M0 - Free Tier)
4. Aguarde 3-5 minutos para o cluster ser criado

### 2️⃣ Configurar Acesso ao Banco

1. No MongoDB Atlas, clique em **"Database Access"** (menu lateral)
2. Clique em **"Add New Database User"**
3. Crie um usuário:
   - Username: `whatsapp_user`
   - Password: `SuaSenhaSegura123!` (anote essa senha!)
   - Database User Privileges: **"Read and write to any database"**
4. Clique em **"Add User"**

### 3️⃣ Liberar Acesso de Qualquer IP

1. No MongoDB Atlas, clique em **"Network Access"** (menu lateral)
2. Clique em **"Add IP Address"**
3. Clique em **"Allow Access from Anywhere"** (0.0.0.0/0)
4. Clique em **"Confirm"**

### 4️⃣ Obter String de Conexão

1. No MongoDB Atlas, clique em **"Database"** (menu lateral)
2. Clique no botão **"Connect"** do seu cluster
3. Selecione **"Connect your application"**
4. Copie a string de conexão (parecida com):
   ```
   mongodb+srv://whatsapp_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. **IMPORTANTE:** Substitua `<password>` pela senha que você criou no passo 2

**Exemplo:**
```
mongodb+srv://whatsapp_user:SuaSenhaSegura123!@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

### 5️⃣ Configurar no Koyeb

1. Acesse: https://app.koyeb.com
2. Vá no seu serviço (whatsapp-api)
3. Clique em **"Settings"** ou **"Environment Variables"**
4. Adicione a variável de ambiente:
   - **Nome:** `MONGODB_URI`
   - **Valor:** Cole a string de conexão do MongoDB (com a senha substituída)
5. Clique em **"Save"** ou **"Deploy"**
6. Aguarde o deploy completar (2-3 minutos)

---

## 🎯 RESULTADO ESPERADO

Após configurar o MongoDB:

✅ **Usuários não serão mais perdidos** nos deploys
✅ **Sessões do WhatsApp persistirão** (não precisa escanear QR code toda hora)
✅ **Mensagens e contatos serão salvos permanentemente**
✅ **Configurações de webhook persistirão**

---

## 🧪 COMO TESTAR

### 1. Verificar se MongoDB está conectado

Acesse os logs do Koyeb e procure por:
```
✅ MongoDB conectado com sucesso
💾 MongoDB: ✅ Configurado
```

Se aparecer:
```
⚠️ MONGODB_URI não configurado. Usando modo fallback
```
Significa que a variável não foi configurada corretamente.

### 2. Criar um usuário de teste

```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "senha123",
    "name": "Usuário Teste"
  }'
```

### 3. Fazer login

```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "senha123"
  }'
```

### 4. Forçar um redeploy no Koyeb

1. Vá em Settings → Redeploy
2. Aguarde o deploy completar

### 5. Fazer login novamente

```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@exemplo.com",
    "password": "senha123"
  }'
```

**Se o login funcionar, significa que o MongoDB está funcionando!** 🎉

---

## 📊 COMPARAÇÃO

| Aspecto | SQLite (Atual) | MongoDB (Recomendado) |
|---------|----------------|----------------------|
| **Persistência** | ❌ Perdido a cada deploy | ✅ Permanente |
| **Custo** | Grátis | Grátis (até 512MB) |
| **Performance** | Boa | Excelente |
| **Escalabilidade** | Limitada | Alta |
| **Backup** | ❌ Não disponível | ✅ Automático |
| **Sessões WhatsApp** | ❌ Perdidas | ✅ Persistem |

---

## 🔧 ALTERNATIVA: Usar Supabase (PostgreSQL)

Se preferir PostgreSQL ao invés de MongoDB:

1. Crie conta no Supabase: https://supabase.com
2. Crie um projeto
3. Obtenha a connection string
4. Configure no Koyeb como `DATABASE_URL`

**Nota:** Precisará modificar o código para usar PostgreSQL ao invés de MongoDB.

---

## 📞 SUPORTE

Se tiver problemas:

1. **Erro de conexão:** Verifique se liberou o IP 0.0.0.0/0 no MongoDB Atlas
2. **Erro de autenticação:** Verifique se substituiu `<password>` pela senha correta
3. **Variável não aparece:** Verifique se salvou e fez redeploy no Koyeb
4. **Logs do Koyeb:** Acesse Settings → Logs para ver mensagens de erro

---

## ⚠️ IMPORTANTE

**ENQUANTO NÃO CONFIGURAR O MONGODB:**
- Todos os usuários serão perdidos a cada deploy
- QR codes precisarão ser escaneados novamente
- Mensagens e contatos não persistirão

**APÓS CONFIGURAR O MONGODB:**
- Tudo será salvo permanentemente
- Apenas o primeiro deploy após configurar perderá os dados antigos
- Depois disso, nunca mais perderá dados

---

## 🎯 PRÓXIMOS PASSOS

1. ✅ Criar conta no MongoDB Atlas
2. ✅ Configurar usuário e acesso
3. ✅ Obter string de conexão
4. ✅ Configurar `MONGODB_URI` no Koyeb
5. ✅ Aguardar deploy
6. ✅ Recriar usuários (apenas uma vez)
7. ✅ Escanear QR codes (apenas uma vez)
8. ✅ Nunca mais perder dados! 🎉
