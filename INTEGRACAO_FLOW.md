# 🔗 Integração WhatsApp API com Sistema Flow (Lovable)

## 📋 Visão Geral

Este guia mostra como integrar a WhatsApp API com o sistema Flow criado no Lovable, permitindo que cada usuário tenha sua própria sessão WhatsApp sem acessar diretamente a API.

---

## 🏗️ Arquitetura

```
┌─────────────────┐
│  Sistema Flow   │
│   (Frontend)    │
└────────┬────────┘
         │ HTTP/REST
         ▼
┌─────────────────┐
│  WhatsApp API   │
│    (Backend)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   WhatsApp      │
│   Web.js        │
└─────────────────┘
```

---

## 🔐 Autenticação

### 1. Login do Usuário

**Endpoint:** `POST /api/auth/login`

```typescript
// Exemplo de requisição
const response = await fetch('https://sua-api.koyeb.app/api/auth/login', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    email: 'usuario@exemplo.com',
    password: 'senha123'
  })
});

const data = await response.json();
// Retorna:
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "usuario@exemplo.com",
    "name": "Nome do Usuário",
    "company": "Empresa"
  },
  "sessionId": "user_1",
  "sessionStatus": "not_created" // ou "initializing", "qr_code", "connected"
}
```

**Importante:** Salve o `token` no localStorage/sessionStorage para usar nas próximas requisições.

---

## 📱 Fluxo de Conexão WhatsApp

### 2. Verificar Status da Sessão

**Endpoint:** `GET /api/auth/me`

```typescript
const response = await fetch('https://sua-api.koyeb.app/api/auth/me', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
// Retorna:
{
  "success": true,
  "user": { ... },
  "session": {
    "sessionId": "user_1",
    "status": "not_created", // ou "initializing", "qr_code", "connected", "failed"
    "qrCode": null, // ou "data:image/png;base64,..."
    "info": null
  }
}
```

### 3. Criar Sessão (se não existir)

**Endpoint:** `POST /api/sessions`

```typescript
const response = await fetch('https://sua-api.koyeb.app/api/sessions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    sessionId: `user_${userId}` // Opcional, será criado automaticamente
  })
});

const data = await response.json();
// Retorna:
{
  "success": true,
  "sessionId": "user_1",
  "message": "Sessão criada com sucesso"
}
```

### 4. Obter QR Code

**Endpoint:** `GET /api/sessions/:sessionId/qr`

```typescript
const response = await fetch(`https://sua-api.koyeb.app/api/sessions/user_${userId}/qr`, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
// Retorna:
{
  "success": true,
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...",
  "status": "qr_code"
}
```

**Exibir QR Code:**

```tsx
// React/Lovable
{data.qrCode && (
  <img 
    src={data.qrCode} 
    alt="QR Code WhatsApp" 
    className="w-64 h-64"
  />
)}
```

### 5. Polling para Verificar Conexão

```typescript
// Verificar a cada 3 segundos se o WhatsApp foi conectado
const checkConnection = setInterval(async () => {
  const response = await fetch('https://sua-api.koyeb.app/api/auth/me', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });
  
  const data = await response.json();
  
  if (data.session.status === 'connected') {
    clearInterval(checkConnection);
    console.log('✅ WhatsApp conectado!');
    // Atualizar UI
  }
}, 3000);
```

---

## 💬 Envio de Mensagens

### 6. Enviar Mensagem (Auto-detecta Sessão)

**Endpoint:** `POST /api/messages/send`

```typescript
const response = await fetch('https://sua-api.koyeb.app/api/messages/send', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    to: '5511999999999', // Número com DDI + DDD (sem + ou espaços)
    message: 'Olá! Esta é uma mensagem de teste.'
    // sessionId: 'user_1' // Opcional, será auto-detectado se houver apenas 1 sessão
  })
});

const data = await response.json();
// Retorna:
{
  "success": true,
  "sessionId": "user_1",
  "messageId": "...",
  "timestamp": "..."
}
```

**Importante:** 
- Se o usuário tiver apenas 1 sessão conectada, não precisa informar `sessionId`
- Se tiver múltiplas sessões, deve especificar qual usar

---

## 🎨 Componente React Completo (Lovable)

```tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';

const API_URL = 'https://sua-api.koyeb.app';

