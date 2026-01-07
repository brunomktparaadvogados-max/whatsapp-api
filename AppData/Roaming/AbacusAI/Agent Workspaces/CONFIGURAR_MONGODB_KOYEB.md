# ✅ CONFIGURAÇÃO MONGODB NO KOYEB

## 🔗 String de Conexão Atualizada:

```
mongodb+srv://advsobdemanda23_db_user:Advogado26@cluster0.cl02hcn.mongodb.net/?appName=Cluster0
```

**✅ Senha atualizada para:** `Advogado26` (sem caracteres especiais, não precisa URL encoding)

---

## 🚀 CONFIGURAR NO KOYEB AGORA

### Passo a Passo:

1. **Acesse:** https://app.koyeb.com

2. **Clique no seu serviço:** `whatsapp-api`

3. **Vá em:** **Settings** → **Environment Variables**

4. **Procure a variável:** `MONGODB_URI`
   - Se já existe: Clique em **"Edit"**
   - Se não existe: Clique em **"Add Variable"**

5. **Preencha:**
   - **Name:** `MONGODB_URI`
   - **Value:**
   ```
   mongodb+srv://advsobdemanda23_db_user:Advogado26%40@cluster0.cl02hcn.mongodb.net/?appName=Cluster0
   ```

6. **Clique em:** **"Save"** ou **"Update"**

7. **Aguarde o redeploy:** 2-3 minutos

---

## 🧪 TESTAR SE FUNCIONOU

Após o deploy completar, teste o login:

```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"admin123"}'
```

**Resposta esperada:** `{"error":"Usuário não encontrado"}` (normal, pois ainda não criamos usuários)

---

## 📝 CRIAR USUÁRIOS

Depois de confirmar que o MongoDB está conectado:

### 1. Criar Admin:
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@flow.com",
    "password": "admin123",
    "name": "Administrador",
    "company": "Flow System"
  }'
```

### 2. Criar Outros Usuários:
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@exemplo.com",
    "password": "senha123",
    "name": "Nome do Usuário",
    "company": "Empresa"
  }'
```

---

## ✅ CHECKLIST

- [ ] Configurar `MONGODB_URI` no Koyeb
- [ ] Aguardar redeploy (2-3 minutos)
- [ ] Testar se API está respondendo
- [ ] Criar usuário admin
- [ ] Criar demais usuários
- [ ] Cada usuário faz login e escaneia QR code

---

## 🎯 PRÓXIMO PASSO

**Configure a variável no Koyeb e me avise quando o deploy terminar!**

Depois eu testo a conexão e ajudo a criar os usuários.
