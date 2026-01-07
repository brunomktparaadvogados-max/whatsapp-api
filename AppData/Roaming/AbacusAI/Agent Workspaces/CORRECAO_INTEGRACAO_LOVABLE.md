# 🔧 CORREÇÃO - Integração WhatsApp API com Lovable

## ❌ PROBLEMA IDENTIFICADO

A integração com o Lovable não está funcionando. Possíveis causas:

1. **Código do projeto Lovable não existe** - Os arquivos mencionados (whatsappApi.ts, ChatView.tsx, etc.) não foram encontrados
2. **Projeto está apenas documentado** - Existe documentação mas não o código implementado
3. **Estrutura de pastas incorreta** - O projeto pode estar em outro local

## 📋 CHECKLIST DE VERIFICAÇÃO

### 1. Verificar se o projeto Lovable existe

```bash
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces"
dir /s /b *.tsx *.ts | findstr /i "whatsapp chat"
```

### 2. Verificar se a API está rodando

```bash
curl https://whatsapp-api-ugdv.onrender.com/api/sessions
```

### 3. Verificar webhook do Supabase

URL do webhook: `https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook`

## 🚀 SOLUÇÃO PASSO A PASSO

### OPÇÃO 1: Criar projeto do zero no Lovable

Se o projeto não existe, você precisa:

1. **Acessar o Lovable** (https://lovable.dev ou https://sistemaflow.lovable.app)

2. **Configurar variáveis de ambiente**:
   ```env
   VITE_WHATSAPP_API_URL=https://whatsapp-api-ugdv.onrender.com
   VITE_SUPABASE_URL=https://qzxywaajfmnkycrpzwmr.supabase.co
   VITE_SUPABASE_ANON_KEY=seu_anon_key_aqui
   ```

3. **Criar o serviço WhatsApp** (`src/services/whatsappApi.ts`):

```typescript
const API_URL = import.meta.env.VITE_WHATSAPP_API_URL || 'https://whatsapp-api-ugdv.onrender.com';

export const whatsappApi = {
  async createSession(sessionId: string, webhookUrl?: string) {
    const response = await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, webhookUrl })
    });
    if (!response.ok) throw new Error('Erro ao criar sessão');
    return response.json();
  },

  async getQRCode(sessionId: string) {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId}/qr`);
    if (!response.ok) throw new Error('Erro ao obter QR Code');
    return response.json();
  },

  async sendMessage(sessionId: string, to: string, message: string) {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, message })
    });
    if (!response.ok) throw new Error('Erro ao enviar mensagem');
    return response.json();
  },

  async getSessions() {
    const response = await fetch(`${API_URL}/api/sessions`);
    if (!response.ok) throw new Error('Erro ao listar sessões');
    return response.json();
  },

  async deleteSession(sessionId: string) {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Erro ao deletar sessão');
    return response.json();
  },

  async updateSessionWebhook(sessionId: string, webhookUrl: string) {
    const response = await fetch(`${API_URL}/api/sessions/${sessionId}/webhook`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ webhookUrl })
    });
    if (!response.ok) throw new Error('Erro ao atualizar webhook');
    return response.json();
  },

  getWebhookUrl() {
    return 'https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook';
  },

  getApiUrl() {
    return API_URL;
  }
};
```

4. **Criar componente de Sessões WhatsApp** (`src/components/WhatsAppSessions.tsx`):

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { whatsappApi } from '@/services/whatsappApi';
import { QrCode, Trash2, Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const WhatsAppSessions = () => {
  const [sessions, setSessions] = useState([]);
  const [newSessionId, setNewSessionId] = useState('');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadSessions = async () => {
    try {
      const data = await whatsappApi.getSessions();
      setSessions(data.sessions || []);
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar as sessões',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  const handleCreateSession = async () => {
    if (!newSessionId.trim()) {
      toast({
        title: 'Erro',
        description: 'Digite um ID para a sessão',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      const webhookUrl = whatsappApi.getWebhookUrl();
      await whatsappApi.createSession(newSessionId, webhookUrl);
      
      const qrData = await whatsappApi.getQRCode(newSessionId);
      setQrCode(qrData.qr);
      
      toast({
        title: 'Sucesso',
        description: 'Sessão criada! Escaneie o QR Code'
      });
      
      setNewSessionId('');
      loadSessions();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível criar a sessão',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await whatsappApi.deleteSession(sessionId);
      toast({
        title: 'Sucesso',
        description: 'Sessão deletada'
      });
      loadSessions();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível deletar a sessão',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Sessões WhatsApp</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="ID da sessão (ex: minha-sessao)"
              value={newSessionId}
              onChange={(e) => setNewSessionId(e.target.value)}
            />
            <Button onClick={handleCreateSession} disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Sessão
            </Button>
          </div>

          {qrCode && (
            <div className="flex flex-col items-center gap-4 p-4 border rounded-lg">
              <p className="text-sm font-medium">Escaneie o QR Code com seu WhatsApp:</p>
              <img src={qrCode} alt="QR Code" className="w-64 h-64" />
            </div>
          )}

          <div className="space-y-2">
            {sessions.map((session: any) => (
              <div key={session.sessionId} className="flex items-center justify-between p-3 border rounded-lg">
                <div>
                  <p className="font-medium">{session.sessionId}</p>
                  <p className="text-sm text-muted-foreground">
                    Status: {session.status || 'Desconhecido'}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteSession(session.sessionId)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
```

