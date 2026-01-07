# 🔧 CONFIGURAR WEBHOOK NO SEU SUPABASE

## 📋 INFORMAÇÕES DO SEU PROJETO

**Projeto**: brunomktparaadvogados-max's Project
**Project Ref**: `cuvbzzfspeugqbwavqkv`
**URL Supabase**: `https://cuvbzzfspeugqbwavqkv.supabase.co`
**Database URL**: `postgresql://postgres:Advogado25@db.cuvbzzfspeugqbwavqkv.supabase.co:5432/postgres`

**Nova URL do Webhook**: `https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook`

---

## 🎯 PASSO A PASSO COMPLETO

### 1️⃣ CRIAR TABELAS NO BANCO DE DADOS

Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/editor

Cole e execute este SQL:

```sql
-- Tabela de sessões WhatsApp
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'disconnected',
  webhook_url TEXT,
  connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de conversas
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  contact_name TEXT,
  last_message TEXT,
  last_message_at TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'aguardando',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(session_id, phone_number)
);

-- Tabela de mensagens
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  message_text TEXT,
  message_type TEXT DEFAULT 'text',
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  whatsapp_message_id TEXT,
  status TEXT DEFAULT 'pending',
  media_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);
CREATE INDEX IF NOT EXISTS idx_conversations_phone ON conversations(phone_number);

-- Habilitar Row Level Security (RLS)
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Políticas de acesso (permitir tudo por enquanto - ajuste conforme necessário)
CREATE POLICY "Permitir tudo em whatsapp_sessions" ON whatsapp_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo em conversations" ON conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo em messages" ON messages FOR ALL USING (true) WITH CHECK (true);

-- Habilitar Realtime para a tabela messages
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

---

### 2️⃣ CRIAR EDGE FUNCTION (WEBHOOK)

#### Opção A: Via Dashboard (MAIS FÁCIL)

1. Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/functions

2. Clique em **"Create a new function"**

3. Nome da função: `whatsapp-webhook`

4. Cole este código:

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const payload = await req.json()
    console.log('Webhook recebido:', JSON.stringify(payload, null, 2))

    if (payload.event === 'message') {
      const { sessionId, from, message, timestamp, messageId } = payload.data

      const { error: msgError } = await supabaseClient.from('messages').insert({
        session_id: sessionId,
        phone_number: from,
        message_text: message.body || '',
        message_type: message.type || 'text',
        direction: 'received',
        timestamp: new Date(timestamp * 1000).toISOString(),
        whatsapp_message_id: messageId,
        status: 'received'
      })

      if (msgError) {
        console.error('Erro ao inserir mensagem:', msgError)
      }

      const { error: convError } = await supabaseClient
        .from('conversations')
        .upsert({ 
          session_id: sessionId,
          phone_number: from,
          last_message: message.body,
          last_message_at: new Date(timestamp * 1000).toISOString(),
          status: 'respondeu',
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id,phone_number'
        })

      if (convError) {
        console.error('Erro ao atualizar conversa:', convError)
      }
    }

    if (payload.event === 'message_ack') {
      const { messageId, ack } = payload.data
      const statusMap = {
        1: 'sent',
        2: 'delivered',
        3: 'read'
      }

      const { error } = await supabaseClient
        .from('messages')
        .update({ status: statusMap[ack] || 'sent' })
        .eq('whatsapp_message_id', messageId)

      if (error) {
        console.error('Erro ao atualizar status:', error)
      }
    }

    if (payload.event === 'ready') {
      const { error } = await supabaseClient
        .from('whatsapp_sessions')
        .upsert({
          session_id: payload.data.sessionId,
          status: 'connected',
          connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'session_id'
        })

      if (error) {
        console.error('Erro ao atualizar sessão:', error)
      }
    }

    if (payload.event === 'disconnected') {
      const { error } = await supabaseClient
        .from('whatsapp_sessions')
        .update({ 
          status: 'disconnected',
          updated_at: new Date().toISOString()
        })
        .eq('session_id', payload.data.sessionId)

      if (error) {
        console.error('Erro ao desconectar sessão:', error)
      }
    }

    return new Response(
      JSON.stringify({ success: true, event: payload.event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro no webhook:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
```

5. Clique em **"Deploy"**

---

#### Opção B: Via CLI (AVANÇADO)

Se preferir usar a CLI do Supabase:

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Link com seu projeto
supabase link --project-ref cuvbzzfspeugqbwavqkv

# Criar função
supabase functions new whatsapp-webhook

# Editar o arquivo criado em supabase/functions/whatsapp-webhook/index.ts
# Cole o código acima

