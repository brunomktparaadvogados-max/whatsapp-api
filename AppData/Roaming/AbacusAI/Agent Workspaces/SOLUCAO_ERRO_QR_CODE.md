# 🔧 SOLUÇÃO: Erro ao Escanear QR Code no WhatsApp

## 🚨 PROBLEMA

Ao escanear o QR Code gerado pela API, o app do WhatsApp dá erro.

## 🔍 CAUSAS POSSÍVEIS

### 1. QR Code Expirado ⏰
O WhatsApp Web gera QR Codes que **expiram após 20-60 segundos**. Se você demorar para escanear, o código fica inválido.

**Sintomas:**
- Erro genérico no app WhatsApp
- Mensagem "Código QR inválido"
- Nada acontece ao escanear

### 2. Sessão com Autenticação Antiga 🔐
A sessão "A" foi criada há várias horas e pode estar tentando usar autenticação antiga.

**Sintomas:**
- QR Code não atualiza
- Sempre mostra o mesmo código
- Erro ao escanear

### 3. Múltiplas Sessões do Mesmo Número 📱
Você já tem a sessão "T" conectada com o número `5511935001870`. O WhatsApp **não permite** conectar o mesmo número em múltiplas sessões simultaneamente.

**Sintomas:**
- Erro ao escanear
- Desconexão da sessão anterior
- Conflito de autenticação

## ✅ SOLUÇÃO COMPLETA

### PASSO 1: Deletar Todas as Sessões Antigas

```bash
# Token válido
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc2NzM4OTQ2MywiZXhwIjoxNzY3OTk0MjYzfQ.F5cqVqHr9kBirXSfVQUxYTCZo6egeC-JkF1LZ0m-N1U"

# Deletar sessão T (conectada)
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/T \
  -H "Authorization: Bearer $TOKEN"

# Deletar sessão A (com QR Code expirado)
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/A \
  -H "Authorization: Bearer $TOKEN"

# Verificar se foram deletadas
curl -s https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer $TOKEN"
```

### PASSO 2: Criar Nova Sessão com ID Único

```bash
# Criar sessão com ID único e descritivo
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"BRUNO_PRINCIPAL_2026"}'
```

### PASSO 3: Aguardar Geração do QR Code

```bash
# Aguardar 10 segundos para o QR Code ser gerado
sleep 10

# Buscar QR Code
curl -s https://whatsapp-api-ugdv.onrender.com/api/sessions/BRUNO_PRINCIPAL_2026/qr \
  -H "Authorization: Bearer $TOKEN"
```

**Resposta esperada:**
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "status": "qr_code"
}
```

### PASSO 4: Escanear IMEDIATAMENTE

⚠️ **IMPORTANTE**: Você tem apenas **20-60 segundos** para escanear!

1. **Abra o WhatsApp no celular**
2. **Vá em**: Configurações → Aparelhos conectados
3. **Clique em**: Conectar um aparelho
4. **Escaneie o QR Code IMEDIATAMENTE**

### PASSO 5: Se o QR Code Expirar

Se você demorar e o código expirar, **delete e recrie a sessão**:

```bash
# Deletar sessão com QR expirado
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/BRUNO_PRINCIPAL_2026 \
  -H "Authorization: Bearer $TOKEN"

# Criar nova sessão com ID diferente
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"BRUNO_PRINCIPAL_2026_V2"}'

# Aguardar e buscar QR Code
sleep 10
curl -s https://whatsapp-api-ugdv.onrender.com/api/sessions/BRUNO_PRINCIPAL_2026_V2/qr \
  -H "Authorization: Bearer $TOKEN"
```

## 🎯 USANDO A INTERFACE WEB (MAIS FÁCIL)

A interface web atualiza o QR Code automaticamente! É **muito mais fácil**:

### 1. Acesse a Interface
```
https://whatsapp-api-ugdv.onrender.com/
```

### 2. Faça Login
- **Email**: admin@flow.com
- **Password**: admin123

### 3. Delete Sessões Antigas
- Clique em **"Excluir"** na sessão "T"
- Clique em **"Excluir"** na sessão "A"
- Aguarde 5 segundos
- Recarregue a página (F5)

### 4. Criar Nova Sessão
- Clique em **"Nova Sessão"**
- Digite um ID único: `BRUNO_PRINCIPAL`
- Clique em **"Criar"**

### 5. Escanear QR Code
- O QR Code aparecerá automaticamente
- **Escaneie IMEDIATAMENTE** com o WhatsApp
- O código atualiza automaticamente se expirar

### 6. Configurar Webhook
Após conectar, configure o webhook:
- Clique em **"Configurar Webhook"** na sessão
- Cole a URL: `https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook`
- Clique em **"Salvar"**

## 🔍 DIAGNÓSTICO DO SEU CASO

Você tem:
```json
{
  "sessions": [
    {
      "id": "T",
      "status": "connected",
      "phone_number": "5511935001870@c.us"
    },
    {
      "id": "A",
      "status": "qr_code",
      "phone_number": null
    }
  ]
}
```

**Problemas identificados:**

1. ✅ **Sessão "T" está conectada** - Funcionando
2. ❌ **Sessão "A" com QR Code antigo** - Expirado (criada há 5+ horas)
3. ⚠️ **Tentando conectar 2 sessões** - WhatsApp não permite mesmo número em múltiplas sessões

## 💡 RECOMENDAÇÕES

### Se você quer APENAS 1 número conectado:
1. **Mantenha a sessão "T"** (já está funcionando)
2. **Delete a sessão "A"**
3. **Configure webhook na sessão "T"**

```bash
# Deletar sessão A
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/A \
  -H "Authorization: Bearer $TOKEN"