5. **Criar componente de Chat** (`src/components/ChatView.tsx`):

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { whatsappApi } from '@/services/whatsappApi';
import { Send } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/lib/supabase';

interface Message {
  id: string;
  phone_number: string;
  message_text: string;
  direction: 'sent' | 'received';
  timestamp: string;
  status: string;
}

export const ChatView = ({ sessionId }: { sessionId: string }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadMessages();
    
    const channel = supabase
      .channel('messages')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'messages',
        filter: `session_id=eq.${sessionId}`
      }, (payload) => {
        console.log('Nova mensagem:', payload);
        loadMessages();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const loadMessages = async () => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Erro ao carregar mensagens:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !phoneNumber.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha o número e a mensagem',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      await whatsappApi.sendMessage(sessionId, phoneNumber, newMessage);
      
      toast({
        title: 'Sucesso',
        description: 'Mensagem enviada!'
      });
      
      setNewMessage('');
      loadMessages();
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível enviar a mensagem',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader>
        <CardTitle>Chat - {sessionId}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-4">
        <Input
          placeholder="Número do destinatário (ex: 5511999999999)"
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
        />
        
        <div className="flex-1 overflow-y-auto space-y-2 border rounded-lg p-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.direction === 'sent' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[70%] rounded-lg p-3 ${
                  msg.direction === 'sent'
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-200 text-gray-900'
                }`}
              >
                <p className="text-sm">{msg.message_text}</p>
                <p className="text-xs opacity-70 mt-1">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Digite sua mensagem..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
          />
          <Button onClick={handleSendMessage} disabled={loading}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
```

6. **Criar Edge Function no Supabase** (`supabase/functions/whatsapp-webhook/index.ts`):

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
    console.log('Webhook recebido:', payload)

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

      await supabaseClient
        .from('conversations')
        .update({ 
          last_message: message.body,
          last_message_at: new Date(timestamp * 1000).toISOString(),
          status: 'respondeu'
        })
        .eq('phone_number', from)
        .eq('session_id', sessionId)
    }

    if (payload.event === 'message_ack') {
      const { messageId, ack } = payload.data
      const statusMap = {
        1: 'sent',
        2: 'delivered',
        3: 'read'
      }

      await supabaseClient
        .from('messages')
        .update({ status: statusMap[ack] || 'sent' })
        .eq('whatsapp_message_id', messageId)
    }

    if (payload.event === 'ready') {
      await supabaseClient
        .from('whatsapp_sessions')
        .update({ status: 'connected', connected_at: new Date().toISOString() })
        .eq('session_id', payload.data.sessionId)
    }

    if (payload.event === 'disconnected') {
      await supabaseClient
        .from('whatsapp_sessions')
        .update({ status: 'disconnected' })
        .eq('session_id', payload.data.sessionId)
    }

    return new Response(
      JSON.stringify({ success: true }),
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

### OPÇÃO 2: Verificar se o projeto já existe

Se o projeto já existe em outro local:

```bash
cd "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces"
dir /s /b package.json | findstr /v node_modules
```

Procure por:
- `sistemaflow` ou `flow` no nome das pastas
- Arquivos `.tsx` ou `.ts` relacionados ao WhatsApp
- Arquivo `vite.config.ts` ou `next.config.js`

## 🔍 DIAGNÓSTICO RÁPIDO

Execute este comando para verificar o que existe:

```powershell
Get-ChildItem -Path "C:\Users\55119\AppData\Roaming\AbacusAI\Agent Workspaces" -Recurse -Include "*.tsx","*.ts" | Where-Object { $_.FullName -notmatch "node_modules" } | Select-Object FullName
```

## ✅ PRÓXIMOS PASSOS

1. **Identifique onde está o projeto Lovable** (ou se precisa criar)
2. **Verifique se a API está rodando**: https://whatsapp-api-ugdv.onrender.com
3. **Configure as variáveis de ambiente** no Lovable
4. **Implemente os componentes** conforme os códigos acima
5. **Teste a integração** criando uma sessão e enviando mensagens

## 📞 SUPORTE

Se precisar de ajuda:
- API WhatsApp: https://whatsapp-api-ugdv.onrender.com
- Webhook Supabase: https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook
- Documentação completa: `INTEGRACAO_WHATSAPP_COMPLETA_LOVABLE.md`
