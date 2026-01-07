# ❌ ERRO DE AUTENTICAÇÃO MONGODB

## 🔴 Erro Detectado:

```
❌ Erro ao conectar MongoDB: bad auth : authentication failed
⚠️ Continuando sem persistência de sessões
```

---

## 🔍 CAUSA DO PROBLEMA

O MongoDB está rejeitando a autenticação. Possíveis causas:

1. **Senha incorreta** na string de conexão
2. **Caracteres especiais** não foram URL encoded corretamente
3. **Usuário não tem permissões** no banco de dados
4. **IP não está na whitelist** do MongoDB Atlas

---

## ✅ SOLUÇÃO

### 1️⃣ VERIFICAR A SENHA NO MONGODB ATLAS

1. **Acesse:** https://cloud.mongodb.com
2. **Vá em:** **Database Access** (menu lateral esquerdo)
3. **Procure o usuário:** `advsobdemanda23_db_user`
4. **Clique em:** **"Edit"**
5. **Clique em:** **"Edit Password"**
6. **Escolha uma senha SIMPLES (sem caracteres especiais):**
   - Exemplo: `Advogado2024` (sem `@`, `#`, `$`, etc.)
7. **Clique em:** **"Autogenerate Secure Password"** OU digite a senha
8. **ANOTE A SENHA!**
9. **Clique em:** **"Update User"**

---

### 2️⃣ VERIFICAR PERMISSÕES DO USUÁRIO

Ainda na tela de **"Edit User"**:

1. **Database User Privileges:**
   - Deve estar: **"Atlas admin"** OU **"Read and write to any database"**
   
2. Se não estiver, selecione: **"Atlas admin"**

3. **Clique em:** **"Update User"**

---

### 3️⃣ VERIFICAR WHITELIST DE IPs

1. **Vá em:** **Network Access** (menu lateral esquerdo)
2. **Verifique se existe:** `0.0.0.0/0` (permitir de qualquer lugar)
3. **Se não existir:**
   - Clique em **"Add IP Address"**
   - Clique em **"Allow Access from Anywhere"**
   - Clique em **"Confirm"**

---

### 4️⃣ ATUALIZAR STRING DE CONEXÃO NO KOYEB

Depois de resetar a senha:

1. **Nova string de conexão:**
   ```
   mongodb+srv://advsobdemanda23_db_user:SENHA_NOVA_AQUI@cluster0.cl02hcn.mongodb.net/?appName=Cluster0
   ```

2. **Se a senha tiver caracteres especiais, URL encode:**
   - `@` → `%40`
   - `#` → `%23`
   - `$` → `%24`
   - `%` → `%25`
   - `&` → `%26`
   - `+` → `%2B`
   - `/` → `%2F`
   - `:` → `%3A`
   - `=` → `%3D`
   - `?` → `%3F`

3. **Exemplo com senha `Advogado26@`:**
   ```
   mongodb+srv://advsobdemanda23_db_user:Advogado26%40@cluster0.cl02hcn.mongodb.net/?appName=Cluster0
   ```

4. **Configure no Koyeb:**
   - Acesse: https://app.koyeb.com
   - Vá em: **Settings** → **Environment Variables**
   - Edite: `MONGODB_URI`
   - Cole a nova string
   - Salve e aguarde redeploy

---

## 🧪 TESTAR NOVAMENTE

Após o redeploy, verifique os logs:

**✅ Sucesso:**
```
✅ MongoDB conectado com sucesso!
```

**❌ Ainda com erro:**
```
❌ Erro ao conectar MongoDB: bad auth : authentication failed
```

---

## 🎯 PRÓXIMOS PASSOS

1. **Resete a senha** do usuário no MongoDB Atlas
2. **Use uma senha simples** (sem caracteres especiais) OU faça URL encoding correto
3. **Verifique permissões** do usuário (Atlas admin)
4. **Verifique whitelist** de IPs (0.0.0.0/0)
5. **Atualize MONGODB_URI** no Koyeb
6. **Aguarde redeploy** e verifique logs

---

## 💡 RECOMENDAÇÃO

**Use uma senha SEM caracteres especiais para evitar problemas:**

- ✅ `Advogado2024`
- ✅ `SenhaSegura123`
- ✅ `MongoDB2024`
- ❌ `Advogado26@` (tem `@`)
- ❌ `Senha#123` (tem `#`)
- ❌ `Pass$word` (tem `$`)

---

## 📞 ME AVISE

Depois de resetar a senha e atualizar no Koyeb, **me envie:**

1. ✅ A nova senha (ou confirme que resetou)
2. ✅ A nova string de conexão completa
3. ✅ Os logs do Koyeb após o redeploy

**Vou testar e confirmar que está funcionando!**
