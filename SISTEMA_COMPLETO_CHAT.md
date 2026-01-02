# 💬 INTEGRAÇÃO COMPLETA - ENVIAR E RECEBER MENSAGENS

## 🎯 OBJETIVO

Criar um sistema completo onde:
- ✅ Enviar mensagens pelo sistema Flow
- ✅ Receber mensagens do WhatsApp no sistema
- ✅ Chat em tempo real no navegador
- ✅ Integração com CRM
- ✅ Não depender do app WhatsApp

---

## 🔄 ARQUITETURA DA SOLUÇÃO

```
WhatsApp ←→ API (Render) ←→ Webhook ←→ Lovable (Sistema Flow)
                                ↓
                              CRM
```

---

## 📋 PASSO A PASSO COMPLETO

### PARTE 1: Configurar Webhook no Lovable

#### 1.1 Criar Endpoint de Webhook no Lovable

Cole no chat do Lovable:

```
Crie um sistema completo de chat WhatsApp com:

1. WEBHOOK ENDPOINT para receber mensagens:
   - POST /api/webhook/whatsapp
   - Recebe eventos: message, message_ack, ready, disconnected
   - Salva mensagens no banco de dados
   - Emite eventos via WebSocket para atualização em tempo real

2. INTERFACE DE CHAT:
   - Lista de conversas (contatos)
   - Chat em tempo real com mensagens
   - Envio de mensagens
   - Status de entrega (enviado, entregue, lido)
   - Notificações de novas mensagens

3. INTEGRAÇÃO COM CRM:
   - Vincular conversas a clientes
   - Histórico completo de mensagens
   - Tags e categorização
   - Atribuição a atendentes

4. BANCO DE DADOS:
   - Tabela: conversations (id, contact_name, contact_number, last_message, unread_count)
   - Tabela: messages (id, conversation_id, from, to, body, timestamp, status, is_from_me)
   - Tabela: contacts (id, name, number, avatar, tags)

5. WEBSOCKET:
   - Conexão em tempo real
   - Atualização automática de mensagens
   - Notificações de status

Use Supabase para banco de dados e Socket.io para WebSocket.
```

#### 1.2 Estrutura do Webhook

```typescript
// app/api/webhook/whatsapp/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, sessionId, data } = body;

    console.log('Webhook recebido:', { event, sessionId, data });

    switch (event) {
      case 'message':
        await handleNewMessage(data);
        break;
      
      case 'message_ack':
        await handleMessageStatus(data);
        break;
      
      case 'ready':
        await handleSessionReady(sessionId, data);
        break;
      
      case 'disconnected':
        await handleSessionDisconnected(sessionId, data);
        break;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Erro no webhook:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleNewMessage(data: any) {
  const { id, from, to, body, timestamp, fromMe, hasMedia } = data;

  // Extrair número do contato
  const contactNumber = fromMe ? to.replace('@c.us', '') : from.replace('@c.us', '');

  // Buscar ou criar conversa
  let { data: conversation } = await supabase
    .from('conversations')
    .select('*')
    .eq('contact_number', contactNumber)
    .single();

  if (!conversation) {
    const { data: newConversation } = await supabase
      .from('conversations')
      .insert({
        contact_number: contactNumber,
        contact_name: contactNumber,
        last_message: body,
        last_message_time: new Date(timestamp * 1000).toISOString(),
        unread_count: fromMe ? 0 : 1,
      })
      .select()
      .single();
    
    conversation = newConversation;
  } else {
    // Atualizar conversa
    await supabase
      .from('conversations')
      .update({
        last_message: body,
        last_message_time: new Date(timestamp * 1000).toISOString(),
        unread_count: fromMe ? conversation.unread_count : conversation.unread_count + 1,
      })
      .eq('id', conversation.id);
  }

  // Salvar mensagem
  await supabase.from('messages').insert({
    conversation_id: conversation.id,
    message_id: id,
    from: from,
    to: to,
    body: body,
    timestamp: new Date(timestamp * 1000).toISOString(),
    is_from_me: fromMe,
    has_media: hasMedia,
    status: 'received',
  });

  // Emitir evento WebSocket (implementar com Socket.io)
  // io.to(conversation.id).emit('new_message', { conversationId: conversation.id, message });
}

async function handleMessageStatus(data: any) {
  const { id, ack } = data;
  
  const status = {
    0: 'error',
    1: 'pending',
    2: 'sent',
    3: 'delivered',
    4: 'read',
  }[ack] || 'unknown';

  await supabase
    .from('messages')
    .update({ status })
    .eq('message_id', id);
}

async function handleSessionReady(sessionId: string, data: any) {
  console.log('Sessão pronta:', sessionId, data);
  // Atualizar status da sessão no banco
}

async function handleSessionDisconnected(sessionId: string, data: any) {
  console.log('Sessão desconectada:', sessionId, data);
  // Atualizar status da sessão no banco
}
```

