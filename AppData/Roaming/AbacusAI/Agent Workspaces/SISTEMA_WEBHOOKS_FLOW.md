# 🔗 SISTEMA DE WEBHOOKS - FLOW/LOVABLE

## ✅ IMPLEMENTADO

### 1. **Retorno de Erro Padronizado**
Todos os endpoints de envio agora retornam:
```json
// Sucesso
{
  "success": true,
  "message": "Mensagem enviada com sucesso",
  "data": { ... }
}

// Erro
{
  "success": false,
  "error": "Mensagem de erro",
  "details": "Detalhes adicionais"
}
```

### 2. **Endpoint de Informações de Webhooks**
```
GET /api/webhooks/info
Authorization: Bearer SEU_TOKEN
```

**Retorna:**
```json
{
  "success": true,
  "userId": 1,
  "totalSessions": 1,
  "webhooks": [
    {
      "sessionId": "user_1",
      "status": "connected",
      "webhooks": {
        "send": {
          "url": "https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/sessions/user_1/message",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json",
            "Authorization": "Bearer SEU_TOKEN_JWT"
          },
          "body": {
            "to": "5511999999999",
            "message": "Sua mensagem aqui"
          },
          "description": "Use este endpoint para ENVIAR mensagens via WhatsApp"
        },
        "receive": {
          "url": "Não configurado",
          "method": "POST",
          "description": "Configure este webhook no Flow para RECEBER mensagens do WhatsApp",
          "howToSet": "PUT https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/sessions/user_1/webhook",
          "examplePayload": {
            "event": "message",
            "sessionId": "user_1",
            "userId": 1,
            "message": {
              "id": "msg_id",
              "from": "5511999999999",
              "body": "Mensagem recebida",
              "type": "chat",
              "timestamp": 1234567890
            }
          }
        }
      }
    }
  ],
  "instructions": {
    "send": "Use o webhook 'send' no n8n/Flow para ENVIAR mensagens",
    "receive": "Configure o webhook 'receive' para RECEBER mensagens no Flow",
    "authentication": "Inclua o header Authorization: Bearer SEU_TOKEN em todas as requisições"
  }
}
```

---

## 📋 COMO USAR NO FLOW/LOVABLE

### 1. **Exibir Webhooks no Chat**

Adicione um componente no Flow que exibe os webhooks do usuário:

```typescript
// src/components/WebhooksInfo.tsx
import { useEffect, useState } from 'react';
import { whatsappApi } from '@/services/whatsappApi';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

export function WebhooksInfo() {
  const [webhooks, setWebhooks] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadWebhooks();
  }, []);

  const loadWebhooks = async () => {
    try {
      const data = await whatsappApi.getWebhooksInfo();
      setWebhooks(data);
    } catch (error) {
      toast({ title: '❌ Erro ao carregar webhooks', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: '✅ Copiado para a área de transferência!' });
  };

  if (loading) return <div>Carregando...</div>;
  if (!webhooks) return null;

  return (
    <Card className="p-6">
      <h2 className="text-2xl font-bold mb-4">Seus Webhooks</h2>
      
      {webhooks.webhooks.map((session: any) => (
        <div key={session.sessionId} className="mb-6 border-b pb-4">
          <h3 className="text-lg font-semibold mb-2">
            Sessão: {session.sessionId} ({session.status})
          </h3>
          
          {/* Webhook de ENVIO */}
          <div className="mb-4">
            <h4 className="font-medium text-green-600">📤 Webhook de ENVIO</h4>
            <p className="text-sm text-gray-600 mb-2">{session.webhooks.send.description}</p>
            <div className="bg-gray-100 p-3 rounded flex items-center justify-between">
              <code className="text-sm">{session.webhooks.send.url}</code>
              <Button size="sm" onClick={() => copyToClipboard(session.webhooks.send.url)}>
                Copiar
              </Button>
            </div>
          </div>

          {/* Webhook de RECEBIMENTO */}
          <div>
            <h4 className="font-medium text-blue-600">📥 Webhook de RECEBIMENTO</h4>
            <p className="text-sm text-gray-600 mb-2">{session.webhooks.receive.description}</p>
            <div className="bg-gray-100 p-3 rounded">
              <code className="text-sm">
                {session.webhooks.receive.url === 'Não configurado' 
                  ? '⚠️ Não configurado' 
                  : session.webhooks.receive.url}
              </code>
            </div>
          </div>
        </div>
      ))}

      <div className="mt-4 p-4 bg-blue-50 rounded">
        <h4 className="font-semibold mb-2">📖 Instruções:</h4>
        <ul className="text-sm space-y-1">
          <li>• <strong>Envio:</strong> {webhooks.instructions.send}</li>
          <li>• <strong>Recebimento:</strong> {webhooks.instructions.receive}</li>
          <li>• <strong>Autenticação:</strong> {webhooks.instructions.authentication}</li>
        </ul>
      </div>
    </Card>
  );
}
```

### 2. **Adicionar método no whatsappApi.ts**

```typescript
// src/services/whatsappApi.ts

export const whatsappApi = {
  // ... outros métodos ...

  getWebhooksInfo: async () => {
    const response = await api.get('/api/webhooks/info');
    return response.data;
  },
};
```

### 3. **Verificar Sucesso no Envio**

```typescript
// src/services/whatsappApi.ts

sendMessage: async (sessionId: string, to: string, message: string) => {
  try {
    const response = await api.post(`/api/sessions/${sessionId}/message`, { to, message });
    
    if (!response.data.success) {
      throw new Error(response.data.error || 'Falha ao enviar mensagem');
    }
    
    return response.data;
  } catch (error: any) {
    // Se a API retornar erro, não contabilizar como enviado
    throw new Error(error.response?.data?.error || 'Erro ao enviar mensagem');
  }
},
```

---

## 🎯 FLUXO COMPLETO

### **ENVIO DE MENSAGENS (Flow → API → WhatsApp)**
1. Usuário envia mensagem no Flow
2. Flow chama `POST /api/sessions/:sessionId/message`
3. API retorna `{ success: true }` ou `{ success: false }`
4. Flow só contabiliza como enviado se `success: true`

### **RECEBIMENTO DE MENSAGENS (WhatsApp → API → Flow)**
1. WhatsApp recebe mensagem
2. API envia webhook para URL configurada
3. Flow recebe payload e salva no Supabase
4. Mensagem aparece no chat do Flow

---

## 📝 CONFIGURAR WEBHOOK DE RECEBIMENTO

### No Flow, após login:
```typescript
const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/whatsapp-webhook`;
await whatsappApi.setWebhook(sessionId, webhookUrl);
```

### Criar Edge Function no Supabase:
Veja o arquivo `CORRIGIR_RECEBIMENTO_MENSAGENS.md` para instruções completas.

---

## ✅ RESUMO

✅ **Retorno de erro padronizado** com campo `success`  
✅ **Endpoint `/api/webhooks/info`** para exibir webhooks  
✅ **Webhook de envio** (Flow → API)  
✅ **Webhook de recebimento** (API → Flow)  
✅ **Normalização de números** (12 e 13 dígitos)  
✅ **Tentativa automática** com/sem 9º dígito  

---

## 🚀 PRÓXIMOS PASSOS

1. **Aguarde o deploy** no Koyeb (commit `f3b09df`)
2. **Faça login no Flow** e obtenha seu token
3. **Chame** `GET /api/webhooks/info` para ver seus webhooks
4. **Configure** o webhook de recebimento no Supabase
5. **Teste** enviando e recebendo mensagens
