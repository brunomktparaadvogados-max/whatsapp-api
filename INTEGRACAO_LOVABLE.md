# 🔗 INTEGRAÇÃO WHATSAPP API COM LOVABLE

## 📋 INFORMAÇÕES DA SUA API

**URL da API:** `https://whatsapp-api-ugdv.onrender.com`

**Credenciais:**
- Email: `admin@flow.com`
- Senha: `admin123`

---

## 🚀 PASSO A PASSO - INTEGRAÇÃO COM LOVABLE

### PASSO 1: Configurar Variável de Ambiente no Lovable

1. Abra seu projeto no Lovable: https://lovable.dev

2. Clique no ícone de **configurações** (⚙️) ou vá em **Settings**

3. Procure por **"Environment Variables"** ou **"Variables"**

4. Adicione a variável:
   ```
   Nome: VITE_WHATSAPP_API_URL
   Valor: https://whatsapp-api-ugdv.onrender.com
   ```

5. Clique em **"Save"** ou **"Add"**

6. **Rebuild** o projeto (pode ser necessário)

---

### PASSO 2: Usar a API no Código do Lovable

Cole este código no chat do Lovable para ele criar a integração:

```
Crie uma integração com a API WhatsApp usando estas informações:

API_URL: https://whatsapp-api-ugdv.onrender.com

Endpoints disponíveis:

1. Criar Sessão:
POST /api/sessions
Body: { "sessionId": "string", "webhookUrl": "string (opcional)" }

2. Obter QR Code:
GET /api/sessions/:sessionId/qr
Retorna: { "qr": "data:image/png;base64,..." }

3. Enviar Mensagem:
POST /api/sessions/:sessionId/messages
Body: { "to": "5511999999999", "message": "texto" }

4. Enviar Mídia:
POST /api/sessions/:sessionId/messages/media
Body: { "to": "5511999999999", "mediaUrl": "url", "caption": "texto" }

5. Listar Sessões:
GET /api/sessions

6. Status da Sessão:
GET /api/sessions/:sessionId

7. Deletar Sessão:
DELETE /api/sessions/:sessionId

Crie:
1. Um componente para criar sessão e exibir QR Code
2. Um formulário para enviar mensagens
3. Uma lista de sessões ativas
4. Tratamento de erros e loading states
```

---

### PASSO 3: Exemplo de Código React (Se quiser fazer manual)

```typescript
// hooks/useWhatsAppAPI.ts
import { useState } from 'react';

const API_URL = import.meta.env.VITE_WHATSAPP_API_URL || 'https://whatsapp-api-ugdv.onrender.com';

export const useWhatsAppAPI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createSession = async (sessionId: string, webhookUrl?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, webhookUrl }),
      });
      const data = await response.json();
      return data;
    } catch (err) {
      setError('Erro ao criar sessão');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getQRCode = async (sessionId: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/qr`);
      const data = await response.json();
      return data.qr;
    } catch (err) {
      setError('Erro ao obter QR Code');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async (sessionId: string, to: string, message: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, message }),
      });
      const data = await response.json();
      return data;
    } catch (err) {
      setError('Erro ao enviar mensagem');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const getSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_URL}/api/sessions`);
      const data = await response.json();
      return data;
    } catch (err) {
      setError('Erro ao listar sessões');
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    createSession,
    getQRCode,
    sendMessage,
    getSessions,
  };
};
```

```typescript
// components/WhatsAppSession.tsx
import { useState, useEffect } from 'react';
import { useWhatsAppAPI } from '@/hooks/useWhatsAppAPI';

export const WhatsAppSession = () => {
  const [sessionId, setSessionId] = useState('');
  const [qrCode, setQrCode] = useState('');
  const { createSession, getQRCode, loading, error } = useWhatsAppAPI();

  const handleCreateSession = async () => {
    try {
      await createSession(sessionId);
      const qr = await getQRCode(sessionId);
      setQrCode(qr);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Criar Sessão WhatsApp</h2>
      
      <div className="space-y-4">
        <input
          type="text"
          placeholder="ID da Sessão"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="w-full p-2 border rounded"
        />
        
        <button
          onClick={handleCreateSession}
          disabled={loading || !sessionId}
          className="bg-green-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Criando...' : 'Criar Sessão'}
        </button>

        {error && <p className="text-red-500">{error}</p>}

        {qrCode && (
          <div className="mt-4">
            <p className="mb-2">Escaneie o QR Code com seu WhatsApp:</p>
            <img src={qrCode} alt="QR Code" className="border p-2" />
          </div>
        )}
      </div>
    </div>
  );
};
```