---

### PARTE 2: Configurar Webhook na API WhatsApp

#### 2.1 Obter URL do Webhook do Lovable

Depois que o Lovable criar o endpoint, você terá uma URL como:
```
https://seu-projeto.lovable.app/api/webhook/whatsapp
```

#### 2.2 Configurar na API WhatsApp

**Opção A: Via Interface Web**

1. Acesse: https://whatsapp-api-ugdv.onrender.com
2. Faça login (admin@flow.com / admin123)
3. Ao criar uma sessão, preencha o campo **"Webhook URL"**:
   ```
   https://seu-projeto.lovable.app/api/webhook/whatsapp
   ```

**Opção B: Via API**

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "flow-system",
    "webhookUrl": "https://seu-projeto.lovable.app/api/webhook/whatsapp"
  }'
```

**Opção C: Atualizar Webhook de Sessão Existente**

```bash
curl -X PUT https://whatsapp-api-ugdv.onrender.com/api/sessions/flow-system/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "webhookUrl": "https://seu-projeto.lovable.app/api/webhook/whatsapp"
  }'
```

---

### PARTE 3: Criar Interface de Chat no Lovable

Cole no chat do Lovable:

```
Crie uma interface de chat WhatsApp completa com:

1. LAYOUT:
   - Sidebar esquerda: Lista de conversas
   - Área central: Chat ativo
   - Sidebar direita: Informações do contato/CRM

2. LISTA DE CONVERSAS:
   - Avatar do contato
   - Nome/número
   - Última mensagem
   - Timestamp
   - Badge de mensagens não lidas
   - Busca/filtro
   - Ordenação por data

3. ÁREA DE CHAT:
   - Mensagens em formato de chat (balões)
   - Mensagens do cliente (esquerda)
   - Mensagens enviadas (direita, azul)
   - Status de entrega (✓ enviado, ✓✓ entregue, ✓✓ azul lido)
   - Timestamp
   - Campo de input com botão enviar
   - Suporte a quebra de linha (Shift+Enter)
   - Auto-scroll para última mensagem
   - Loading states

4. INFORMAÇÕES DO CONTATO:
   - Nome e número
   - Avatar
   - Tags
   - Notas do CRM
   - Histórico de interações
   - Botão para vincular a cliente existente

5. FUNCIONALIDADES:
   - Enviar mensagem (Enter)
   - Receber mensagens em tempo real (WebSocket)
   - Notificações de novas mensagens
   - Marcar como lida
   - Buscar em mensagens
   - Exportar conversa

6. INTEGRAÇÃO:
   - API WhatsApp: https://whatsapp-api-ugdv.onrender.com
   - WebSocket para tempo real
   - Supabase para persistência

Use Shadcn UI, React Query e Socket.io.
```

---

### PARTE 4: Schema do Banco de Dados (Supabase)

```sql
-- Tabela de conversas
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  contact_number VARCHAR(20) UNIQUE NOT NULL,
  contact_name VARCHAR(255),
  avatar_url TEXT,
  last_message TEXT,
  last_message_time TIMESTAMP,
  unread_count INTEGER DEFAULT 0,
  tags TEXT[],
  assigned_to UUID REFERENCES users(id),
  customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de mensagens
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  message_id VARCHAR(255) UNIQUE,
  from_number VARCHAR(20),
  to_number VARCHAR(20),
  body TEXT,
  timestamp TIMESTAMP,
  is_from_me BOOLEAN DEFAULT FALSE,
  has_media BOOLEAN DEFAULT FALSE,
  media_url TEXT,
  status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW()
);

-- Tabela de sessões WhatsApp
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'disconnected',
  qr_code TEXT,
  phone_number VARCHAR(20),
  webhook_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX idx_conversations_number ON conversations(contact_number);
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
CREATE INDEX idx_conversations_updated ON conversations(updated_at DESC);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

---

### PARTE 5: Implementar WebSocket (Tempo Real)

```typescript
// lib/socket.ts
import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const initSocket = () => {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001', {
      transports: ['websocket'],
    });

    socket.on('connect', () => {
      console.log('Socket conectado');
    });

    socket.on('disconnect', () => {
      console.log('Socket desconectado');
    });
  }
  return socket;
};

export const subscribeToConversation = (conversationId: string, callback: (message: any) => void) => {
  const socket = initSocket();
  socket.emit('join_conversation', conversationId);
  socket.on('new_message', callback);
};

export const unsubscribeFromConversation = (conversationId: string) => {
  const socket = initSocket();
  socket.emit('leave_conversation', conversationId);
  socket.off('new_message');
};
```