# Deploy
supabase functions deploy whatsapp-webhook
```

---

### 3️⃣ CONFIGURAR WEBHOOK NA API DO WHATSAPP

Agora você precisa configurar o webhook na API do WhatsApp.

**Nova URL do Webhook**: `https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook`

#### Via Interface Web:

1. Acesse: https://whatsapp-api-ugdv.onrender.com/
2. Login: `admin@flow.com` / `admin123`
3. Ao criar uma sessão, use esta URL no campo "Webhook URL"

#### Via API:

```bash
# Primeiro, faça login
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"admin123"}'

# Pegue o token retornado e use aqui:
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -d '{
    "sessionId": "minha-sessao",
    "webhookUrl": "https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook"
  }'
```

---

### 4️⃣ TESTAR O WEBHOOK

1. **Crie uma sessão** com o webhook configurado
2. **Conecte o WhatsApp** (escaneie o QR Code)
3. **Envie uma mensagem** para o número conectado
4. **Verifique no Supabase** se a mensagem foi salva:

```sql
-- Ver mensagens recebidas
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 10;

-- Ver conversas
SELECT * FROM conversations ORDER BY last_message_at DESC;

-- Ver sessões
SELECT * FROM whatsapp_sessions;
```

---

### 5️⃣ MONITORAR LOGS

Para ver os logs da Edge Function:

1. Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/functions/whatsapp-webhook/logs
2. Veja os logs em tempo real
3. Verifique se há erros

---

## 🔧 ATUALIZAR VARIÁVEIS DE AMBIENTE NO LOVABLE

Se você for criar interface no Lovable, use estas variáveis:

```env
VITE_WHATSAPP_API_URL=https://whatsapp-api-ugdv.onrender.com
VITE_SUPABASE_URL=https://cuvbzzfspeugqbwavqkv.supabase.co
VITE_SUPABASE_ANON_KEY=seu_anon_key_aqui
```

**Para obter o ANON_KEY:**
1. Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/settings/api
2. Copie o valor de "anon public"

---

## 📊 ESTRUTURA DAS TABELAS

### whatsapp_sessions
```
id              | UUID
session_id      | TEXT (único)
status          | TEXT (connected/disconnected)
webhook_url     | TEXT
connected_at    | TIMESTAMP
created_at      | TIMESTAMP
updated_at      | TIMESTAMP
```

### conversations
```
id              | UUID
session_id      | TEXT
phone_number    | TEXT
contact_name    | TEXT
last_message    | TEXT
last_message_at | TIMESTAMP
status          | TEXT (aguardando/respondeu)
created_at      | TIMESTAMP
updated_at      | TIMESTAMP
```

### messages
```
id                  | UUID
session_id          | TEXT
phone_number        | TEXT
message_text        | TEXT
message_type        | TEXT (text/image/video/etc)
direction           | TEXT (sent/received)
timestamp           | TIMESTAMP
whatsapp_message_id | TEXT
status              | TEXT (pending/sent/delivered/read)
media_url           | TEXT
created_at          | TIMESTAMP
```

---

## 🔍 VERIFICAR SE ESTÁ FUNCIONANDO

### 1. Verificar tabelas criadas:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('whatsapp_sessions', 'conversations', 'messages');
```

### 2. Verificar Edge Function:

```bash
curl https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{}}'
```

### 3. Verificar Realtime:

No Lovable ou em qualquer app, teste:

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cuvbzzfspeugqbwavqkv.supabase.co',
  'SEU_ANON_KEY'
)

supabase
  .channel('messages')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'messages'
  }, (payload) => {
    console.log('Nova mensagem:', payload)
  })
  .subscribe()
```

---

## ✅ CHECKLIST

- [ ] Criei as tabelas no banco de dados
- [ ] Criei a Edge Function whatsapp-webhook
- [ ] Testei a Edge Function
- [ ] Configurei o webhook na API do WhatsApp
- [ ] Criei uma sessão com o webhook
- [ ] Conectei o WhatsApp
- [ ] Enviei mensagem de teste
- [ ] Verifiquei se a mensagem foi salva no banco
- [ ] Verifiquei os logs da Edge Function

---

## 🆘 PROBLEMAS COMUNS

### Erro: "relation does not exist"
**Solução**: Execute o SQL de criação das tabelas novamente

### Webhook não recebe eventos
**Solução**: 
1. Verifique se a URL está correta
2. Veja os logs da Edge Function
3. Teste a Edge Function manualmente

### Mensagens não aparecem no banco
**Solução**:
1. Verifique os logs da Edge Function
2. Verifique as políticas RLS
3. Teste inserir manualmente no banco

---

## 📞 LINKS IMPORTANTES

- **Dashboard Supabase**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv
- **SQL Editor**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/editor
- **Edge Functions**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/functions
- **API Settings**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/settings/api
- **Logs**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/logs

---

**🎉 Pronto! Agora seu webhook está configurado no SEU projeto Supabase!**
