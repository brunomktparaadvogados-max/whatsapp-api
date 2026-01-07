# 🎯 CRIAR USUÁRIOS NA API (KOYEB)

## 📋 URL DA API
```
https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app
```

---

## 🔧 MÉTODO 1: USANDO CURL (Terminal/CMD)

### Usuário 1
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"usuario1@exemplo.com\",\"password\":\"senha123\",\"name\":\"Usuario 1\",\"company\":\"Empresa 1\"}"
```

### Usuário 2
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"usuario2@exemplo.com\",\"password\":\"senha123\",\"name\":\"Usuario 2\",\"company\":\"Empresa 2\"}"
```

### Usuário 3
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"usuario3@exemplo.com\",\"password\":\"senha123\",\"name\":\"Usuario 3\",\"company\":\"Empresa 3\"}"
```

---

## 🔧 MÉTODO 2: USANDO POSTMAN

1. Abra o Postman
2. Crie uma nova requisição **POST**
3. URL: `https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register`
4. Headers:
   - `Content-Type: application/json`
5. Body (raw JSON):

### Usuário 1
```json
{
  "email": "usuario1@exemplo.com",
  "password": "senha123",
  "name": "Usuario 1",
  "company": "Empresa 1"
}
```

### Usuário 2
```json
{
  "email": "usuario2@exemplo.com",
  "password": "senha123",
  "name": "Usuario 2",
  "company": "Empresa 2"
}
```

### Usuário 3
```json
{
  "email": "usuario3@exemplo.com",
  "password": "senha123",
  "name": "Usuario 3",
  "company": "Empresa 3"
}
```

---

## 🔧 MÉTODO 3: USANDO JAVASCRIPT (Console do Navegador)

Abra o console do navegador (F12) e execute:

```javascript
// Usuário 1
fetch('https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario1@exemplo.com',
    password: 'senha123',
    name: 'Usuario 1',
    company: 'Empresa 1'
  })
}).then(r => r.json()).then(console.log);

// Usuário 2
fetch('https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario2@exemplo.com',
    password: 'senha123',
    name: 'Usuario 2',
    company: 'Empresa 2'
  })
}).then(r => r.json()).then(console.log);

// Usuário 3
fetch('https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'usuario3@exemplo.com',
    password: 'senha123',
    name: 'Usuario 3',
    company: 'Empresa 3'
  })
}).then(r => r.json()).then(console.log);
```

---

## ✅ RESPOSTA ESPERADA

```json
{
  "message": "Usuário criado com sucesso",
  "userId": 1,
  "sessionId": "user_1"
}
```

---

## 📋 PRÓXIMOS PASSOS

Após criar os usuários:

1. **Atualize o Lovable/Flow** com a URL da API:
   ```env
   VITE_API_URL=https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app
   ```

2. **Faça login no Flow** com:
   - Email: `usuario1@exemplo.com`
   - Senha: `senha123`

3. **Conecte o WhatsApp** escaneando o QR Code

4. **Verifique no Supabase** se os dados foram salvos

---

## 🔍 VERIFICAR USUÁRIOS CRIADOS

Para verificar se os usuários foram criados, acesse o Supabase:

1. https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Table Editor**
4. Abra a tabela `users`
5. Você verá os usuários criados
