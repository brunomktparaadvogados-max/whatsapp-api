# 📱 PROMPT COMPLETO PARA INTEGRAÇÃO LOVABLE + WHATSAPP API

## 🎯 CONTEXTO DO PROJETO

Você está desenvolvendo uma aplicação web no Lovable que precisa se integrar com uma API WhatsApp hospedada no Render. A API já está configurada e funcionando corretamente.

---

## 🔗 INFORMAÇÕES DA API

**URL Base da API:** `https://whatsapp-api-ugdv.onrender.com`

**Autenticação:** Bearer Token JWT

**Credenciais de Login:**
- Email: `admin@flow.com`
- Senha: `admin123`

**Sessão Padrão:** `WhatsApp` (criada automaticamente ao iniciar o servidor)

---

## 📋 ENDPOINTS PRINCIPAIS

### 1. Autenticação

```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@flow.com",
  "password": "admin123"
}

Resposta:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "admin@flow.com",
    "name": "Admin"
  }
}
```

### 2. Listar Sessões

```bash
GET /api/sessions
Authorization: Bearer {token}

Resposta:
[
  {
    "id": "WhatsApp",
    "status": "connected",
    "info": {
      "wid": "5511999999999@c.us",
      "pushname": "Nome do Usuário",
      "platform": "android"
    }
  }
]
```

### 3. Obter QR Code de uma Sessão

```bash
GET /api/sessions/WhatsApp/qr
Authorization: Bearer {token}

Resposta:
{
  "success": true,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "status": "qr_code"
}
```

### 4. Criar Nova Sessão

```bash
POST /api/sessions
Authorization: Bearer {token}
Content-Type: application/json

{
  "sessionId": "MinhaNovaSession"
}

Resposta:
{
  "success": true,
  "sessionId": "MinhaNovaSession",
  "message": "Sessão criada com sucesso"
}
```

### 5. Deletar Sessão

```bash
DELETE /api/sessions/WhatsApp
Authorization: Bearer {token}

Resposta:
{
  "success": true,
  "message": "Sessão deletada com sucesso"
}
```

### 6. Enviar Mensagem

```bash
POST /api/sessions/WhatsApp/message
Authorization: Bearer {token}
Content-Type: application/json

{
  "to": "5511999999999",
  "message": "Olá! Esta é uma mensagem de teste."
}

Resposta:
{
  "success": true,
  "messageId": "3EB0XXXXXXXXXXXXX",
  "timestamp": 1234567890
}
```

### 7. Enviar Mídia

```bash
POST /api/sessions/WhatsApp/media
Authorization: Bearer {token}
Content-Type: application/json

{
  "to": "5511999999999",
  "mediaUrl": "https://exemplo.com/imagem.jpg",
  "caption": "Legenda da imagem"
}

Resposta:
{
  "success": true,
  "messageId": "3EB0XXXXXXXXXXXXX",
  "timestamp": 1234567890
}
```

### 8. Listar Conversas

```bash
GET /api/sessions/WhatsApp/chats
Authorization: Bearer {token}

Resposta:
[
  {
    "id": "5511999999999@c.us",
    "name": "Nome do Contato",
    "isGroup": false,
    "unreadCount": 3,
    "timestamp": 1234567890
  }
]
```

### 9. Listar Contatos

```bash
GET /api/sessions/WhatsApp/contacts
Authorization: Bearer {token}

Resposta:
[
  {
    "id": "5511999999999@c.us",
    "name": "Nome do Contato",
    "pushname": "Nome no WhatsApp",
    "number": "5511999999999",
    "isMyContact": true,
    "isBlocked": false
  }
]
```

---

## 🚀 IMPLEMENTAÇÃO NO LOVABLE

### Passo 1: Criar Serviço de API

Crie um arquivo `src/services/whatsappApi.ts`:

