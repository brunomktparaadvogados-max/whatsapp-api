# ⚡ GUIA RÁPIDO - Configurar Webhook (5 minutos)

## 🎯 SEU PROJETO SUPABASE

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  📦 Projeto: brunomktparaadvogados-max's Project        │
│  🔑 Ref: cuvbzzfspeugqbwavqkv                           │
│  🌐 URL: https://cuvbzzfspeugqbwavqkv.supabase.co       │
│  🪝 Webhook: https://cuvbzzfspeugqbwavqkv.supabase.co/  │
│             functions/v1/whatsapp-webhook                │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## 🚀 3 PASSOS RÁPIDOS

### 1️⃣ CRIAR TABELAS (2 minutos)

1. Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/editor

2. Clique em **"New Query"**

3. Cole este SQL e clique em **"Run"**:

```sql
-- Criar tabelas
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'disconnected',
  webhook_url TEXT,
  connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

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

-- Índices
CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_phone ON messages(phone_number);
CREATE INDEX IF NOT EXISTS idx_conversations_session ON conversations(session_id);

-- RLS
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir tudo" ON whatsapp_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo" ON conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Permitir tudo" ON messages FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
```

✅ **Pronto!** Tabelas criadas.

---

### 2️⃣ CRIAR EDGE FUNCTION (2 minutos)

1. Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/functions

2. Clique em **"Create a new function"**

3. Nome: `whatsapp-webhook`

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
    console.log('Webhook:', JSON.stringify(payload, null, 2))

    if (payload.event === 'message') {
      const { sessionId, from, message, timestamp, messageId } = payload.data
      await supabaseClient.from('messages').insert({
        session_id: sessionId,
        phone_number: from,
        message_text: message.body || '',
        message_type: message.type || 'text',
        direction: 'received',
        timestamp: new Date(timestamp * 1000).toISOString(),
        whatsapp_message_id: messageId,
        status: 'received'
      })
      await supabaseClient.from('conversations').upsert({ 
        session_id: sessionId,
        phone_number: from,
        last_message: message.body,
        last_message_at: new Date(timestamp * 1000).toISOString(),
        status: 'respondeu',
        updated_at: new Date().toISOString()
      }, { onConflict: 'session_id,phone_number' })
    }

    if (payload.event === 'message_ack') {
      const { messageId, ack } = payload.data
      const statusMap = { 1: 'sent', 2: 'delivered', 3: 'read' }
      await supabaseClient.from('messages')
        .update({ status: statusMap[ack] || 'sent' })
        .eq('whatsapp_message_id', messageId)
    }

    if (payload.event === 'ready') {
      await supabaseClient.from('whatsapp_sessions').upsert({
        session_id: payload.data.sessionId,
        status: 'connected',
        connected_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }, { onConflict: 'session_id' })
    }

    if (payload.event === 'disconnected') {
      await supabaseClient.from('whatsapp_sessions')
        .update({ status: 'disconnected', updated_at: new Date().toISOString() })
        .eq('session_id', payload.data.sessionId)
    }

    return new Response(
      JSON.stringify({ success: true, event: payload.event }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Erro:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
```

5. Clique em **"Deploy"**

✅ **Pronto!** Edge Function criada.

---

### 3️⃣ USAR O WEBHOOK (1 minuto)

Agora use esta URL ao criar sessões:

```
https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook
```

**Na interface web:**
1. Acesse: https://whatsapp-api-ugdv.onrender.com/
2. Login: admin@flow.com / admin123
3. Criar sessão → Cole a URL do webhook
4. Pronto!

✅ **Pronto!** Webhook configurado.

---

## 🧪 TESTAR

### 1. Criar sessão com webhook:

Na interface web, ao criar sessão, use:
```
Webhook URL: https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook
```

### 2. Conectar WhatsApp e enviar mensagem

### 3. Verificar no Supabase:

Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/editor

Execute:
```sql
SELECT * FROM messages ORDER BY timestamp DESC LIMIT 5;
```

Se aparecer a mensagem, **está funcionando!** ✅

---

## 📊 VERIFICAR LOGS

Ver logs da Edge Function:
https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/functions/whatsapp-webhook/logs

---

## 🔑 OBTER ANON KEY (Para Lovable)

1. Acesse: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/settings/api
2. Copie o valor de **"anon public"**
3. Use no Lovable:

```env
VITE_SUPABASE_URL=https://cuvbzzfspeugqbwavqkv.supabase.co
VITE_SUPABASE_ANON_KEY=seu_anon_key_copiado
```

---

## ✅ CHECKLIST

- [ ] Criei as tabelas (SQL executado)
- [ ] Criei a Edge Function (Deploy feito)
- [ ] Testei criar sessão com webhook
- [ ] Enviei mensagem de teste
- [ ] Verifiquei mensagem no banco
- [ ] Vi os logs da função

---

## 🆘 PROBLEMAS?

### Tabelas não criadas
Execute o SQL novamente no editor

### Edge Function com erro
Veja os logs: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/functions/whatsapp-webhook/logs

### Mensagens não aparecem
1. Verifique se o webhook está correto
2. Veja os logs da função
3. Teste manualmente:

```bash
curl https://cuvbzzfspeugqbwavqkv.supabase.co/functions/v1/whatsapp-webhook \
  -X POST \
  -H "Content-Type: application/json" \
  -d '{"event":"test","data":{}}'
```

---

## 📞 LINKS RÁPIDOS

- **Dashboard**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv
- **SQL Editor**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/editor
- **Functions**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/functions
- **API Keys**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/settings/api
- **Logs**: https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/logs

---

## 📚 DOCUMENTAÇÃO COMPLETA

Para mais detalhes, veja: `CONFIGURAR_WEBHOOK_SUPABASE.md`

---

**🎉 Pronto em 5 minutos! Seu webhook está configurado!**
