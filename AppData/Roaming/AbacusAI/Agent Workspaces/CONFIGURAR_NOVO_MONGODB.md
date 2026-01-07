# 🚀 CONFIGURAR NOVO CLUSTER MONGODB

## 📋 PASSO A PASSO

### 1️⃣ Criar Cluster (EM ANDAMENTO)

Você está criando um novo cluster em:
https://cloud.mongodb.com/v2/69590504259c243c27eb6761#/clusters/starterTemplates

**Aguarde 3-5 minutos para o cluster ser criado.**

---

### 2️⃣ Configurar Usuário do Banco

Após o cluster ser criado:

1. **Clique em "Database Access"** (menu lateral esquerdo)
2. **Clique em "Add New Database User"**
3. **Preencha:**
   - **Username:** `whatsapp_user`
   - **Password:** Clique em "Autogenerate Secure Password" (anote a senha!)
   - **Database User Privileges:** Selecione **"Read and write to any database"**
4. **Clique em "Add User"**

**⚠️ IMPORTANTE: Anote a senha gerada!**

---

### 3️⃣ Liberar Acesso de Qualquer IP

1. **Clique em "Network Access"** (menu lateral esquerdo)
2. **Clique em "Add IP Address"**
3. **Clique em "Allow Access from Anywhere"**
4. **Confirme que o IP é:** `0.0.0.0/0`
5. **Clique em "Confirm"**

---

### 4️⃣ Obter String de Conexão

1. **Volte para "Database"** (menu lateral)
2. **Clique no botão "Connect"** do seu cluster
3. **Selecione "Drivers"**
4. **Copie a connection string** (parecida com):
   ```
   mongodb+srv://whatsapp_user:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

5. **Substitua `<password>` pela senha que você anotou no passo 2**

**Exemplo final:**
```
mongodb+srv://whatsapp_user:SuaSenha123@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

---

### 5️⃣ Configurar no Koyeb

1. **Acesse:** https://app.koyeb.com
2. **Clique no seu serviço** (whatsapp-api)
3. **Vá em "Settings" → "Environment Variables"**
4. **Adicione ou edite a variável:**
   - **Nome:** `MONGODB_URI`
   - **Valor:** Cole a string de conexão completa (com a senha substituída)
5. **Clique em "Save"**
6. **Aguarde o redeploy** (2-3 minutos)

---

### 6️⃣ Verificar se Funcionou

Após o deploy completar, teste:

```bash
# Testar login
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"admin123"}'
```

**Se retornar o usuário admin, está funcionando!** ✅

---

### 7️⃣ Criar Usuários

Agora você pode criar os usuários:

```bash
# Criar admin
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@flow.com",
    "password": "admin123",
    "name": "Administrador",
    "company": "Flow System"
  }'

# Criar Elaine (exemplo)
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "elainecnassif@gmail.com",
    "password": "SENHA_AQUI",
    "name": "Elaine Nassif",
    "company": "Sua Empresa"
  }'
```

---

### 8️⃣ Verificar no MongoDB

Para confirmar que os dados estão sendo salvos:

```bash
cd whatsapp-api
node -e "const { MongoClient } = require('mongodb'); const uri = 'SUA_STRING_DE_CONEXAO_AQUI'; const client = new MongoClient(uri); client.connect().then(() => { const db = client.db('whatsapp'); db.collection('users').find({}).toArray().then(users => { console.log('Usuários:', users.length); users.forEach(u => console.log('-', u.email)); client.close(); }); });"
```

**Deve listar os usuários criados!** ✅

---

## ✅ CHECKLIST

- [ ] Cluster MongoDB criado
- [ ] Usuário do banco criado (anote a senha!)
- [ ] IP 0.0.0.0/0 liberado
- [ ] String de conexão copiada
- [ ] Senha substituída na string
- [ ] `MONGODB_URI` configurada no Koyeb
- [ ] Deploy completado
- [ ] Login testado e funcionando
- [ ] Usuários criados
- [ ] Dados verificados no MongoDB

---

## 🎯 RESULTADO ESPERADO

Após completar todos os passos:

✅ **MongoDB funcionando**
✅ **Dados permanentes**
✅ **Usuários salvos**
✅ **Sessões persistentes**
✅ **Nunca mais perderá dados**

---

## 📞 PRÓXIMOS PASSOS

Após configurar o MongoDB:

1. **Criar todos os usuários necessários**
2. **Cada usuário faz login no sistema**
3. **Cada usuário escaneia seu QR code**
4. **Implementar código do Lovable/Flow** (arquivo `INSTRUCOES_LOVABLE_FLOW.md`)
5. **Testar envio e recebimento de mensagens**

---

## 🆘 PRECISA DE AJUDA?

Me avise quando:
- ✅ Cluster estiver criado
- ✅ String de conexão estiver pronta
- ✅ Configurar no Koyeb
- ✅ Testar se funcionou

Estou aqui para ajudar em cada etapa!
