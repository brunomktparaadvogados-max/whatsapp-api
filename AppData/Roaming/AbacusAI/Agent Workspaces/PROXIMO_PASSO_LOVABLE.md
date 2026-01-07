# 🎯 PRÓXIMO PASSO - CONFIGURAR LOVABLE/FLOW

## ⚠️ VOCÊ PRECISA FAZER MANUALMENTE NO SUPABASE

### 1. **Criar Edge Function no Supabase** (OBRIGATÓRIO)

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **Edge Functions** (menu lateral)
4. Clique em **Create a new function**
5. Nome: `whatsapp-webhook`
6. Cole o código abaixo:

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

7. Clique em **Deploy**

---

### 2. **Criar Tabela `api_users` no Supabase** (OBRIGATÓRIO)

1. Vá em **SQL Editor** no Supabase
2. Clique em **New query**
3. Cole o SQL abaixo:

```sql
CREATE TABLE IF NOT EXISTS api_users (
  id SERIAL PRIMARY KEY,
  api_user_id INTEGER NOT NULL UNIQUE,
  flow_user_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_api_users_api_user_id ON api_users(api_user_id);
```

4. Clique em **Run**

---

### 3. **Atualizar Tabelas `contacts` e `messages`** (OBRIGATÓRIO)

1. No **SQL Editor**, cole:

```sql
-- Adicionar user_id na tabela contacts (se não existir)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Adicionar user_id na tabela messages (se não existir)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages(user_id);
```

2. Clique em **Run**

---

## 📋 DEPOIS DE CONFIGURAR O SUPABASE, INSTRUA O LOVABLE:

Cole isso no chat do Lovable:

```
Atualize o sistema para integrar com a API do WhatsApp no Koyeb:

1. **Atualizar whatsappApi.ts**:
   - Adicionar método getWebhooksInfo()
   - Atualizar sendMessage() para verificar campo "success" no retorno
   - Se success === false, lançar erro e NÃO contabilizar como enviado

2. **Criar componente WebhooksInfo.tsx**:
   - Exibir webhooks de envio e recebimento
   - Botão para copiar URLs
   - Instruções de uso

3. **Atualizar Login.tsx**:
   - Após login bem-sucedido na API, fazer login no Supabase
   - Mapear api_user_id com flow_user_id na tabela api_users
   - Configurar webhook de recebimento automaticamente

4. **Código para Login.tsx**:

```typescript
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

5. **Adicionar método setWebhook em whatsappApi.ts**:

```typescript
setWebhook: async (sessionId: string, webhookUrl: string) => {
  const response = await api.put(`/api/sessions/${sessionId}/webhook`, { webhookUrl });
  return response.data;
},
```

6. **Atualizar sendMessage para verificar sucesso**:

```typescript
sendMessage: async (sessionId: string, to: string, message: string) => {
  try {
    const response = await api.post(`/api/sessions/${sessionId}/message`, { to, message });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Falha ao enviar mensagem');
    }
    
    return response.data;
  } catch (error: any) {
    throw new Error(error.response?.data?.error || 'Erro ao enviar mensagem');
  }
},
```

7. **Criar página de Webhooks**:
   - Exibir webhooks de envio/recebimento
   - Botão para copiar URLs
   - Status de configuração

URL da API: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app
```

---

## ✅ CHECKLIST

- [ ] Criar Edge Function `whatsapp-webhook` no Supabase
- [ ] Criar tabela `api_users` no Supabase
- [ ] Atualizar tabelas `contacts` e `messages` no Supabase
- [ ] Instruir o Lovable com o código acima
- [ ] Testar login e verificar se webhook foi configurado
- [ ] Testar envio de mensagem
- [ ] Testar recebimento de mensagem

---

## 🔍 COMO TESTAR

1. **Faça login no Flow**
2. **Conecte o WhatsApp** (escanear QR Code)
3. **Envie uma mensagem** pelo Flow
4. **Envie uma mensagem PARA o WhatsApp** (de outro celular)
5. **Verifique** se a mensagem apareceu no Flow
6. **Acesse** `GET /api/webhooks/info` para ver seus webhooks

---

## 📞 SE DER ERRO

1. Verifique os logs da Edge Function no Supabase
2. Verifique se a tabela `api_users` foi criada
3. Verifique se o webhook foi configurado (`GET /api/webhooks/info`)
4. Verifique os logs do Koyeb
