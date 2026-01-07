# 🚀 INTEGRAÇÃO LOVABLE + API KOYEB (SEM N8N)

## 📋 RESUMO

Você quer integrar o **Lovable** com a **API WhatsApp hospedada no Koyeb** (`https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/`).

**Situação Atual:**
- ✅ API funcionando no navegador
- ✅ API hospedada no Koyeb (HTTPS)
- ❌ Não está integrada com Lovable
- ❌ Anteriormente usava w-api + n8n (webhook intermediário)

**Solução:**
A API já tem **endpoints REST completos** e **suporte a webhooks**. Você **NÃO precisa do n8n** para integrar com Lovable.

---

## 🎯 ARQUITETURA DIRETA (SEM N8N)

```
┌─────────────────────┐
│   Lovable (HTTPS)   │
│  Sistema Flow       │
└──────────┬──────────┘
           │ REST API (JWT)
           ▼
┌─────────────────────┐
│   API Koyeb (HTTPS) │
│  racial-debby...    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│   WhatsApp Web.js   │
└─────────────────────┘
```

**Comunicação:**
1. **Lovable → API:** Requisições HTTP REST com JWT
2. **API → Lovable:** Webhooks (opcional, para mensagens recebidas)

---

## 🔐 ENDPOINTS DA API KOYEB

### Base URL
```
https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app
```

### 1. Autenticação

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "usuario@exemplo.com",
  "password": "senha123"
}
```

**Resposta:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "usuario@exemplo.com",
    "name": "Nome"
  },
  "sessionId": "user_1",
  "sessionStatus": "not_created"
}
```

### 2. Criar Sessão WhatsApp

```http
POST /api/sessions
Authorization: Bearer {token}
```

### 3. Obter QR Code

```http
GET /api/sessions/{sessionId}/qr
Authorization: Bearer {token}
```

**Resposta:**
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANS..."
}
```

### 4. Enviar Mensagem

```http
POST /api/messages/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "to": "5511999999999",
  "message": "Olá!"
}
```

### 5. Configurar Webhook (NOVO)

```http
PUT /api/sessions/{sessionId}/webhook
Authorization: Bearer {token}
Content-Type: application/json

{
  "webhookUrl": "https://seu-lovable.app/api/webhook/whatsapp"
}
```

---

## 🔧 IMPLEMENTAÇÃO NO LOVABLE

### Passo 1: Criar Serviço de API

Crie o arquivo `src/services/whatsappApi.ts`:

```typescript
const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
  };
  sessionId: string;
  sessionStatus: string;
}

interface SessionResponse {
  success: boolean;
  session: {
    sessionId: string;
    status: string;
    qrCode: string | null;
    info: any;
  };
}

class WhatsAppAPI {
  private token: string | null = null;
  private sessionId: string | null = null;

  constructor() {
    this.token = localStorage.getItem('whatsapp_token');
    this.sessionId = localStorage.getItem('whatsapp_session_id');
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      throw new Error('Falha no login');
    }

    const data: LoginResponse = await response.json();
    
    this.token = data.token;
    this.sessionId = data.sessionId;
    
    localStorage.setItem('whatsapp_token', data.token);
    localStorage.setItem('whatsapp_session_id', data.sessionId);
    
