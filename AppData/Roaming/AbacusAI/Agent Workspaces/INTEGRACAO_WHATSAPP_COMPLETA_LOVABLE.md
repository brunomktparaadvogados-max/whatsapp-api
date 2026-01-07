# 🚀 INTEGRAÇÃO WHATSAPP COMPLETA - LOVABLE + META BUSINESS API

## 📋 ÍNDICE
1. [Configuração Inicial](#configuração-inicial)
2. [Recebimento de Mensagens (Webhook)](#recebimento-de-mensagens)
3. [Integração Meta Business API Oficial](#meta-business-api)
4. [Atualização via Git](#atualização-git)
5. [Componentes React](#componentes-react)

---

## 🔧 CONFIGURAÇÃO INICIAL

### Variáveis de Ambiente no Lovable

```env
VITE_WHATSAPP_API_URL=https://whatsapp-api-ugdv.onrender.com
VITE_SUPABASE_URL=https://qzxywaajfmnkycrpzwmr.supabase.co
VITE_SUPABASE_ANON_KEY=seu_anon_key_aqui
VITE_META_API_VERSION=v21.0
```

---

## 📨 RECEBIMENTO DE MENSAGENS (WEBHOOK)

### 1. Configurar Webhook no Supabase

**Edge Function: `supabase/functions/whatsapp-webhook/index.ts`**

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
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
```

### 2. Deploy da Edge Function

```bash
supabase functions deploy whatsapp-webhook
```

### 3. Configurar Webhook na API

```typescript
const webhookUrl = 'https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook'

await fetch(`${API_URL}/api/sessions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    sessionId: 'minha-sessao',
    webhookUrl: webhookUrl
  })
})
```

---

## 🔵 META BUSINESS API - INTEGRAÇÃO OFICIAL

### PASSO 1: Criar App no Meta for Developers

1. Acesse: https://developers.facebook.com/apps
2. Clique em **"Criar App"**
3. Selecione **"Empresa"** como tipo
4. Preencha:
   - **Nome do App:** Flow WhatsApp Integration
   - **Email de contato:** seu@email.com
5. Clique em **"Criar App"**

### PASSO 2: Adicionar Produto WhatsApp Business

1. No painel do app, procure **"WhatsApp"**
2. Clique em **"Configurar"**
3. Selecione ou crie uma **Conta Comercial do WhatsApp**

### PASSO 3: Obter Credenciais

#### 3.1 Token de Acesso Temporário (Teste)
1. Vá em **WhatsApp > Primeiros Passos**
2. Copie o **Token de Acesso Temporário** (válido por 24h)
3. Anote o **ID do Número de Telefone**
4. Anote o **ID da Conta Comercial do WhatsApp**

#### 3.2 Token de Acesso Permanente (Produção)
1. Vá em **Configurações > Básico**
2. Copie o **ID do App** e **Chave Secreta do App**
3. Vá em **WhatsApp > Configuração da API**
4. Clique em **"Gerar Token de Acesso do Sistema"**
5. Selecione as permissões:
   - `whatsapp_business_messaging`
   - `whatsapp_business_management`
6. Copie o token gerado (guarde em local seguro!)

### PASSO 4: Configurar Webhook no Meta

1. Vá em **WhatsApp > Configuração**
2. Clique em **"Configurar Webhooks"**
3. Preencha:
   - **URL de Retorno de Chamada:**
     ```
     https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/meta-webhook
     ```
   - **Token de Verificação:** (crie um token aleatório, ex: `meu_token_secreto_123`)
4. Clique em **"Verificar e Salvar"**
5. Inscreva-se nos campos:
   - `messages`
   - `message_status`

### PASSO 5: Adicionar Número de Teste

1. Vá em **WhatsApp > Primeiros Passos**
2. Em **"Números de telefone de teste"**, clique em **"Adicionar número"**
3. Digite seu número com DDI (ex: +5511999999999)
4. Você receberá um código via WhatsApp
5. Digite o código para verificar

---

## 🎨 COMPONENTES REACT PARA LOVABLE

### 1. Hook para Meta Business API

**Arquivo: `src/hooks/useMetaBusinessAPI.ts`**

```typescript
import { useState } from 'react'

const META_API_VERSION = import.meta.env.VITE_META_API_VERSION || 'v21.0'

interface MetaConfig {
  accessToken: string
  phoneNumberId: string
  businessAccountId: string
}

export const useMetaBusinessAPI = () => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sendMessage = async (config: MetaConfig, to: string, message: string) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: { body: message }
          })
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Erro ao enviar')
      return data
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const sendTemplate = async (
    config: MetaConfig, 
    to: string, 
    templateName: string, 
    languageCode: string = 'pt_BR'
  ) => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: to,
            type: 'template',
            template: {
              name: templateName,
              language: { code: languageCode }
            }
          })
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Erro ao enviar template')
      return data
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const sendMedia = async (
    config: MetaConfig,
    to: string,
    mediaType: 'image' | 'video' | 'document' | 'audio',
    mediaUrl: string,
    caption?: string
  ) => {
    setLoading(true)
    setError(null)
    try {
      const body: any = {
        messaging_product: 'whatsapp',
        to: to,
        type: mediaType,
        [mediaType]: {
          link: mediaUrl
        }
      }
      if (caption && (mediaType === 'image' || mediaType === 'video' || mediaType === 'document')) {
        body[mediaType].caption = caption
      }

      const response = await fetch(
        `https://graph.facebook.com/${META_API_VERSION}/${config.phoneNumberId}/messages`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body)
        }
      )
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || 'Erro ao enviar mídia')
      return data
    } catch (err: any) {
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, sendMessage, sendTemplate, sendMedia }
}
```

### 2. Componente de Configuração Meta API

**Arquivo: `src/components/MetaAPIConfig.tsx`**

```typescript
import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { ExternalLink, Save, CheckCircle2 } from 'lucide-react'

export const MetaAPIConfig = () => {
  const [config, setConfig] = useState({
    accessToken: '',
    phoneNumberId: '',
    businessAccountId: '',
    webhookToken: ''
  })
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const savedConfig = localStorage.getItem('meta_api_config')
    if (savedConfig) {
      setConfig(JSON.parse(savedConfig))
    }
  }, [])

  const handleSave = () => {
    localStorage.setItem('meta_api_config', JSON.stringify(config))
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configuração Meta Business API</CardTitle>
          <CardDescription>
            Configure sua integração oficial com WhatsApp Business API
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert>
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-semibold">📋 Passo a Passo:</p>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Acesse <a href="https://developers.facebook.com/apps" target="_blank" className="text-blue-600 hover:underline inline-flex items-center gap-1">Meta for Developers <ExternalLink className="w-3 h-3" /></a></li>
                  <li>Crie um novo App do tipo "Empresa"</li>
                  <li>Adicione o produto "WhatsApp"</li>
                  <li>Copie as credenciais abaixo</li>
                </ol>
              </div>
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="accessToken">
                Token de Acesso (Access Token)
                <a 
                  href="https://developers.facebook.com/docs/whatsapp/business-management-api/get-started#access-tokens" 
                  target="_blank"
                  className="ml-2 text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Como obter? <ExternalLink className="w-3 h-3" />
                </a>
              </Label>
              <Input
                id="accessToken"
                type="password"
                placeholder="EAAxxxxxxxxxx..."
                value={config.accessToken}
                onChange={(e) => setConfig({ ...config, accessToken: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                WhatsApp &gt; Primeiros Passos &gt; Token de Acesso Temporário
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="phoneNumberId">
                ID do Número de Telefone (Phone Number ID)
              </Label>
              <Input
                id="phoneNumberId"
                placeholder="123456789012345"
                value={config.phoneNumberId}
                onChange={(e) => setConfig({ ...config, phoneNumberId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                WhatsApp &gt; Primeiros Passos &gt; ID do Número de Telefone
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessAccountId">
                ID da Conta Comercial (Business Account ID)
              </Label>
              <Input
                id="businessAccountId"
                placeholder="123456789012345"
                value={config.businessAccountId}
                onChange={(e) => setConfig({ ...config, businessAccountId: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                WhatsApp &gt; Configuração da API &gt; ID da Conta Comercial do WhatsApp
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookToken">
                Token de Verificação do Webhook
              </Label>
              <Input
                id="webhookToken"
                placeholder="meu_token_secreto_123"
                value={config.webhookToken}
                onChange={(e) => setConfig({ ...config, webhookToken: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                Crie um token aleatório para verificar o webhook
              </p>
            </div>

            <Alert>
              <AlertDescription>
                <p className="font-semibold mb-2">🔗 URL do Webhook:</p>
                <code className="block bg-muted p-2 rounded text-xs break-all">
                  https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/meta-webhook
                </code>
                <p className="text-xs mt-2">
                  Configure esta URL em: WhatsApp &gt; Configuração &gt; Webhooks
                </p>
              </AlertDescription>
            </Alert>

            <Button onClick={handleSave} className="w-full">
              {saved ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Configuração Salva!
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Salvar Configuração
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

### 3. Componente de Chat Bidirecional

**Arquivo: `src/components/BidirectionalChat.tsx`**

```typescript
import { useState, useEffect, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Phone } from 'lucide-react'
import { useMetaBusinessAPI } from '@/hooks/useMetaBusinessAPI'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

interface Message {
  id: string
  message_text: string
  direction: 'sent' | 'received'
  timestamp: string
  status?: string
}

export const BidirectionalChat = ({ phoneNumber }: { phoneNumber: string }) => {
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const { sendMessage, loading } = useMetaBusinessAPI()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
    
    const channel = supabase
      .channel('messages')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'messages',
          filter: `phone_number=eq.${phoneNumber}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setMessages(prev => [...prev, payload.new as Message])
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [phoneNumber])

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('phone_number', phoneNumber)
      .order('timestamp', { ascending: true })
    
    if (data) setMessages(data)
  }

  const handleSend = async () => {
    if (!newMessage.trim()) return

    const config = JSON.parse(localStorage.getItem('meta_api_config') || '{}')
    
    try {
      await sendMessage(config, phoneNumber, newMessage)
      
      await supabase.from('messages').insert({
        phone_number: phoneNumber,
        message_text: newMessage,
        direction: 'sent',
        timestamp: new Date().toISOString(),
        status: 'sent'
      })

      setNewMessage('')
    } catch (error) {
      console.error('Erro ao enviar:', error)
    }
  }

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Phone className="w-5 h-5" />
          {phoneNumber}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0">
        <ScrollArea className="flex-1 p-4">
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.direction === 'sent' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[70%] rounded-lg p-3 ${
                    msg.direction === 'sent'
                      ? 'bg-green-500 text-white'
                      : 'bg-gray-200 text-gray-900'
                  }`}
                >
                  <p className="text-sm">{msg.message_text}</p>
                  <p className="text-xs opacity-70 mt-1">
                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                    {msg.direction === 'sent' && msg.status && ` • ${msg.status}`}
                  </p>
                </div>
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>
        
        <div className="p-4 border-t flex gap-2">
          <Input
            placeholder="Digite sua mensagem..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
          />
          <Button onClick={handleSend} disabled={loading || !newMessage.trim()}>
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

---

## 🔄 ATUALIZAÇÃO VIA GIT

### Comandos para Atualizar o Projeto Lovable

```bash
# 1. Clone o repositório (primeira vez)
git clone https://github.com/brunomktparaadvogados-max.git
cd brunomktparaadvogados-max

# 2. Criar branch para novas features
git checkout -b feature/whatsapp-integration

# 3. Adicionar arquivos novos
git add .

# 4. Commit das mudanças
git commit -m "feat: adiciona integração completa WhatsApp com Meta Business API"

# 5. Push para o repositório
git push origin feature/whatsapp-integration

# 6. Criar Pull Request no GitHub
# Acesse: https://github.com/brunomktparaadvogados-max/pulls
# Clique em "New Pull Request"
# Selecione: base: main <- compare: feature/whatsapp-integration
# Clique em "Create Pull Request"

# 7. Após aprovação, fazer merge
git checkout main
git pull origin main
git merge feature/whatsapp-integration
git push origin main
```

### Atualizar Lovable com Mudanças do Git

**No chat do Lovable, cole:**

```
Atualize o projeto com as mudanças do repositório Git:
https://github.com/brunomktparaadvogados-max

Principais mudanças:
1. Hook useMetaBusinessAPI para integração oficial Meta
2. Componente MetaAPIConfig para configurar credenciais
3. Componente BidirectionalChat para chat bidirecional
4. Edge Function meta-webhook para receber mensagens
5. Suporte completo a envio/recebimento de mensagens

Arquivos para importar:
- src/hooks/useMetaBusinessAPI.ts
- src/components/MetaAPIConfig.tsx
- src/components/BidirectionalChat.tsx
- supabase/functions/meta-webhook/index.ts

Adicione rota /whatsapp/meta-config para configuração da Meta API.
```

---

## 📊 ESTRUTURA DO BANCO DE DADOS

### Tabela: messages

```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT,
  phone_number TEXT NOT NULL,
  message_text TEXT,
  message_type TEXT DEFAULT 'text',
  direction TEXT CHECK (direction IN ('sent', 'received')),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  whatsapp_message_id TEXT,
  status TEXT DEFAULT 'pending',
  media_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_messages_phone ON messages(phone_number);
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp DESC);
```

### Tabela: whatsapp_sessions

```sql
CREATE TABLE whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'disconnected',
  webhook_url TEXT,
  connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Tabela: meta_api_config

```sql
CREATE TABLE meta_api_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id),
  access_token TEXT NOT NULL,
  phone_number_id TEXT NOT NULL,
  business_account_id TEXT NOT NULL,
  webhook_token TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🎯 PROMPT COMPLETO PARA LOVABLE

Cole este prompt no chat do Lovable:

```
Crie uma integração completa de WhatsApp com:

1. RECEBIMENTO DE MENSAGENS:
   - Edge Function webhook em supabase/functions/whatsapp-webhook
   - Salvar mensagens recebidas no banco
   - Atualizar status de conversas automaticamente
   - Realtime para atualização instantânea

2. META BUSINESS API OFICIAL:
   - Hook useMetaBusinessAPI com métodos:
     * sendMessage(config, to, message)
     * sendTemplate(config, to, templateName)
     * sendMedia(config, to, type, url, caption)
   - Componente MetaAPIConfig com campos:
     * Access Token
     * Phone Number ID
     * Business Account ID
     * Webhook Token
   - Instruções passo a passo para obter credenciais
   - Links diretos para Meta for Developers

3. CHAT BIDIRECIONAL:
   - Componente BidirectionalChat
   - Exibir mensagens enviadas e recebidas
   - Scroll automático
   - Indicadores de status (enviado, entregue, lido)
   - Atualização em tempo real via Supabase Realtime

4. ESTRUTURA:
   - src/hooks/useMetaBusinessAPI.ts
   - src/components/MetaAPIConfig.tsx
   - src/components/BidirectionalChat.tsx
   - supabase/functions/whatsapp-webhook/index.ts
   - supabase/functions/meta-webhook/index.ts

5. ROTAS:
   - /whatsapp/meta-config - Configuração Meta API
   - /whatsapp/chat/:phone - Chat bidirecional
   - /whatsapp/sessions - Gerenciar sessões

Use Shadcn UI, React Query para cache, e TypeScript.
API URL: https://whatsapp-api-ugdv.onrender.com
Supabase URL: https://qzxywaajfmnkycrpzwmr.supabase.co
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Configurar variáveis de ambiente no Lovable
- [ ] Criar Edge Function whatsapp-webhook
- [ ] Criar Edge Function meta-webhook
- [ ] Deploy das Edge Functions no Supabase
- [ ] Criar tabelas no banco de dados
- [ ] Implementar hook useMetaBusinessAPI
- [ ] Criar componente MetaAPIConfig
- [ ] Criar componente BidirectionalChat
- [ ] Configurar app no Meta for Developers
- [ ] Obter credenciais da Meta API
- [ ] Configurar webhook no Meta
- [ ] Testar envio de mensagens
- [ ] Testar recebimento de mensagens
- [ ] Configurar UptimeRobot para manter API ativa
- [ ] Atualizar repositório Git
- [ ] Documentar processo

---

## 🆘 TROUBLESHOOTING

### Erro 401 - Unauthorized
- Verifique se o Access Token está correto
- Token temporário expira em 24h, gere um novo
- Para produção, use Token de Sistema

### Webhook não recebe mensagens
- Verifique se a URL está correta no Meta
- Confirme que o Token de Verificação está correto
- Veja logs da Edge Function: `supabase functions logs meta-webhook`

### Mensagens não aparecem no chat
- Verifique se Realtime está habilitado no Supabase
- Confirme que a tabela messages tem RLS configurado
- Veja console do navegador para erros

---

## 📚 RECURSOS ÚTEIS

- [Meta WhatsApp Business API Docs](https://developers.facebook.com/docs/whatsapp/business-management-api)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [Lovable Documentation](https://docs.lovable.dev)

---

**🎉 Integração Completa Pronta!**
