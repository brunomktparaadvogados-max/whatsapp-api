# 🚀 Integração WhatsApp API com Lovable - Guia Completo

## 📋 Informações da API

**URL Base:** `https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app`

**Credenciais Padrão:**
- Email: `admin@flow.com`
- Senha: `admin123`

**⚠️ IMPORTANTE: Sessões Persistentes**
- As sessões WhatsApp são salvas no servidor
- Após escanear o QR Code uma vez, a conexão permanece ativa
- Mesmo fechando o navegador, a sessão continua conectada
- Não é necessário escanear o QR Code novamente

---

## 🔐 Passo 1: Autenticação

### Endpoint de Login
```typescript
POST /api/auth/login
Content-Type: application/json

{
  "email": "admin@flow.com",
  "password": "admin123"
}
```

### Resposta
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Administrador",
    "email": "admin@flow.com"
  }
}
```

### Código para Lovable
```typescript
// src/services/whatsappApi.ts
const API_BASE_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

export const whatsappApi = {
  async login(email: string, password: string) {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!response.ok) {
      throw new Error('Falha no login');
    }
    
    const data = await response.json();
    localStorage.setItem('whatsapp_token', data.token);
    localStorage.setItem('whatsapp_user', JSON.stringify(data.user));
    return data;
  },

  getToken() {
    return localStorage.getItem('whatsapp_token');
  },

  getUser() {
    const user = localStorage.getItem('whatsapp_user');
    return user ? JSON.parse(user) : null;
  },

  logout() {
    localStorage.removeItem('whatsapp_token');
    localStorage.removeItem('whatsapp_user');
  }
};
```

---

## 📱 Passo 2: Criar Sessão WhatsApp (Apenas na Primeira Vez)

### Endpoint
```typescript
POST /api/sessions
Authorization: Bearer {token}
```

### Resposta
```json
{
  "success": true,
  "sessionId": "user_1",
  "status": "initializing",
  "message": "Sessão sendo criada em background. Aguarde alguns minutos e verifique o QR Code."
}
```

### ⚠️ Importante sobre Sessões
- **Criar sessão é necessário apenas UMA VEZ**
- Após criar e conectar, a sessão fica salva no servidor
- Nas próximas vezes, apenas verifique o status (Passo 4)
- Se a sessão já existir, a API retorna a sessão existente

### Código para Lovable
```typescript
// src/services/whatsappApi.ts (continuação)
export const whatsappApi = {
  // ... código anterior ...

  async createSession() {
    const token = this.getToken();
    const response = await fetch(`${API_BASE_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Falha ao criar sessão');
    }
    
    return await response.json();
  }
};
```

---

## 🔲 Passo 3: Obter QR Code (Apenas se Não Conectado)

### Endpoint
```typescript
GET /api/my-qr
Authorization: Bearer {token}
```

### Resposta (QR Disponível - Primeira Conexão)
```json
{
  "success": true,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "status": "qr_ready"
}
```

### Resposta (Já Conectado - Sessão Persistente)
```json
{
  "success": true,
  "qrCode": null,
  "status": "connected",
  "message": "WhatsApp já está conectado!"
}
```

### ⚠️ Quando Usar
- **Primeira vez:** Exibir QR Code para escanear
- **Próximas vezes:** Sessão já estará conectada, não precisa QR Code

### Código para Lovable
```typescript
// src/services/whatsappApi.ts (continuação)
export const whatsappApi = {
  // ... código anterior ...

  async getQRCode() {
    const token = this.getToken();
    const response = await fetch(`${API_BASE_URL}/api/my-qr`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Falha ao obter QR Code');
    }
    
    return await response.json();
  }
};
```

---

## 📊 Passo 4: Verificar Status da Sessão

### Endpoint
```typescript
GET /api/my-session
Authorization: Bearer {token}
```

### Resposta
```json
{
  "success": true,
  "sessionId": "user_1",
  "status": "connected",
  "qrCode": null,
  "info": {
    "wid": {
      "user": "5511999999999",
      "_serialized": "5511999999999@c.us"
    },
    "pushname": "Bruno Oliveira"
  }
}
```

### Código para Lovable
```typescript
// src/services/whatsappApi.ts (continuação)
export const whatsappApi = {
  // ... código anterior ...

  async getSessionStatus() {
    const token = this.getToken();
    const response = await fetch(`${API_BASE_URL}/api/my-session`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error('Falha ao obter status');
    }
    
    return await response.json();
  }
};
```

---

## 💬 Passo 5: Enviar Mensagem

### Endpoint (Auto-detecta sessão)
```typescript
POST /api/messages/send
Authorization: Bearer {token}
Content-Type: application/json

{
  "to": "5511999999999",
  "message": "Olá! Esta é uma mensagem de teste."
}
```

### Resposta
```json
{
  "success": true,
  "messageId": "true_5511999999999@c.us_3EB0...",
  "sessionId": "user_1",
  "message": "Mensagem enviada com sucesso"
}
```

### Código para Lovable
```typescript
// src/services/whatsappApi.ts (continuação)
export const whatsappApi = {
  // ... código anterior ...

  async sendMessage(to: string, message: string) {
    const token = this.getToken();
    const response = await fetch(`${API_BASE_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, message })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha ao enviar mensagem');
    }
    
    return await response.json();
  }
};
```

---

## 🎨 Componente React Completo para Lovable

### WhatsAppConnection.tsx
```typescript
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { whatsappApi } from '@/services/whatsappApi';
import { useToast } from '@/hooks/use-toast';