---

### PARTE 6: Hook React para Chat

```typescript
// hooks/useWhatsAppChat.ts
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { subscribeToConversation, unsubscribeFromConversation } from '@/lib/socket';

const API_URL = 'https://whatsapp-api-ugdv.onrender.com';

export const useWhatsAppChat = (conversationId?: string) => {
  const queryClient = useQueryClient();

  // Buscar conversas
  const { data: conversations, isLoading: loadingConversations } = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const response = await fetch('/api/conversations');
      return response.json();
    },
    refetchInterval: 5000, // Atualizar a cada 5 segundos
  });

  // Buscar mensagens de uma conversa
  const { data: messages, isLoading: loadingMessages } = useQuery({
    queryKey: ['messages', conversationId],
    queryFn: async () => {
      if (!conversationId) return [];
      const response = await fetch(`/api/conversations/${conversationId}/messages`);
      return response.json();
    },
    enabled: !!conversationId,
  });

  // Enviar mensagem
  const sendMessage = useMutation({
    mutationFn: async ({ to, message }: { to: string; message: string }) => {
      const response = await fetch(`${API_URL}/api/sessions/flow-system/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message }),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages', conversationId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  // WebSocket para mensagens em tempo real
  useEffect(() => {
    if (!conversationId) return;

    const handleNewMessage = (message: any) => {
      queryClient.setQueryData(['messages', conversationId], (old: any) => {
        return [...(old || []), message];
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    };

    subscribeToConversation(conversationId, handleNewMessage);

    return () => {
      unsubscribeFromConversation(conversationId);
    };
  }, [conversationId, queryClient]);

  return {
    conversations,
    messages,
    loadingConversations,
    loadingMessages,
    sendMessage: sendMessage.mutate,
    isSending: sendMessage.isPending,
  };
};
```

---

## 🎯 FLUXO COMPLETO

### 1. Receber Mensagem do WhatsApp

```
Cliente envia mensagem no WhatsApp
    ↓
API WhatsApp recebe (whatsapp-web.js)
    ↓
API envia webhook para Lovable
    ↓
Lovable salva no Supabase
    ↓
WebSocket notifica interface
    ↓
Chat atualiza em tempo real
```

### 2. Enviar Mensagem pelo Sistema

```
Atendente digita no chat do sistema
    ↓
Sistema chama API WhatsApp
    ↓
API envia via WhatsApp
    ↓
Cliente recebe no WhatsApp
    ↓
Webhook retorna status de entrega
    ↓
Sistema atualiza status (✓✓)
```

---

## 🚀 DEPLOY E CONFIGURAÇÃO

### 1. Configurar Supabase

1. Acesse: https://supabase.com
2. Crie um projeto
3. Execute o SQL do schema acima
4. Copie as credenciais

### 2. Configurar Variáveis de Ambiente no Lovable

```
VITE_WHATSAPP_API_URL=https://whatsapp-api-ugdv.onrender.com
NEXT_PUBLIC_SUPABASE_URL=sua-url-supabase
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-chave-publica
SUPABASE_SERVICE_ROLE_KEY=sua-chave-privada
NEXT_PUBLIC_SOCKET_URL=sua-url-socket
```

### 3. Criar Sessão WhatsApp

```bash
curl -X POST https://whatsapp-api-ugdv.onrender.com/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "flow-system",
    "webhookUrl": "https://seu-projeto.lovable.app/api/webhook/whatsapp"
  }'
```

### 4. Escanear QR Code

1. Acesse: https://whatsapp-api-ugdv.onrender.com
2. Login: admin@flow.com / admin123
3. Veja o QR Code da sessão "flow-system"
4. Escaneie com WhatsApp

---

## ✅ RESULTADO FINAL

Você terá um sistema completo onde:

✅ **Recebe mensagens** do WhatsApp automaticamente
✅ **Envia mensagens** pelo sistema Flow
✅ **Chat em tempo real** no navegador
✅ **Histórico completo** de conversas
✅ **Status de entrega** (enviado, entregue, lido)
✅ **Integração com CRM**
✅ **Múltiplos atendentes** podem usar
✅ **Não depende** do app WhatsApp

---

## 📞 PRÓXIMOS PASSOS

1. Cole os prompts no Lovable para criar a estrutura
2. Configure o Supabase
3. Configure as variáveis de ambiente
4. Crie a sessão WhatsApp com webhook
5. Teste enviando e recebendo mensagens

**Quer que eu te ajude com alguma parte específica?**
