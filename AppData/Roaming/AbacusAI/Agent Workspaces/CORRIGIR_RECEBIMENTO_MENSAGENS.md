# 🔧 CORRIGIR RECEBIMENTO DE MENSAGENS NO FLOW/LOVABLE

## ❌ PROBLEMA
- **Envio de mensagens**: ✅ Funcionando
- **Recebimento de mensagens**: ❌ Não está funcionando

## 🔍 DIAGNÓSTICO

O webhook está implementado na API, mas precisa ser **configurado no Flow/Lovable**.

---

## ✅ SOLUÇÃO: CONFIGURAR WEBHOOK NO FLOW

### 1. **Criar Edge Function no Supabase**

No Supabase, vá em **Edge Functions** e crie uma função chamada `whatsapp-webhook`:

```typescript
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  try {
    const { event, sessionId, userId, message } = await req.json();
    
    console.log('📥 Webhook recebido:', { event, sessionId, userId, message });

    if (event !== 'message' || !message) {
      return new Response(JSON.stringify({ error: 'Invalid payload' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Busca o flowUserId do usuário da API
    const { data: apiUser } = await supabase
      .from('api_users')
      .select('flow_user_id')
      .eq('api_user_id', userId)
      .single();

    if (!apiUser?.flow_user_id) {
      console.error('❌ flowUserId não encontrado para userId:', userId);
      return new Response(JSON.stringify({ error: 'User not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const flowUserId = apiUser.flow_user_id;

    // Salva o contato (se não existir)
    await supabase
      .from('contacts')
      .upsert({
        user_id: flowUserId,
        phone_number: message.from,
        name: message.from,
        last_message_at: new Date(message.timestamp * 1000).toISOString(),
      }, {
        onConflict: 'user_id,phone_number',
      });

    // Salva a mensagem
    await supabase
      .from('messages')
      .insert({
        contact_phone: message.from,
        message_type: message.type,
        body: message.body,
        media_url: message.mediaUrl,
        from_me: false,
        timestamp: new Date(message.timestamp * 1000).toISOString(),
        user_id: flowUserId,
      });

    console.log('✅ Mensagem salva no Supabase');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
```

---

### 2. **Criar Tabela `api_users` no Supabase**

Execute no **SQL Editor** do Supabase:

```sql
CREATE TABLE IF NOT EXISTS api_users (
  id SERIAL PRIMARY KEY,
  api_user_id INTEGER NOT NULL UNIQUE,
  flow_user_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índice para busca rápida
CREATE INDEX idx_api_users_api_user_id ON api_users(api_user_id);
```

---

### 3. **Atualizar Tabelas `contacts` e `messages` no Supabase**

Execute no **SQL Editor**:

```sql
-- Adicionar user_id na tabela contacts (se não existir)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Adicionar user_id na tabela messages (se não existir)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
```

---

### 4. **Configurar Webhook no Flow/Lovable**

No código do Flow, adicione a configuração do webhook após o login:

```typescript
// src/pages/Login.tsx ou onde faz o login

const handleLogin = async (e: React.FormEvent) => {
  e.preventDefault();
  try {
    // Login na API do Koyeb
    const apiResponse = await whatsappApi.login(email, password);
    localStorage.setItem('token', apiResponse.token);
    localStorage.setItem('sessionId', apiResponse.sessionId);
    
    // Login no Supabase (Flow)
    const { data: flowUser, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;

    // Mapear userId da API com flowUserId
    await supabase.from('api_users').upsert({
      api_user_id: apiResponse.userId,
      flow_user_id: flowUser.user.id,
    }, {
      onConflict: 'api_user_id',
    });

    // Configurar webhook na API
    const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
    await whatsappApi.setWebhook(apiResponse.sessionId, webhookUrl);

    toast({ title: '✅ Login realizado com sucesso!' });
    navigate('/dashboard');
  } catch (error) {
    toast({ title: '❌ Erro ao fazer login', variant: 'destructive' });
  }
};
```

---

### 5. **Atualizar `whatsappApi.ts`**

Adicione o método `setWebhook`:

```typescript
// src/services/whatsappApi.ts

export const whatsappApi = {
  // ... outros métodos ...

  setWebhook: async (sessionId: string, webhookUrl: string) => {
    const response = await api.put(`/api/sessions/${sessionId}/webhook`, { webhookUrl });
    return response.data;
  },
};
```

---

## 🎯 RESUMO

1. ✅ **Normalização de números** implementada (com/sem 9º dígito)
2. ✅ **Webhook na API** já está implementado
3. ⚠️ **Falta configurar**:
   - Edge Function no Supabase
   - Tabela `api_users`
   - Configurar webhook no login do Flow

---

## 📋 PRÓXIMOS PASSOS

1. **Crie a Edge Function** no Supabase
2. **Execute os SQLs** para criar as tabelas
3. **Atualize o código do Flow** para configurar o webhook
4. **Teste enviando uma mensagem** para o WhatsApp conectado
5. **Verifique no Supabase** se a mensagem foi salva

---

## 🔍 COMO TESTAR

1. Conecte o WhatsApp no Flow
2. Envie uma mensagem **para** o WhatsApp conectado (de outro celular)
3. Verifique os logs da Edge Function no Supabase
4. Verifique a tabela `messages` no Supabase
5. A mensagem deve aparecer no Flow automaticamente
