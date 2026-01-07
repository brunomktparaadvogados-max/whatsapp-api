# 🧪 TESTE RÁPIDO - API WhatsApp Funcionando

## ✅ CONFIRMADO: API ESTÁ ONLINE!

**URL**: https://whatsapp-api-ugdv.onrender.com/

**Status**: ✅ Funcionando com interface web completa

---

## 🚀 TESTE AGORA (3 MINUTOS)

### 1️⃣ Acesse a Interface Web

Abra no navegador: **https://whatsapp-api-ugdv.onrender.com/**

### 2️⃣ Faça Login

- **Email**: `admin@flow.com`
- **Senha**: `admin123`

### 3️⃣ Crie uma Sessão

1. Na seção "🆕 Criar Nova Sessão"
2. Digite um ID (ex: `teste-sessao`)
3. Webhook (opcional): `https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook`
4. Clique em "Criar Sessão"

### 4️⃣ Conecte o WhatsApp

1. Aguarde o QR Code aparecer (2-3 segundos)
2. Abra o WhatsApp no celular
3. Vá em: **Configurações → Aparelhos conectados → Conectar aparelho**
4. Escaneie o QR Code

### 5️⃣ Envie uma Mensagem

1. Na seção "📤 Enviar Mensagem"
2. ID da Sessão: `teste-sessao`
3. Número: `5511999999999` (seu número com DDI)
4. Mensagem: `Teste da API WhatsApp!`
5. Clique em "Enviar Mensagem"

---

## 🔧 TESTE VIA API (CURL)

### 1. Fazer Login

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"admin123"}'
```

**Resposta esperada:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "email": "admin@flow.com"
  }
}
```

### 2. Criar Sessão

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "sessionId": "teste-api",
    "webhookUrl": "https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook"
  }'
```

### 3. Obter QR Code

```bash
curl https://whatsapp-api-ugdv.onrender.com/api/sessions/teste-api/qr \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

### 4. Listar Sessões

```bash
curl https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer SEU_TOKEN_AQUI"
```

### 5. Enviar Mensagem

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions/teste-api/messages \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "to": "5511999999999",
    "message": "Teste via API!"
  }'
```

---

## 📊 FUNCIONALIDADES DISPONÍVEIS

### Interface Web
- ✅ Login com autenticação
- ✅ Criar/deletar sessões
- ✅ Ver QR Code
- ✅ Enviar mensagens individuais
- ✅ Enviar mensagens em massa
- ✅ Integração Meta API oficial
- ✅ Documentação interativa

### API REST
- ✅ Autenticação JWT
- ✅ Gerenciamento de sessões
- ✅ Envio de mensagens
- ✅ Envio de mídia
- ✅ Webhooks
- ✅ Listagem de contatos/chats

---

## 🔐 CREDENCIAIS

**Login Web:**
- Email: `admin@flow.com`
- Senha: `admin123`

**Webhook Supabase:**
- URL: `https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook`

---

## 📱 ENDPOINTS DISPONÍVEIS

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/auth/login` | Login (retorna token JWT) |
| POST | `/api/sessions` | Criar sessão |
| GET | `/api/sessions` | Listar sessões |
| GET | `/api/sessions/:id/qr` | Obter QR Code |
| POST | `/api/sessions/:id/messages` | Enviar mensagem |
| POST | `/api/sessions/:id/messages/media` | Enviar mídia |
| GET | `/api/sessions/:id/chats` | Listar conversas |
| GET | `/api/sessions/:id/contacts` | Listar contatos |
| PUT | `/api/sessions/:id/webhook` | Atualizar webhook |
| DELETE | `/api/sessions/:id` | Deletar sessão |

---

## ✅ CHECKLIST DE TESTE

- [ ] Acessei a interface web
- [ ] Fiz login com sucesso
- [ ] Criei uma sessão
- [ ] Vi o QR Code
- [ ] Conectei o WhatsApp
- [ ] Enviei uma mensagem de teste
- [ ] Recebi a mensagem no WhatsApp

---

## 🎯 PRÓXIMOS PASSOS

### Se funcionou:
1. ✅ Use a interface web para suas necessidades
2. ✅ Ou integre com Lovable (veja `GUIA_RAPIDO_LOVABLE.md`)
3. ✅ Configure webhooks para receber mensagens

### Se não funcionou:
1. Verifique se a API está online (pode demorar 30-60s no primeiro acesso)
2. Confira as credenciais de login
3. Veja os logs no console do navegador (F12)

---

## 📞 SUPORTE

- **Interface**: https://whatsapp-api-ugdv.onrender.com/
- **Documentação**: Disponível na própria interface
- **Webhook**: https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook

---

**🎉 Pronto! A API está funcionando perfeitamente. Comece testando pela interface web!** 🚀