export function WhatsAppConnection() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [sessionStatus, setSessionStatus] = useState<string>('checking');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userInfo, setUserInfo] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    const token = whatsappApi.getToken();
    if (token) {
      setIsLoggedIn(true);
      checkSession();
    }
  }, []);

  const handleLogin = async () => {
    try {
      setLoading(true);
      await whatsappApi.login('admin@flow.com', 'admin123');
      setIsLoggedIn(true);
      toast({
        title: "Login realizado!",
        description: "Conectado com sucesso"
      });
      checkSession();
    } catch (error) {
      toast({
        title: "Erro no login",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const checkSession = async () => {
    try {
      const status = await whatsappApi.getSessionStatus();
      setSessionStatus(status.status);

      if (status.status === 'connected') {
        // Sessão já conectada! Não precisa QR Code
        setQrCode(null);
        setUserInfo(status.info);
        toast({
          title: "✅ WhatsApp Conectado!",
          description: "Sua sessão está ativa e pronta para uso"
        });
      } else if (status.status === 'qr_ready' || status.status === 'initializing') {
        // Precisa escanear QR Code
        fetchQRCode();
      }
    } catch (error) {
      // Sessão não existe ainda - precisa criar
      setSessionStatus('not_created');
    }
  };

  const createSession = async () => {
    try {
      setLoading(true);
      const result = await whatsappApi.createSession();

      if (result.status === 'connected') {
        // Sessão já existia e está conectada
        setSessionStatus('connected');
        toast({
          title: "✅ Sessão já existe!",
          description: "WhatsApp já está conectado"
        });
        checkSession();
      } else {
        // Nova sessão criada, aguardar QR Code
        toast({
          title: "Sessão criada!",
          description: "Aguarde o QR Code..."
        });

        setTimeout(() => {
          fetchQRCode();
        }, 5000);
      }
    } catch (error) {
      toast({
        title: "Erro ao criar sessão",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchQRCode = async () => {
    try {
      const qrData = await whatsappApi.getQRCode();

      if (qrData.status === 'connected') {
        // Conectou! Sessão agora está persistente
        setSessionStatus('connected');
        setQrCode(null);
        setUserInfo(qrData.info);
        toast({
          title: "✅ WhatsApp Conectado!",
          description: "Sessão salva! Não precisa escanear novamente"
        });
      } else if (qrData.qrCode) {
        setQrCode(qrData.qrCode);
        setSessionStatus('qr_ready');

        // Verificar novamente em 10 segundos
        setTimeout(() => {
          fetchQRCode();
        }, 10000);
      } else {
        // QR ainda não disponível, tentar novamente
        setTimeout(() => {
          fetchQRCode();
        }, 3000);
      }
    } catch (error) {
      console.error('Erro ao buscar QR Code:', error);
    }
  };

  if (!isLoggedIn) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conectar WhatsApp API</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={handleLogin} disabled={loading}>
            {loading ? 'Conectando...' : 'Fazer Login'}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>WhatsApp Connection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-gray-600">
            Status: <span className="font-bold">{sessionStatus}</span>
          </p>
        </div>

        {sessionStatus === 'checking' && (
          <div className="text-center">
            <p className="text-sm">Verificando sessão...</p>
          </div>
        )}

        {sessionStatus === 'not_created' && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              Você ainda não possui uma sessão WhatsApp.
            </p>
            <Button onClick={createSession} disabled={loading}>
              {loading ? 'Criando...' : 'Criar Sessão WhatsApp'}
            </Button>
          </div>
        )}

        {sessionStatus === 'initializing' && (
          <div className="text-center">
            <p className="text-sm">Inicializando sessão...</p>
            <p className="text-xs text-gray-500">Aguarde o QR Code</p>
          </div>
        )}

        {qrCode && sessionStatus === 'qr_ready' && (
          <div className="text-center space-y-2">
            <p className="text-sm font-medium">Escaneie o QR Code no WhatsApp:</p>
            <img src={qrCode} alt="QR Code" className="mx-auto max-w-xs" />
            <p className="text-xs text-gray-500">
              WhatsApp → Aparelhos Conectados → Conectar Aparelho
            </p>
            <p className="text-xs text-blue-600 font-medium">
              ⚠️ Após escanear, a conexão ficará salva permanentemente
            </p>
          </div>
        )}

        {sessionStatus === 'connected' && (
          <div className="text-center space-y-2">
            <p className="text-green-600 font-medium text-lg">✅ WhatsApp Conectado!</p>
            {userInfo && (
              <div className="text-sm text-gray-600">
                <p>📱 {userInfo.pushname || 'Usuário'}</p>
                <p className="text-xs">{userInfo.wid?.user || ''}</p>
              </div>
            )}
            <p className="text-xs text-blue-600">
              🔒 Sessão persistente - Não precisa escanear novamente
            </p>
            <Button onClick={checkSession} variant="outline" size="sm">
              Atualizar Status
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### SendMessage.tsx
```typescript
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { whatsappApi } from '@/services/whatsappApi';
import { useToast } from '@/hooks/use-toast';

export function SendMessage() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!phone || !message) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha telefone e mensagem",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);
      await whatsappApi.sendMessage(phone, message);
      
      toast({
        title: "Mensagem enviada!",
        description: `Enviado para ${phone}`
      });
      
      setMessage('');
    } catch (error) {
      toast({
        title: "Erro ao enviar",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar Mensagem WhatsApp</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="text-sm font-medium">Número (com DDI)</label>
          <Input
            type="text"
            placeholder="5511999999999"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <p className="text-xs text-gray-500 mt-1">
            Exemplo: 5511999999999 (Brasil)
          </p>
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

## 📥 Passo 6: Receber Mensagens (Webhook)

### Configurar Webhook no Lovable

1. **Criar endpoint no Lovable para receber mensagens:**

```typescript
// src/pages/api/whatsapp-webhook.ts (Next.js) ou similar
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { from, message, sessionId } = req.body;

  console.log('📩 Nova mensagem recebida:');
  console.log('De:', from);
  console.log('Mensagem:', message);
  console.log('Sessão:', sessionId);

  // Processar mensagem aqui
  // Salvar no banco de dados, enviar notificação, etc.

  res.status(200).json({ success: true });
}
```

2. **Configurar webhook na API WhatsApp:**

```typescript
// src/services/whatsappApi.ts (continuação)
export const whatsappApi = {
  // ... código anterior ...

  async setWebhook(webhookUrl: string) {
    const token = this.getToken();
    const user = this.getUser();
    const sessionId = `user_${user.id}`;

    const response = await fetch(
      `${API_BASE_URL}/api/sessions/${sessionId}/webhook`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ webhookUrl })
      }
    );

    if (!response.ok) {
      throw new Error('Falha ao configurar webhook');
    }

    return await response.json();
  }
};
```

3. **URL do webhook do Lovable:**
```
https://seu-projeto.lovable.app/api/whatsapp-webhook
```

---

## 🔄 Fluxo Completo

### 1. Primeira Conexão
```
Login → Criar Sessão → Aguardar QR → Escanear QR → Conectado
```

### 2. Enviar Mensagem
```
Verificar Status → Enviar Mensagem → Receber Confirmação
```

### 3. Receber Mensagens
```
Configurar Webhook → Receber POST no endpoint → Processar mensagem
```

---

## 🎯 Exemplo de Uso Completo

```typescript
// src/pages/WhatsAppCRM.tsx
import { WhatsAppConnection } from '@/components/WhatsAppConnection';
import { SendMessage } from '@/components/SendMessage';

export default function WhatsAppCRM() {
  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold">WhatsApp CRM</h1>
      
      <div className="grid md:grid-cols-2 gap-6">
        <WhatsAppConnection />
        <SendMessage />
      </div>
    </div>
  );
}
```

---

## ✅ Checklist de Integração

- [ ] Criar arquivo `src/services/whatsappApi.ts`
- [ ] Criar componente `WhatsAppConnection.tsx`
- [ ] Criar componente `SendMessage.tsx`
- [ ] Fazer login com `admin@flow.com` / `admin123`
- [ ] Criar sessão WhatsApp
- [ ] Escanear QR Code no WhatsApp
- [ ] Testar envio de mensagem
- [ ] Configurar webhook (opcional)
- [ ] Testar recebimento de mensagens

---

## 🚨 Troubleshooting

### QR Code não aparece
- Aguarde 10-15 segundos após criar sessão
- Clique em "Atualizar Status"
- Verifique console do navegador

### Erro ao enviar mensagem
- Verifique se sessão está "connected"
- Confirme formato do número: `5511999999999`
- Verifique se token está válido

### Sessão desconecta
- Verifique conexão do servidor Koyeb
- Recrie a sessão se necessário
- Escaneie novo QR Code

---

## 📞 Suporte

Se precisar de ajuda, verifique:
1. Console do navegador (F12)
2. Logs do servidor no Koyeb
3. Status da API: `https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/health`

---

**✨ Pronto! Agora o Lovable pode enviar e receber mensagens WhatsApp!**