```typescript
// components/SendMessage.tsx
import { useState } from 'react';
import { useWhatsAppAPI } from '@/hooks/useWhatsAppAPI';

export const SendMessage = () => {
  const [sessionId, setSessionId] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState('');
  const { sendMessage, loading, error } = useWhatsAppAPI();

  const handleSend = async () => {
    try {
      await sendMessage(sessionId, to, message);
      alert('Mensagem enviada com sucesso!');
      setMessage('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-2xl font-bold mb-4">Enviar Mensagem</h2>
      
      <div className="space-y-4">
        <input
          type="text"
          placeholder="ID da Sessão"
          value={sessionId}
          onChange={(e) => setSessionId(e.target.value)}
          className="w-full p-2 border rounded"
        />
        
        <input
          type="text"
          placeholder="Número (ex: 5511999999999)"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="w-full p-2 border rounded"
        />
        
        <textarea
          placeholder="Mensagem"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full p-2 border rounded"
          rows={4}
        />
        
        <button
          onClick={handleSend}
          disabled={loading || !sessionId || !to || !message}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {loading ? 'Enviando...' : 'Enviar Mensagem'}
        </button>

        {error && <p className="text-red-500">{error}</p>}
      </div>
    </div>
  );
};
```

---

## 🎯 OPÇÃO MAIS FÁCIL: Deixe o Lovable Criar

Cole no chat do Lovable:

```
Integre a API WhatsApp que está rodando em:
https://whatsapp-api-ugdv.onrender.com

Crie uma página com:
1. Formulário para criar sessão WhatsApp e exibir QR Code
2. Formulário para enviar mensagens
3. Lista de sessões ativas
4. Use a variável de ambiente VITE_WHATSAPP_API_URL

Endpoints:
- POST /api/sessions - criar sessão
- GET /api/sessions/:id/qr - obter QR Code
- POST /api/sessions/:id/messages - enviar mensagem
- GET /api/sessions - listar sessões

Use React Query para cache e Shadcn UI para componentes.
```

---

## 📱 TESTAR A INTEGRAÇÃO

1. **Criar Sessão:**
   - Use o formulário no Lovable
   - Escaneie o QR Code com WhatsApp

2. **Enviar Mensagem:**
   - Preencha o ID da sessão
   - Digite o número com DDI (ex: 5511999999999)
   - Digite a mensagem
   - Clique em enviar

3. **Verificar:**
   - A mensagem deve chegar no WhatsApp
   - Verifique os logs no Render se houver erro

---

## ⚠️ IMPORTANTE

### Render Sleep (Plano Gratuito)
A API "dorme" após 15 minutos sem uso. Configure UptimeRobot:

1. Acesse: https://uptimerobot.com
2. Crie monitor HTTP(s)
3. URL: `https://whatsapp-api-ugdv.onrender.com`
4. Intervalo: 5 minutos

Isso mantém a API sempre ativa!

---

## 🆘 PROBLEMAS COMUNS

### "Failed to fetch"
- Verifique se a API está ativa (acesse a URL no navegador)
- Se estiver "dormindo", aguarde 30 segundos

### "Session not found"
- Crie a sessão primeiro
- Verifique se o ID está correto

### "Invalid number"
- Use formato internacional: 5511999999999
- Não use espaços, parênteses ou traços

---

## ✅ PRÓXIMOS PASSOS

1. Configure a variável de ambiente no Lovable
2. Cole o prompt no chat do Lovable
3. Teste a integração
4. Configure UptimeRobot para manter API ativa

**Sua integração está pronta! 🎉**
