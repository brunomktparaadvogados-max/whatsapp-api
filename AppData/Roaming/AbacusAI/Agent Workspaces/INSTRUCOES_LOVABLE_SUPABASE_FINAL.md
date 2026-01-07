# 🎯 INSTRUÇÕES FINAIS - LOVABLE/FLOW + KOYEB + SUPABASE

## ✅ STATUS ATUAL

- **API Backend**: Rodando no Koyeb (https://seu-app.koyeb.app)
- **Banco de Dados**: PostgreSQL (Supabase) - **PERSISTENTE**
- **Deploy**: Automático via GitHub
- **Usuários**: Já criados no Flow/Lovable

---

## 📋 PASSO 1: ATUALIZAR VARIÁVEIS DE AMBIENTE NO LOVABLE

No Lovable, vá em **Settings → Environment Variables** e configure:

```env
VITE_API_URL=https://seu-app.koyeb.app
```

---

## 📋 PASSO 2: CRIAR USUÁRIOS NA API (VIA KOYEB)

**IMPORTANTE**: Agora você precisa criar os usuários **diretamente na API** do Koyeb.

### Como criar usuários:

Use o endpoint `POST /api/auth/register` com os seguintes dados:

```bash
curl -X POST https://seu-app.koyeb.app/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@exemplo.com",
    "password": "senha123",
    "name": "Nome do Usuário",
    "company": "Nome da Empresa"
  }'
```

**Resposta esperada:**
```json
{
  "message": "Usuário criado com sucesso",
  "userId": 1,
  "sessionId": "user_1"
}
```

### Crie os seguintes usuários:

1. **Usuário 1**:
   - Email: `usuario1@exemplo.com`
   - Password: `senha123`
   - Name: `Usuário 1`
   - Company: `Empresa 1`

2. **Usuário 2**:
   - Email: `usuario2@exemplo.com`
   - Password: `senha123`
   - Name: `Usuário 2`
   - Company: `Empresa 2`

3. **Usuário 3**:
   - Email: `usuario3@exemplo.com`
   - Password: `senha123`
   - Name: `Usuário 3`
   - Company: `Empresa 3`

---

## 📋 PASSO 3: FAZER LOGIN NO LOVABLE/FLOW

Agora faça login no Flow/Lovable com os usuários criados:

1. Acesse o Flow/Lovable
2. Faça login com `usuario1@exemplo.com` / `senha123`
3. O sistema irá:
   - Autenticar via API do Koyeb
   - Receber o `sessionId` (ex: `user_1`)
   - Conectar ao WebSocket
   - Exibir o QR Code do WhatsApp

---

## 📋 PASSO 4: CONECTAR WHATSAPP

1. Abra o WhatsApp no celular
2. Vá em **Configurações → Aparelhos conectados**
3. Escaneie o QR Code exibido no Flow/Lovable
4. Aguarde a mensagem: **"✅ WhatsApp conectado com sucesso!"**

**IMPORTANTE**: Agora os dados **NÃO SERÃO PERDIDOS** porque estão salvos no **Supabase (PostgreSQL)**.

---

## 📋 PASSO 5: VERIFICAR PERSISTÊNCIA

Para verificar se os dados estão sendo salvos:

1. Acesse o **Supabase Dashboard**: https://supabase.com/dashboard
2. Vá em **Table Editor**
3. Verifique as tabelas:
   - `users` → Usuários criados
   - `sessions` → Sessões do WhatsApp
   - `messages` → Mensagens enviadas/recebidas
   - `contacts` → Contatos salvos

---

## 🔧 CÓDIGO ATUALIZADO PARA O LOVABLE/FLOW

### 1. Atualizar `src/services/whatsappApi.ts`

```typescript
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor para adicionar token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const whatsappApi = {
  // Autenticação
  register: async (email: string, password: string, name: string, company?: string) => {
    const response = await api.post('/api/auth/register', { email, password, name, company });
    return response.data;
  },

  login: async (email: string, password: string) => {
    const response = await api.post('/api/auth/login', { email, password });
    return response.data;
  },

  // Sessões
  createSession: async (sessionId: string) => {
    const response = await api.post('/api/sessions', { sessionId });
    return response.data;
  },

  getSessionStatus: async (sessionId: string) => {
    const response = await api.get(`/api/sessions/${sessionId}/status`);
    return response.data;
  },

  disconnectSession: async (sessionId: string) => {
    const response = await api.delete(`/api/sessions/${sessionId}`);
    return response.data;
  },

  // Mensagens
  sendMessage: async (sessionId: string, to: string, message: string) => {
    const response = await api.post(`/api/sessions/${sessionId}/message`, { to, message });
    return response.data;
  },

  // Webhook
  setWebhook: async (sessionId: string, webhookUrl: string) => {
    const response = await api.put(`/api/sessions/${sessionId}/webhook`, { webhookUrl });
    return response.data;
  },

  getWebhook: async (sessionId: string) => {
    const response = await api.get(`/api/sessions/${sessionId}/webhook`);
    return response.data;
  },
};
```

---

### 2. Atualizar `src/components/WhatsAppConnection.tsx`

```typescript
import { useState, useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { whatsappApi } from '@/services/whatsappApi';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export function WhatsAppConnection() {
  const [qrCode, setQrCode] = useState<string>('');
  const [status, setStatus] = useState<string>('disconnected');
  const [socket, setSocket] = useState<Socket | null>(null);
  const { toast } = useToast();

  const sessionId = localStorage.getItem('sessionId') || 'user_1';

  useEffect(() => {
    const newSocket = io(API_URL);
    setSocket(newSocket);

    newSocket.on('connect', () => {
      console.log('✅ WebSocket conectado');
    });

    newSocket.on('qr', (data: { sessionId: string; qr: string }) => {
      if (data.sessionId === sessionId) {
        setQrCode(data.qr);
        setStatus('qr_ready');
        toast({ title: '📱 QR Code gerado', description: 'Escaneie com seu WhatsApp' });
      }
    });

    newSocket.on('ready', (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setStatus('connected');
        setQrCode('');
        toast({ title: '✅ WhatsApp conectado!', description: 'Pronto para enviar mensagens' });
      }
    });

    newSocket.on('disconnected', (data: { sessionId: string }) => {
      if (data.sessionId === sessionId) {
        setStatus('disconnected');
        setQrCode('');
        toast({ title: '❌ WhatsApp desconectado', variant: 'destructive' });
      }
    });

    return () => {
      newSocket.disconnect();
    };
  }, [sessionId]);

  const handleConnect = async () => {
    try {
      await whatsappApi.createSession(sessionId);
      toast({ title: '🔄 Conectando...', description: 'Aguarde o QR Code' });
    } catch (error) {
      toast({ title: '❌ Erro ao conectar', variant: 'destructive' });
    }
  };

  const handleDisconnect = async () => {
    try {
      await whatsappApi.disconnectSession(sessionId);
      setStatus('disconnected');
      setQrCode('');
      toast({ title: '✅ Desconectado com sucesso' });
    } catch (error) {
      toast({ title: '❌ Erro ao desconectar', variant: 'destructive' });
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Conexão WhatsApp</h2>
      
      {status === 'disconnected' && (
        <Button onClick={handleConnect}>Conectar WhatsApp</Button>
      )}

      {status === 'qr_ready' && qrCode && (
        <div className="flex flex-col items-center gap-4">
          <QRCodeSVG value={qrCode} size={256} />
          <p className="text-sm text-gray-600">Escaneie o QR Code com seu WhatsApp</p>
        </div>
      )}

      {status === 'connected' && (
        <div className="flex flex-col gap-4">
          <p className="text-green-600 font-semibold">✅ WhatsApp conectado!</p>
          <Button variant="destructive" onClick={handleDisconnect}>Desconectar</Button>
        </div>
      )}
    </Card>
  );
}
```

---

### 3. Atualizar `src/pages/Login.tsx`

```typescript
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { whatsappApi } from '@/services/whatsappApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await whatsappApi.login(email, password);
      localStorage.setItem('token', response.token);
      localStorage.setItem('sessionId', response.sessionId);
      toast({ title: '✅ Login realizado com sucesso!' });
      navigate('/dashboard');
    } catch (error) {
      toast({ title: '❌ Erro ao fazer login', variant: 'destructive' });
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen">
      <Card className="p-6 w-96">
        <h1 className="text-2xl font-bold mb-4">Login</h1>
        <form onSubmit={handleLogin} className="flex flex-col gap-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit">Entrar</Button>
        </form>
      </Card>
    </div>
  );
}
```

---

## 🎯 RESUMO FINAL

✅ **API rodando no Koyeb** com PostgreSQL (Supabase)  
✅ **Dados persistentes** (não serão mais perdidos)  
✅ **Deploy automático** via GitHub  
✅ **WebSocket funcionando** para QR Code em tempo real  
✅ **Autenticação JWT** implementada  
✅ **Multi-usuário** com sessões isoladas  

---

## 🚀 PRÓXIMOS PASSOS

1. **Criar usuários na API** (via `POST /api/auth/register`)
2. **Fazer login no Flow/Lovable**
3. **Conectar WhatsApp** (escanear QR Code)
4. **Verificar dados no Supabase**
5. **Testar envio de mensagens**

---

## 📞 SUPORTE

Se tiver problemas:
1. Verifique os logs no Koyeb
2. Verifique as tabelas no Supabase
3. Verifique o console do navegador (F12)
4. Verifique se o `VITE_API_URL` está correto no Lovable
