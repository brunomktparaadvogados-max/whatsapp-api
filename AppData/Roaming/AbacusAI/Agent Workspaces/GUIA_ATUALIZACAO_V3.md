# 🚀 GUIA DE ATUALIZAÇÃO - WhatsApp API v3.0

## ⚠️ PROBLEMA IDENTIFICADO

A versão anterior criava sessões automaticamente no startup, consumindo recursos desnecessários no Render mesmo sem uso.

## ✅ SOLUÇÃO IMPLEMENTADA

**Sessões sob demanda**: Agora você cria sessões apenas quando necessário via API.

---

## 📋 PASSO A PASSO PARA ATUALIZAR

### 1️⃣ Configurar Variáveis de Ambiente no Render

Acesse seu serviço no Render e adicione:

```
AUTO_CREATE_SESSION=false
JWT_SECRET=seu-secret-super-seguro-mude-isso
PORT=10000
HOST=0.0.0.0
```

### 2️⃣ Fazer Deploy da Nova Versão

```bash
cd whatsapp-api
git add .
git commit -m "v3.0 - Sessões sob demanda"
git push
```

O Render fará deploy automaticamente.

---

## 🎯 COMO USAR A NOVA VERSÃO

### 1. Fazer Login

```bash
POST https://whatsapp-api-ugdv.onrender.com/api/auth/login
Content-Type: application/json

{
  "email": "admin@flow.com",
  "password": "admin123"
}
```

**Resposta:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@flow.com",
    "name": "Admin"
  }
}
```

### 2. Criar Sessão WhatsApp

```bash
POST https://whatsapp-api-ugdv.onrender.com/api/sessions
Authorization: Bearer SEU_TOKEN_AQUI
Content-Type: application/json

{
  "sessionId": "minha-sessao"
}
```

**Resposta:**
```json
{
  "success": true,
  "sessionId": "minha-sessao",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "status": "qr"
}
```

### 3. Escanear QR Code

- Copie o `qrCode` da resposta
- Cole em um visualizador de imagens base64 ou acesse:
  `https://whatsapp-api-ugdv.onrender.com/` (interface web)
- Escaneie com WhatsApp

### 4. Verificar Status da Sessão

```bash
GET https://whatsapp-api-ugdv.onrender.com/api/sessions/minha-sessao
Authorization: Bearer SEU_TOKEN_AQUI
```

### 5. Enviar Mensagem

```bash
POST https://whatsapp-api-ugdv.onrender.com/api/send
Authorization: Bearer SEU_TOKEN_AQUI
Content-Type: application/json

{
  "sessionId": "minha-sessao",
  "to": "5511999999999",
  "message": "Olá! Mensagem de teste"
}
```

---

## 🔥 ENDPOINTS PRINCIPAIS

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login |
| POST | `/api/sessions` | Criar sessão |
| GET | `/api/sessions` | Listar sessões |
| GET | `/api/sessions/:id` | Status da sessão |
| DELETE | `/api/sessions/:id` | Deletar sessão |
| POST | `/api/send` | Enviar mensagem |
| POST | `/api/send-media` | Enviar mídia |
| GET | `/api/contacts/:sessionId` | Listar contatos |
| GET | `/api/chats/:sessionId` | Listar conversas |

---

## 💰 ECONOMIA DE RECURSOS

**Antes:**
- ❌ Criava sessão automaticamente
- ❌ Consumia recursos 24/7
- ❌ Gastava tokens sem uso

**Agora:**
- ✅ Cria sessão apenas quando necessário
- ✅ Consome recursos apenas durante uso
- ✅ Zero desperdício de tokens

---

## 🐛 TROUBLESHOOTING

### Erro: "Session not found"
**Solução:** Crie a sessão primeiro com `POST /api/sessions`

### Erro: "Unauthorized"
**Solução:** Faça login e use o token no header `Authorization: Bearer TOKEN`

### QR Code não aparece
**Solução:** Verifique se `AUTO_CREATE_SESSION=false` está configurado no Render

### Sessão desconecta
**Solução:** O Render pode reiniciar o serviço. Recrie a sessão quando necessário.

---

## 📊 MONITORAMENTO

Acesse os logs no Render para ver:
- ✅ Sessões criadas
- ✅ Mensagens enviadas
- ✅ Erros e avisos

---

## 🎓 EXEMPLO COMPLETO (cURL)

```bash
# 1. Login
TOKEN=$(curl -X POST https://whatsapp-api-ugdv.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"admin123"}' \
  | jq -r '.token')

# 2. Criar sessão
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"minha-sessao"}'

# 3. Enviar mensagem
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/send \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId":"minha-sessao",
    "to":"5511999999999",
    "message":"Olá!"
  }'
```

---

## 🔗 INTEGRAÇÃO COM N8N

Use os mesmos endpoints acima no n8n:

1. **HTTP Request Node** para login
2. **Set Node** para salvar token
3. **HTTP Request Node** para criar sessão
4. **HTTP Request Node** para enviar mensagens

---

## ✨ PRÓXIMOS PASSOS

1. ✅ Testar localmente
2. ✅ Fazer deploy no Render
3. ✅ Configurar variáveis de ambiente
4. ✅ Criar primeira sessão
5. ✅ Enviar primeira mensagem

---

**Versão:** 3.0  
**Data:** 2024  
**Suporte:** Documentação completa em `/whatsapp-api/README.md`