```typescript
const API_BASE_URL = 'https://whatsapp-api-ugdv.onrender.com';
const DEFAULT_SESSION = 'WhatsApp';

interface LoginResponse {
  success: boolean;
  token: string;
  user: {
    id: number;
    email: string;
    name: string;
  };
}

interface Session {
  id: string;
  status: string;
  info?: {
    wid: string;
    pushname: string;
    platform: string;
  };
}

interface QRCodeResponse {
  success: boolean;
  qrCode: string;
  status: string;
}

interface MessageResponse {
  success: boolean;
  messageId: string;
  timestamp: number;
}

class WhatsAppAPI {
  private token: string | null = null;

  async login(email: string, password: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
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
    localStorage.setItem('whatsapp_token', data.token);
    return data;
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('whatsapp_token');
    }
    return this.token;
  }

  async getSessions(): Promise<Session[]> {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Falha ao buscar sessões');
    }

    return response.json();
  }

  async getQRCode(sessionId: string = DEFAULT_SESSION): Promise<QRCodeResponse> {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/qr`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Falha ao buscar QR Code');
    }

    return response.json();
  }

  async createSession(sessionId: string): Promise<{ success: boolean; sessionId: string; message: string }> {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      throw new Error('Falha ao criar sessão');
    }

    return response.json();
  }

  async deleteSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Falha ao deletar sessão');
    }

    return response.json();
  }

  async sendMessage(to: string, message: string, sessionId: string = DEFAULT_SESSION): Promise<MessageResponse> {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/message`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, message }),
    });

    if (!response.ok) {
      throw new Error('Falha ao enviar mensagem');
    }

    return response.json();
  }

  async sendMedia(to: string, mediaUrl: string, caption: string = '', sessionId: string = DEFAULT_SESSION): Promise<MessageResponse> {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, mediaUrl, caption }),
    });

    if (!response.ok) {
      throw new Error('Falha ao enviar mídia');
    }

    return response.json();
  }

  async getChats(sessionId: string = DEFAULT_SESSION) {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/chats`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Falha ao buscar conversas');
    }

    return response.json();
  }

  async getContacts(sessionId: string = DEFAULT_SESSION) {
    const token = this.getToken();
    if (!token) throw new Error('Token não encontrado');

    const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/contacts`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Falha ao buscar contatos');
    }

    return response.json();
  }
}

export const whatsappApi = new WhatsAppAPI();
```

---

### Passo 2: Criar Hook React para Gerenciar Estado

Crie um arquivo `src/hooks/useWhatsApp.ts`:

```typescript
import { useState, useEffect } from 'react';
import { whatsappApi } from '@/services/whatsappApi';

export function useWhatsApp() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = whatsappApi.getToken();
    if (token) {
      setIsAuthenticated(true);
      loadSessions();
    }
  }, []);

  const login = async (email: string, password: string) => {
    try {
      setLoading(true);
      setError(null);
      await whatsappApi.login(email, password);
      setIsAuthenticated(true);
      await loadSessions();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const loadSessions = async () => {
    try {
      setLoading(true);
      const data = await whatsappApi.getSessions();
      setSessions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar sessões');
    } finally {
      setLoading(false);
    }
  };

  const loadQRCode = async (sessionId: string = 'WhatsApp') => {
    try {
      setLoading(true);
      setError(null);
      const data = await whatsappApi.getQRCode(sessionId);
      setQrCode(data.qrCode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar QR Code');
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (to: string, message: string, sessionId: string = 'WhatsApp') => {
    try {
      setLoading(true);
      setError(null);
      const result = await whatsappApi.sendMessage(to, message, sessionId);
      return result;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar mensagem');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    isAuthenticated,
    sessions,
    qrCode,
    loading,
    error,
    login,
    loadSessions,
    loadQRCode,
    sendMessage,
  };
}
```

---

### Passo 3: Criar Componente de QR Code

Crie um arquivo `src/components/WhatsAppQRCode.tsx`:

```typescript
import { useEffect, useState } from 'react';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

export function WhatsAppQRCode() {
  const { qrCode, loading, error, loadQRCode } = useWhatsApp();
  const [countdown, setCountdown] = useState(60);

  useEffect(() => {
    loadQRCode();
  }, []);

  useEffect(() => {
    if (qrCode && countdown > 0) {
      const timer = setInterval(() => {
        setCountdown((prev) => prev - 1);
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [qrCode, countdown]);

  const handleRefresh = () => {
    setCountdown(60);
    loadQRCode();
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Conectar WhatsApp</CardTitle>
        <CardDescription>
          Escaneie o QR Code com seu WhatsApp para conectar
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-4">
        {loading && (
          <div className="flex items-center gap-2">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span>Carregando QR Code...</span>
          </div>
        )}

        {error && (
          <div className="text-red-500 text-center">
            <p>{error}</p>
            <Button onClick={handleRefresh} className="mt-2">
              Tentar Novamente
            </Button>
          </div>
        )}

        {qrCode && !loading && (
          <>
            <img src={qrCode} alt="QR Code WhatsApp" className="w-64 h-64" />
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Tempo restante: <span className="font-bold">{countdown}s</span>
              </p>
              {countdown === 0 && (
                <Button onClick={handleRefresh} className="mt-2">
                  Gerar Novo QR Code
                </Button>
              )}
            </div>
            <div className="text-sm text-gray-500 space-y-1">
              <p>1. Abra o WhatsApp no seu celular</p>
              <p>2. Toque em Configurações → Aparelhos conectados</p>
              <p>3. Toque em Conectar um aparelho</p>
              <p>4. Aponte seu celular para esta tela</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
```

---

### Passo 4: Criar Componente de Envio de Mensagens

Crie um arquivo `src/components/SendMessage.tsx`:

```typescript
import { useState } from 'react';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';

export function SendMessage() {
  const { sendMessage, loading } = useWhatsApp();
  const { toast } = useToast();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');

  const handleSend = async () => {
    if (!phoneNumber || !message) {
      toast({
        title: 'Erro',
        description: 'Preencha todos os campos',
        variant: 'destructive',
      });
      return;
    }

    try {
      await sendMessage(phoneNumber, message);
      toast({
        title: 'Sucesso',
        description: 'Mensagem enviada com sucesso!',
      });
      setPhoneNumber('');
      setMessage('');
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Falha ao enviar mensagem',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Enviar Mensagem</CardTitle>
        <CardDescription>
          Envie mensagens pelo WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Número (com DDD)</label>
          <Input
            type="tel"
            placeholder="5511999999999"
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
          />
        </div>
        <div>
          <label className="text-sm font-medium">Mensagem</label>
          <Textarea
            placeholder="Digite sua mensagem..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
          />
        </div>
        <Button onClick={handleSend} disabled={loading} className="w-full">
          {loading ? 'Enviando...' : 'Enviar Mensagem'}
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## ⚠️ PONTOS IMPORTANTES

### 1. Tratamento de Erros

Sempre trate erros de rede e autenticação:

```typescript
try {
  const result = await whatsappApi.sendMessage(to, message);
} catch (error) {
  if (error.message.includes('401')) {
    // Token expirado, fazer login novamente
  } else if (error.message.includes('404')) {
    // Sessão não encontrada
  } else {
    // Outro erro
  }
}
```

### 2. Formato de Números

Os números devem estar no formato internacional sem símbolos:
- ✅ Correto: `5511999999999`
- ❌ Errado: `+55 (11) 99999-9999`

### 3. Status da Sessão

Antes de enviar mensagens, verifique se a sessão está conectada:

```typescript
const sessions = await whatsappApi.getSessions();
const whatsappSession = sessions.find(s => s.id === 'WhatsApp');

if (whatsappSession?.status !== 'connected') {
  // Mostrar QR Code para conectar
}
```

### 4. QR Code Expira

O QR Code expira em 60 segundos. Implemente um timer e permita regenerar.

### 5. CORS

A API já está configurada com CORS habilitado para todas as origens. Não é necessário configuração adicional.

---

## 🔄 FLUXO COMPLETO DE INTEGRAÇÃO

1. **Login Automático ao Carregar a Aplicação**
```typescript
useEffect(() => {
  const autoLogin = async () => {
    try {
      await whatsappApi.login('admin@flow.com', 'admin123');
    } catch (error) {
      console.error('Erro no login automático:', error);
    }
  };
  autoLogin();
}, []);
```

2. **Verificar Status da Sessão**
```typescript
const sessions = await whatsappApi.getSessions();
const defaultSession = sessions.find(s => s.id === 'WhatsApp');
```

3. **Se Não Conectada, Mostrar QR Code**
```typescript
if (!defaultSession || defaultSession.status !== 'connected') {
  const qrData = await whatsappApi.getQRCode('WhatsApp');
  // Mostrar qrData.qrCode na tela
}
```

4. **Após Conectar, Habilitar Envio de Mensagens**
```typescript
if (defaultSession?.status === 'connected') {
  // Habilitar interface de envio de mensagens
}
```

---

## 🎨 EXEMPLO DE PÁGINA COMPLETA

```typescript
import { useEffect, useState } from 'react';
import { whatsappApi } from '@/services/whatsappApi';
import { WhatsAppQRCode } from '@/components/WhatsAppQRCode';
import { SendMessage } from '@/components/SendMessage';

export default function WhatsAppPage() {
  const [isConnected, setIsConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initialize = async () => {
      try {
        await whatsappApi.login('admin@flow.com', 'admin123');
        const sessions = await whatsappApi.getSessions();
        const defaultSession = sessions.find(s => s.id === 'WhatsApp');
        setIsConnected(defaultSession?.status === 'connected');
      } catch (error) {
        console.error('Erro ao inicializar:', error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  if (loading) {
    return <div>Carregando...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-8">WhatsApp Integration</h1>
      
      {!isConnected ? (
        <WhatsAppQRCode />
      ) : (
        <SendMessage />
      )}
    </div>
  );
}
```

---

## 🚨 TROUBLESHOOTING

### Erro: "Token não encontrado"
- Faça login novamente com `whatsappApi.login()`

### Erro: "Sessão não encontrada ou não conectada"
- Verifique se a sessão está conectada com `getSessions()`
- Se não estiver, mostre o QR Code

### QR Code não aparece
- Aguarde alguns segundos após criar a sessão
- A API pode estar inicializando o cliente WhatsApp

### Mensagem não é enviada
- Verifique o formato do número (sem símbolos, com código do país)
- Confirme que a sessão está com status "connected"

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Criar serviço de API (`whatsappApi.ts`)
- [ ] Criar hook customizado (`useWhatsApp.ts`)
- [ ] Implementar componente de QR Code
- [ ] Implementar componente de envio de mensagens
- [ ] Adicionar tratamento de erros
- [ ] Implementar timer de expiração do QR Code
- [ ] Testar login automático
- [ ] Testar envio de mensagens
- [ ] Adicionar feedback visual (loading, toasts)
- [ ] Implementar verificação de status da sessão

---

## 📞 SUPORTE

Se encontrar problemas:
1. Verifique os logs do console do navegador
2. Confirme que a API está online: https://whatsapp-api-ugdv.onrender.com
3. Teste os endpoints diretamente com curl ou Postman
4. Verifique se o token JWT está sendo enviado corretamente

---

**Desenvolvido para integração perfeita entre Lovable e WhatsApp API** 🚀
