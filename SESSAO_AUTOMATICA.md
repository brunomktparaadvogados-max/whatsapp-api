# ✅ NOVA FUNCIONALIDADE: SESSÃO AUTOMÁTICA POR USUÁRIO

## 🎯 O QUE MUDOU

Agora cada usuário tem **UMA ÚNICA SESSÃO** WhatsApp que é criada automaticamente ao fazer login/registro.

### Benefícios:
- ✅ **Sem timeout**: Sessão criada em background
- ✅ **Simples**: Não precisa criar sessão manualmente
- ✅ **Automático**: Login já inicia a sessão
- ✅ **1 sessão por usuário**: Evita confusão

---

## 🔄 FLUXO AUTOMÁTICO

### 1. Registro de Usuário
```bash
POST /api/auth/register
{
  "email": "usuario@email.com",
  "password": "senha123",
  "name": "Nome do Usuário",
  "company": "Empresa"
}
```

**Resposta:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": { "id": 1, "email": "...", "name": "..." },
  "sessionId": "user_1",
  "message": "Usuário criado! Sua sessão WhatsApp está sendo inicializada em background."
}
```

### 2. Login
```bash
POST /api/auth/login
{
  "email": "usuario@email.com",
  "password": "senha123"
}
```

**Resposta:**
```json
{
  "success": true,
  "token": "eyJhbGc...",
  "user": { "id": 1, "email": "...", "name": "..." },
  "sessionId": "user_1",
  "sessionStatus": "qr_code"
}
```

---

## 📱 NOVOS ENDPOINTS SIMPLIFICADOS

### 1. Obter Minha Sessão
```bash
GET /api/my-session
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "success": true,
  "sessionId": "user_1",
  "status": "qr_code",
  "qrCode": "data:image/png;base64,...",
  "info": null
}
```

### 2. Obter Meu QR Code
```bash
GET /api/my-qr
Authorization: Bearer {token}
```

**Resposta (QR disponível):**
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,...",
  "status": "qr_code"
}
```

**Resposta (já conectado):**
```json
{
  "success": true,
  "qrCode": null,
  "status": "connected",
  "message": "WhatsApp já está conectado!"
}
```

### 3. Criar/Verificar Sessão
```bash
POST /api/sessions
Authorization: Bearer {token}
```

**Resposta (já existe):**
```json
{
  "success": true,
  "sessionId": "user_1",
  "status": "connected",
  "message": "Você já possui uma sessão ativa."
}
```

**Resposta (criando):**
```json
{
  "success": true,
  "sessionId": "user_1",
  "status": "initializing",
  "message": "Sessão sendo criada em background. Aguarde alguns minutos e verifique o QR Code."
}
```

---

## 🚀 COMO USAR NO LOVABLE

### 1. Login/Registro
```javascript
const response = await fetch('https://web-service-gxip.onrender.com/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
});

const data = await response.json();
// Salvar token
localStorage.setItem('token', data.token);
// Salvar sessionId
localStorage.setItem('sessionId', data.sessionId);
```

### 2. Verificar Status da Sessão
```javascript
const response = await fetch('https://web-service-gxip.onrender.com/api/my-session', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const data = await response.json();
console.log('Status:', data.status); // initializing, qr_code, connected
```

### 3. Obter QR Code
```javascript
const response = await fetch('https://web-service-gxip.onrender.com/api/my-qr', {
  headers: { 'Authorization': `Bearer ${token}` }
});

const data = await response.json();
if (data.qrCode) {
  // Mostrar QR Code
  document.getElementById('qr').src = data.qrCode;
} else {
  console.log(data.message); // "WhatsApp já está conectado!"
}
```

### 4. Polling para Verificar Status
```javascript
// Verificar a cada 10 segundos
const interval = setInterval(async () => {
  const response = await fetch('https://web-service-gxip.onrender.com/api/my-session', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const data = await response.json();
  
  if (data.status === 'connected') {
    console.log('WhatsApp conectado!');
    clearInterval(interval);
  } else if (data.status === 'qr_code' && data.qrCode) {
    // Atualizar QR Code
    document.getElementById('qr').src = data.qrCode;
  }
}, 10000);
```

---

## 📝 ESTADOS DA SESSÃO

- **`initializing`**: Sessão sendo criada (aguarde 1-3 minutos)
- **`qr_code`**: QR Code disponível para escanear
- **`authenticated`**: QR Code escaneado, conectando...
- **`connected`**: WhatsApp conectado e pronto!
- **`disconnected`**: Desconectado (reconexão automática)

---

## ⚠️ IMPORTANTE

1. **Aguarde 2-3 minutos** após login para o QR Code aparecer
2. **Não crie múltiplas sessões** - cada usuário tem apenas uma
3. **Use polling** para verificar status (a cada 10-15 segundos)
4. **Sessão persiste** mesmo após restart do servidor (MongoDB)

---

## 🎉 PRONTO!

Agora o Lovable pode:
1. Fazer login
2. Aguardar alguns minutos
3. Buscar QR Code em `/api/my-qr`
4. Mostrar para o usuário escanear
5. Verificar status até ficar `connected`
6. Enviar mensagens!