    return data;
  }

  async getSessionStatus(): Promise<SessionResponse> {
    if (!this.token) throw new Error('Não autenticado');

    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Falha ao obter status');
    }

    return await response.json();
  }

  async createSession(): Promise<void> {
    if (!this.token) throw new Error('Não autenticado');

    const response = await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Falha ao criar sessão');
    }
  }

  async getQRCode(): Promise<string | null> {
    if (!this.token || !this.sessionId) throw new Error('Não autenticado');

    const response = await fetch(`${API_URL}/api/sessions/${this.sessionId}/qr`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.qrCode;
  }

  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.token) throw new Error('Não autenticado');

    const response = await fetch(`${API_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, message }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha ao enviar mensagem');
    }
  }

  async setWebhook(webhookUrl: string): Promise<void> {
    if (!this.token || !this.sessionId) throw new Error('Não autenticado');

    const response = await fetch(`${API_URL}/api/sessions/${this.sessionId}/webhook`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ webhookUrl }),
    });

    if (!response.ok) {
      throw new Error('Falha ao configurar webhook');
    }
  }

  logout(): void {
    this.token = null;
    this.sessionId = null;
    localStorage.removeItem('whatsapp_token');
    localStorage.removeItem('whatsapp_session_id');
  }

  isAuthenticated(): boolean {
    return !!this.token;
  }
}

export const whatsappApi = new WhatsAppAPI();
```

### Passo 2: Criar Componente de Conexão

Crie o arquivo `src/components/WhatsAppConnection.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { whatsappApi } from '@/services/whatsappApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function WhatsAppConnection() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessionStatus, setSessionStatus] = useState('not_created');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    setIsAuthenticated(whatsappApi.isAuthenticated());
    if (whatsappApi.isAuthenticated()) {
      checkSessionStatus();
    }
  }, []);

  const checkSessionStatus = async () => {
    try {
      const response = await whatsappApi.getSessionStatus();
      setSessionStatus(response.session.status);
      
      if (response.session.status === 'qr_code') {
        const qr = await whatsappApi.getQRCode();
        setQrCode(qr);
      }
    } catch (error) {
      console.error('Erro ao verificar status:', error);
    }
  };

  const handleLogin = async () => {
    setIsLoading(true);
    try {
      await whatsappApi.login(email, password);
      setIsAuthenticated(true);
      toast({
        title: 'Login realizado',
        description: 'Conectado com sucesso!',
      });
      await checkSessionStatus();
    } catch (error) {
      toast({
        title: 'Erro no login',
        description: 'Verifique suas credenciais',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateSession = async () => {
    setIsLoading(true);
    try {
      await whatsappApi.createSession();
      toast({
        title: 'Sessão criada',
        description: 'Aguarde o QR Code...',
      });
      
      const interval = setInterval(async () => {
        const response = await whatsappApi.getSessionStatus();
        setSessionStatus(response.session.status);
        
        if (response.session.status === 'qr_code') {
          const qr = await whatsappApi.getQRCode();
          setQrCode(qr);
        }
        
        if (response.session.status === 'connected') {
          clearInterval(interval);
          setQrCode(null);
          toast({
            title: 'WhatsApp conectado!',
            description: 'Você já pode enviar mensagens',
          });
        }
      }, 2000);
      
      setTimeout(() => clearInterval(interval), 60000);
    } catch (error) {
      toast({
        title: 'Erro ao criar sessão',
        description: 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <Card className="p-6 max-w-md mx-auto">
        <h2 className="text-2xl font-bold mb-4">Login WhatsApp API</h2>
        <div className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button 
            onClick={handleLogin} 
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? 'Entrando...' : 'Entrar'}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">WhatsApp Status</h2>
      
      <div className="space-y-4">
        <div className="p-4 bg-gray-100 rounded">
          <p className="font-semibold">Status:</p>
          <p className="text-lg">{sessionStatus}</p>
        </div>

        {sessionStatus === 'not_created' && (
          <Button 
            onClick={handleCreateSession}
            disabled={isLoading}
            className="w-full"
          >
            Conectar WhatsApp
          </Button>
        )}

        {qrCode && (
          <div className="text-center">
            <p className="mb-2">Escaneie o QR Code:</p>
            <img src={qrCode} alt="QR Code" className="mx-auto" />
          </div>
        )}

        {sessionStatus === 'connected' && (
          <div className="p-4 bg-green-100 rounded text-green-800">
            ✅ WhatsApp conectado e pronto!
          </div>
        )}
      </div>
    </Card>
  );
}
```

### Passo 3: Criar Componente de Envio

Crie o arquivo `src/components/SendMessage.tsx`:

```typescript
import { useState } from 'react';
import { whatsappApi } from '@/services/whatsappApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function SendMessage() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!phone || !message) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Preencha telefone e mensagem',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      await whatsappApi.sendMessage(phone, message);
      toast({
        title: 'Mensagem enviada!',
        description: `Enviado para ${phone}`,
      });
      setMessage('');
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="p-6 max-w-md mx-auto">
      <h2 className="text-2xl font-bold mb-4">Enviar Mensagem</h2>
      
      <div className="space-y-4">
        <Input
          type="tel"
          placeholder="5511999999999"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
        
        <Textarea
          placeholder="Digite sua mensagem..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
        />
        
        <Button 
          onClick={handleSend}
          disabled={isLoading}
          className="w-full"
        >
          {isLoading ? 'Enviando...' : 'Enviar Mensagem'}
        </Button>
      </div>
    </Card>
  );
}
```

---

## 🔔 CONFIGURAR WEBHOOK (OPCIONAL)

Se você quiser receber mensagens no Lovable:

### 1. Criar Endpoint no Lovable

Crie uma função Supabase Edge Function ou endpoint no seu backend:

```typescript
// Supabase Edge Function: functions/whatsapp-webhook/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req) => {
  if (req.method === 'POST') {
    const payload = await req.json()
    
    console.log('Mensagem recebida:', payload)
    
    // Processar mensagem
    // Salvar no banco, notificar usuário, etc.
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  }
  
  return new Response('Method not allowed', { status: 405 })
})
```

### 2. Configurar Webhook na API

```typescript
// No seu componente Lovable
await whatsappApi.setWebhook('https://seu-projeto.supabase.co/functions/v1/whatsapp-webhook');
```

---

## 📝 PROMPT PARA O LOVABLE

Cole este prompt no chat do Lovable:

```
Preciso integrar a API WhatsApp hospedada no Koyeb com este projeto.

API Base URL: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app

Crie:
1. Serviço de API (src/services/whatsappApi.ts) com métodos:
   - login(email, password)
   - getSessionStatus()
   - createSession()
   - getQRCode()
   - sendMessage(to, message)
   - setWebhook(webhookUrl)

2. Componente WhatsAppConnection (src/components/WhatsAppConnection.tsx):
   - Formulário de login
   - Exibição de QR Code
   - Status da conexão

3. Componente SendMessage (src/components/SendMessage.tsx):
   - Campo de telefone
   - Campo de mensagem
   - Botão de envio

Use shadcn/ui para os componentes (Button, Input, Card, Textarea).
Adicione tratamento de erros com toast notifications.
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Criar serviço `whatsappApi.ts`
- [ ] Criar componente `WhatsAppConnection.tsx`
- [ ] Criar componente `SendMessage.tsx`
- [ ] Testar login
- [ ] Testar criação de sessão
- [ ] Testar QR Code
- [ ] Testar envio de mensagem
- [ ] (Opcional) Configurar webhook para receber mensagens

---

## 🚨 IMPORTANTE

**Você NÃO precisa do n8n!**

A API Koyeb já tem:
- ✅ Endpoints REST completos
- ✅ Autenticação JWT
- ✅ Suporte a webhooks
- ✅ HTTPS (compatível com Lovable)

**Comunicação direta:**
```
Lovable → API Koyeb → WhatsApp
```

---

## 🔗 DOCUMENTAÇÃO COMPLETA

- **API Endpoints:** `whatsapp-api/INTEGRACAO_FLOW.md`
- **Resumo Completo:** `whatsapp-api/RESUMO_COMPLETO.md`
- **Webhook (se necessário):** `ADICIONAR_WEBHOOK_API.md`

---

**Última atualização:** Integração direta Lovable + Koyeb (sem n8n)