export default function WhatsAppIntegration() {
  const [token, setToken] = useState(localStorage.getItem('whatsapp_token'));
  const [session, setSession] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [message, setMessage] = useState('');
  const [phone, setPhone] = useState('');
  const { toast } = useToast();

  // Verificar status da sessão ao carregar
  useEffect(() => {
    if (token) {
      checkSession();
    }
  }, [token]);

  // Polling para verificar conexão
  useEffect(() => {
    if (session?.status === 'qr_code') {
      const interval = setInterval(checkSession, 3000);
      return () => clearInterval(interval);
    }
  }, [session?.status]);

  const checkSession = async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      setSession(data.session);
      
      if (data.session.status === 'qr_code' && data.session.qrCode) {
        setQrCode(data.session.qrCode);
      } else if (data.session.status === 'connected') {
        setQrCode(null);
        toast({
          title: '✅ WhatsApp Conectado!',
          description: 'Você já pode enviar mensagens.'
        });
      }
    } catch (error) {
      console.error('Erro ao verificar sessão:', error);
    }
  };

  const connectWhatsApp = async () => {
    try {
      // Criar sessão se não existir
      if (session?.status === 'not_created') {
        await fetch(`${API_URL}/api/sessions`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
      }

      // Aguardar QR Code
      setTimeout(checkSession, 2000);
      
      toast({
        title: '🔄 Gerando QR Code...',
        description: 'Aguarde alguns segundos.'
      });
    } catch (error) {
      toast({
        title: '❌ Erro',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const sendMessage = async () => {
    try {
      const response = await fetch(`${API_URL}/api/messages/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: phone.replace(/\D/g, ''), // Remove caracteres não numéricos
          message: message
        })
      });

      const data = await response.json();

      if (data.success) {
        toast({
          title: '✅ Mensagem Enviada!',
          description: `Para: ${phone}`
        });
        setMessage('');
        setPhone('');
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      toast({
        title: '❌ Erro ao Enviar',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <h1 className="text-3xl font-bold">WhatsApp Integration</h1>

      {/* Status da Conexão */}
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-4">Status da Conexão</h2>
        
        {session?.status === 'not_created' && (
          <div>
            <p className="mb-4">WhatsApp não conectado</p>
            <Button onClick={connectWhatsApp}>
              Conectar WhatsApp
            </Button>
          </div>
        )}

        {session?.status === 'initializing' && (
          <p>🔄 Inicializando WhatsApp...</p>
        )}

        {session?.status === 'qr_code' && qrCode && (
          <div className="text-center">
            <p className="mb-4">📱 Escaneie o QR Code com seu WhatsApp:</p>
            <img 
              src={qrCode} 
              alt="QR Code" 
              className="mx-auto w-64 h-64 border-4 border-gray-300 rounded-lg"
            />
            <p className="mt-4 text-sm text-gray-600">
              Abra o WhatsApp → Configurações → Aparelhos conectados → Conectar aparelho
            </p>
          </div>
        )}

        {session?.status === 'connected' && (
          <div className="text-green-600">
            ✅ WhatsApp Conectado!
          </div>
        )}

        {session?.status === 'failed' && (
          <div>
            <p className="text-red-600 mb-4">❌ Falha na conexão</p>
            <Button onClick={connectWhatsApp}>
              Tentar Novamente
            </Button>
          </div>
        )}
      </Card>

      {/* Envio de Mensagens */}
      {session?.status === 'connected' && (
        <Card className="p-6">
          <h2 className="text-xl font-semibold mb-4">Enviar Mensagem</h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Número (com DDI + DDD)
              </label>
              <Input
                type="tel"
                placeholder="5511999999999"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">
                Mensagem
              </label>
              <textarea
                className="w-full p-3 border rounded-lg"
                rows={4}
                placeholder="Digite sua mensagem..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>

            <Button 
              onClick={sendMessage}
              disabled={!phone || !message}
              className="w-full"
            >
              Enviar Mensagem
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
```

---

## 🔒 Segurança

### Headers Obrigatórios

Todas as requisições (exceto login) devem incluir:

```typescript
headers: {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
}
```

### Isolamento de Sessões

- Cada usuário tem sua própria sessão: `user_${userId}`
- Um usuário não pode acessar sessões de outros usuários
- A API valida automaticamente a propriedade da sessão

---

## 📊 Estados da Sessão

| Status | Descrição | Ação do Usuário |
|--------|-----------|-----------------|
| `not_created` | Sessão não existe | Clicar em "Conectar WhatsApp" |
| `initializing` | Iniciando WhatsApp | Aguardar |
| `qr_code` | QR Code disponível | Escanear com WhatsApp |
| `connected` | WhatsApp conectado | Pode enviar mensagens |
| `failed` | Falha na conexão | Tentar novamente |

---

## 🚀 Deploy e Configuração

### Variáveis de Ambiente (Lovable)

```env
VITE_WHATSAPP_API_URL=https://sua-api.koyeb.app
```

### Uso no Código

```typescript
const API_URL = import.meta.env.VITE_WHATSAPP_API_URL;
```

---

## 🧪 Testando a Integração

### 1. Teste de Login

```bash
curl -X POST https://sua-api.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flow.com","password":"admin123"}'
```

### 2. Teste de Envio (com token)

```bash
curl -X POST https://sua-api.koyeb.app/api/messages/send \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"to":"5511999999999","message":"Teste"}'
```

---

## 📝 Checklist de Implementação

- [ ] Criar página de login no Flow
- [ ] Salvar token JWT no localStorage
- [ ] Criar componente de conexão WhatsApp
- [ ] Implementar exibição de QR Code
- [ ] Adicionar polling para verificar conexão
- [ ] Criar formulário de envio de mensagens
- [ ] Adicionar tratamento de erros
- [ ] Testar com múltiplos usuários
- [ ] Adicionar indicadores de loading
- [ ] Implementar notificações (toast)

---

## 🆘 Troubleshooting

### Erro: "Sessão não encontrada"

**Solução:** Certifique-se de que:
1. O token JWT está válido
2. A sessão foi criada (`POST /api/sessions`)
3. O `sessionId` está correto

### Erro: "Nenhuma sessão conectada encontrada"

**Solução:** 
1. Verifique se o WhatsApp foi escaneado
2. Aguarde alguns segundos após escanear
3. Verifique o status com `GET /api/auth/me`

### QR Code não aparece

**Solução:**
1. Aguarde 5-10 segundos após criar a sessão
2. Verifique os logs da API no Koyeb
3. Tente deletar e recriar a sessão

---

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs da API no Koyeb
2. Teste os endpoints com curl/Postman
3. Verifique se o Chromium está funcionando

---

## 🎯 Próximos Passos

1. ✅ Implementar envio de mídia (imagens, vídeos)
2. ✅ Adicionar histórico de mensagens
3. ✅ Implementar webhooks para mensagens recebidas
4. ✅ Adicionar suporte a grupos
5. ✅ Implementar agendamento de mensagens

---

**Desenvolvido para integração com Sistema Flow (Lovable)**