# Configurar webhook na sessão T
curl -X PUT https://whatsapp-api-ugdv.onrender.com/api/sessions/T/webhook \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook"}'

# Testar envio de mensagem
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions/T/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511999999999",
    "message": "Teste de mensagem via API"
  }'
```

### Se você quer conectar OUTRO número:
1. **Delete a sessão "A"**
2. **Crie nova sessão com ID único**
3. **Escaneie IMEDIATAMENTE** com o outro número

```bash
# Deletar sessão A
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/A \
  -H "Authorization: Bearer $TOKEN"

# Criar nova sessão
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"SEGUNDO_NUMERO"}'

# Aguardar e buscar QR Code
sleep 10
curl -s https://whatsapp-api-ugdv.onrender.com/api/sessions/SEGUNDO_NUMERO/qr \
  -H "Authorization: Bearer $TOKEN"
```

## 🧪 TESTE RÁPIDO - OPÇÃO 1 (Usar sessão T existente)

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc2NzM4OTQ2MywiZXhwIjoxNzY3OTk0MjYzfQ.F5cqVqHr9kBirXSfVQUxYTCZo6egeC-JkF1LZ0m-N1U"

# 1. Deletar sessão A (QR expirado)
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/A \
  -H "Authorization: Bearer $TOKEN"

# 2. Configurar webhook na sessão T
curl -X PUT https://whatsapp-api-ugdv.onrender.com/api/sessions/T/webhook \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook"}'

# 3. Verificar configuração
curl -s https://whatsapp-api-ugdv.onrender.com/api/sessions/T \
  -H "Authorization: Bearer $TOKEN"

# 4. Enviar mensagem de teste para você mesmo
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions/T/messages \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "5511935001870",
    "message": "🎉 Teste de integração WhatsApp + Supabase funcionando!"
  }'

# 5. Verificar no Supabase se a mensagem foi salva
# Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/editor
# Execute: SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
```

## 🧪 TESTE RÁPIDO - OPÇÃO 2 (Criar nova sessão)

```bash
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImlhdCI6MTc2NzM4OTQ2MywiZXhwIjoxNzY3OTk0MjYzfQ.F5cqVqHr9kBirXSfVQUxYTCZo6egeC-JkF1LZ0m-N1U"

# 1. Deletar todas as sessões
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/T \
  -H "Authorization: Bearer $TOKEN"
curl -X DELETE https://whatsapp-api-ugdv.onrender.com/api/sessions/A \
  -H "Authorization: Bearer $TOKEN"

# 2. Criar nova sessão
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"BRUNO_NOVO_2026"}'

# 3. Aguardar QR Code
echo "Aguardando 10 segundos para gerar QR Code..."
sleep 10

# 4. Buscar QR Code
curl -s https://whatsapp-api-ugdv.onrender.com/api/sessions/BRUNO_NOVO_2026/qr \
  -H "Authorization: Bearer $TOKEN"

# 5. ESCANEIE O QR CODE IMEDIATAMENTE!

# 6. Após conectar, configurar webhook
curl -X PUT https://whatsapp-api-ugdv.onrender.com/api/sessions/BRUNO_NOVO_2026/webhook \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"webhookUrl":"https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook"}'
```

## 📝 CHECKLIST

### Antes de escanear QR Code:
- [ ] Deletei todas as sessões antigas
- [ ] Criei nova sessão com ID único
- [ ] Aguardei 10 segundos
- [ ] Busquei o QR Code
- [ ] Tenho o WhatsApp aberto no celular
- [ ] Estou pronto para escanear IMEDIATAMENTE

### Ao escanear:
- [ ] Abri WhatsApp → Configurações → Aparelhos conectados
- [ ] Cliquei em "Conectar um aparelho"
- [ ] Escaneei o QR Code em menos de 60 segundos
- [ ] Aguardei a confirmação de conexão

### Após conectar:
- [ ] Configurei o webhook
- [ ] Enviei mensagem de teste
- [ ] Verifiquei no Supabase se foi salva
- [ ] Testei receber mensagem

## 🎯 QUAL OPÇÃO ESCOLHER?

### Use OPÇÃO 1 se:
- ✅ A sessão "T" já está funcionando
- ✅ Você quer usar o número `5511935001870`
- ✅ Quer solução rápida (1 minuto)

### Use OPÇÃO 2 se:
- ✅ Quer conectar outro número
- ✅ A sessão "T" não está funcionando
- ✅ Quer começar do zero

### Use INTERFACE WEB se:
- ✅ Não quer usar linha de comando
- ✅ Quer ver QR Code atualizar automaticamente
- ✅ Prefere interface visual

---

## 🚀 RECOMENDAÇÃO FINAL

**Use a OPÇÃO 1** (mais rápida):
1. Delete apenas a sessão "A"
2. Configure webhook na sessão "T" existente
3. Teste envio/recebimento
4. Pronto! ✅

**Quer que eu execute os comandos para você?**
