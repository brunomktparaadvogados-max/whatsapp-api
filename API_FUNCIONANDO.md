# 🎉 API WHATSAPP FUNCIONANDO!

## ✅ SUA API ESTÁ NO AR!

**URL Pública:** https://whatsapp-api-ugdv.onrender.com

---

## 🔐 CREDENCIAIS DE ACESSO

Para acessar a interface web:

- **Email:** `admin@flow.com`
- **Senha:** `admin123`

---

## 🚀 COMO USAR NO LOVABLE

Configure a variável de ambiente no Lovable:

```
VITE_WHATSAPP_API_URL=https://whatsapp-api-ugdv.onrender.com
```

### Passos no Lovable:

1. Abra seu projeto no Lovable
2. Vá em **Settings** ou **Environment Variables**
3. Adicione a variável:
   - **Nome:** `VITE_WHATSAPP_API_URL`
   - **Valor:** `https://whatsapp-api-ugdv.onrender.com`
4. Salve e faça rebuild do projeto

---

## 📱 TESTAR A API

### 1. Criar uma Sessão WhatsApp

Acesse: https://whatsapp-api-ugdv.onrender.com

1. Faça login com as credenciais acima
2. Preencha:
   - **ID da Sessão:** `minha-sessao` (ou qualquer nome)
   - **Webhook URL:** (opcional - deixe vazio por enquanto)
3. Clique em **"Criar Sessão"**
4. **Escaneie o QR Code** com seu WhatsApp

### 2. Enviar Mensagem de Teste

Depois de conectar o WhatsApp:

1. Na seção **"Enviar Mensagem"**
2. Preencha:
   - **ID da Sessão:** `minha-sessao`
   - **Número:** `5511999999999` (seu número com DDI)
   - **Mensagem:** `Teste da API!`
3. Clique em **"Enviar Mensagem"**

---

## 🔌 ENDPOINTS DA API

Base URL: `https://whatsapp-api-ugdv.onrender.com`

### Criar Sessão
```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "minha-sessao",
    "webhookUrl": "https://seu-webhook.com/whatsapp"
  }'
```

### Enviar Mensagem
```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions/minha-sessao/messages \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "message": "Olá! Mensagem via API"
  }'
```

### Obter QR Code
```bash
curl https://whatsapp-api-ugdv.onrender.com/api/sessions/minha-sessao/qr
```

### Listar Sessões
```bash
curl https://whatsapp-api-ugdv.onrender.com/api/sessions
```

---

## ⚠️ IMPORTANTE - RENDER GRATUITO

O plano gratuito do Render tem limitações:

### 1. Sleep após 15 minutos
- A API "dorme" se não receber requisições
- Primeira requisição após sleep demora ~30 segundos
- **Solução:** Use um serviço de ping como UptimeRobot

### 2. Como configurar UptimeRobot (Grátis)

1. Acesse: https://uptimerobot.com
2. Crie uma conta gratuita
3. Adicione um novo monitor:
   - **Monitor Type:** HTTP(s)
   - **URL:** `https://whatsapp-api-ugdv.onrender.com`
   - **Monitoring Interval:** 5 minutos
4. Salve

Isso mantém sua API sempre ativa!

---

## 🎯 PRÓXIMOS PASSOS

### 1. Integrar com Lovable
- Configure a variável de ambiente
- Use os endpoints da API no seu código

### 2. Configurar Webhooks
- Para receber mensagens em tempo real
- Configure uma URL de webhook no Lovable ou N8N

### 3. Testar Funcionalidades
- Enviar mensagens de texto
- Enviar imagens/documentos
- Listar contatos e conversas

---

## 📚 DOCUMENTAÇÃO COMPLETA

Veja os arquivos no repositório:
- `README.md` - Documentação geral
- `QUICKSTART.md` - Guia rápido
- `LOVABLE_INTEGRATION.md` - Integração com Lovable

---

## 🆘 SUPORTE

Se precisar de ajuda:
1. Verifique os logs no Render
2. Teste os endpoints com curl ou Postman
3. Me avise se encontrar algum problema

---

## ✅ RESUMO

✅ API funcionando: https://whatsapp-api-ugdv.onrender.com
✅ Interface web disponível
✅ Pronta para integração com Lovable
✅ Endpoints REST funcionando

**Sua API WhatsApp está no ar! 🎉**
