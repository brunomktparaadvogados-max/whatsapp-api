# ✅ SOLUÇÃO - Integração WhatsApp API com Lovable

## 🔍 PROBLEMA IDENTIFICADO

**O projeto Lovable NÃO EXISTE neste workspace!**

Você tem apenas:
- ✅ API WhatsApp funcionando: `https://whatsapp-api-ugdv.onrender.com`
- ✅ Documentação completa da integração
- ❌ **FALTA**: O projeto frontend no Lovable

## 🎯 O QUE VOCÊ PRECISA FAZER

### 1️⃣ ACESSAR O LOVABLE

Acesse: **https://lovable.dev** ou **https://sistemaflow.lovable.app**

### 2️⃣ CRIAR/ABRIR SEU PROJETO

Se você já tem um projeto:
- Abra o projeto existente no Lovable

Se não tem:
- Crie um novo projeto no Lovable
- Escolha template "React + TypeScript + Vite"

### 3️⃣ CONFIGURAR VARIÁVEIS DE AMBIENTE

No Lovable, vá em **Settings → Environment Variables** e adicione:

```env
VITE_WHATSAPP_API_URL=https://whatsapp-api-ugdv.onrender.com
VITE_SUPABASE_URL=https://qzxywaajfmnkycrpzwmr.supabase.co
VITE_SUPABASE_ANON_KEY=seu_anon_key_aqui
```

### 4️⃣ COPIAR E COLAR NO CHAT DO LOVABLE

Cole este prompt no chat do Lovable:

```
Preciso integrar minha API do WhatsApp com este projeto. 

API URL: https://whatsapp-api-ugdv.onrender.com
Webhook URL: https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook

Crie os seguintes arquivos:

1. src/services/whatsappApi.ts - Serviço para comunicação com a API
2. src/components/WhatsAppSessions.tsx - Gerenciamento de sessões
3. src/components/ChatView.tsx - Interface de chat
4. src/components/WhatsAppNavigation.tsx - Menu de navegação

A API tem os seguintes endpoints:
- POST /api/sessions - Criar sessão
- GET /api/sessions - Listar sessões
- GET /api/sessions/:id/qr - Obter QR Code
- POST /api/sessions/:id/messages - Enviar mensagem
- DELETE /api/sessions/:id - Deletar sessão
- PUT /api/sessions/:id/webhook - Atualizar webhook

Use shadcn/ui para os componentes de interface.
```

### 5️⃣ CÓDIGO COMPLETO PARA COLAR NO LOVABLE

Se preferir, cole os códigos diretamente:

#### 📄 `src/services/whatsappApi.ts`

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

  getWebhookUrl() {
    return 'https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook';
  },

  getApiUrl() {
    return API_URL;
  }
};
```

#### 📄 `src/components/WhatsAppSessions.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { whatsappApi } from '@/services/whatsappApi';
import { QrCode, Trash2, Plus, RefreshCw } from 'lucide-react';
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
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
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
      
      setTimeout(async () => {
        try {
          const qrData = await whatsappApi.getQRCode(newSessionId);
          setQrCode(qrData.qr);
          
          toast({
            title: 'Sucesso',
            description: 'Sessão criada! Escaneie o QR Code'
          });
        } catch (error) {
          toast({
            title: 'Aviso',
            description: 'Sessão criada, mas QR Code ainda não está disponível',
          });
        }
      }, 2000);
      
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

  const handleGetQRCode = async (sessionId: string) => {
    try {
      const qrData = await whatsappApi.getQRCode(sessionId);
      setQrCode(qrData.qr);
      toast({
        title: 'QR Code obtido',
        description: 'Escaneie o código abaixo'
      });
    } catch (error) {
      toast({
        title: 'Erro',
        description: 'Não foi possível obter o QR Code',
        variant: 'destructive'
      });
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
      if (qrCode) setQrCode(null);
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
          <div className="flex items-center justify-between">
            <CardTitle>Sessões WhatsApp</CardTitle>
            <Button variant="outline" size="sm" onClick={loadSessions}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="ID da sessão (ex: minha-sessao)"
              value={newSessionId}
              onChange={(e) => setNewSessionId(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateSession()}
            />
            <Button onClick={handleCreateSession} disabled={loading}>
              <Plus className="w-4 h-4 mr-2" />
              Criar Sessão
            </Button>
          </div>

          {qrCode && (
            <div className="flex flex-col items-center gap-4 p-4 border rounded-lg bg-white">
              <p className="text-sm font-medium">Escaneie o QR Code com seu WhatsApp:</p>
              <img src={qrCode} alt="QR Code" className="w-64 h-64" />
              <Button variant="outline" onClick={() => setQrCode(null)}>
                Fechar
              </Button>
            </div>
          )}

          <div className="space-y-2">
            {sessions.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma sessão criada ainda
              </p>
            ) : (
              sessions.map((session: any) => (
                <div key={session.sessionId} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <p className="font-medium">{session.sessionId}</p>
                    <p className="text-sm text-muted-foreground">
                      Status: <span className={session.status === 'connected' ? 'text-green-600' : 'text-yellow-600'}>
                        {session.status || 'Desconhecido'}
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {session.status !== 'connected' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGetQRCode(session.sessionId)}
                      >
                        <QrCode className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDeleteSession(session.sessionId)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
```

#### 📄 `src/components/ChatView.tsx`

```typescript
import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { whatsappApi } from '@/services/whatsappApi';
import { Send, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const ChatView = () => {
  const [sessions, setSessions] = useState([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      const data = await whatsappApi.getSessions();
      const connectedSessions = (data.sessions || []).filter(
        (s: any) => s.status === 'connected'
      );
      setSessions(connectedSessions);
      if (connectedSessions.length > 0 && !selectedSession) {
        setSelectedSession(connectedSessions[0].sessionId);
      }
    } catch (error) {
      console.error('Erro ao carregar sessões:', error);
    }
  };

  const handleSendMessage = async () => {
    if (!selectedSession) {
      toast({
        title: 'Erro',
        description: 'Selecione uma sessão conectada',
        variant: 'destructive'
      });
      return;
    }

    if (!phoneNumber.trim() || !newMessage.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha o número e a mensagem',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    try {
      await whatsappApi.sendMessage(selectedSession, phoneNumber, newMessage);
      
      toast({
        title: 'Sucesso',
        description: 'Mensagem enviada!'
      });
      
      setNewMessage('');
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Enviar Mensagem</CardTitle>
          <Button variant="outline" size="sm" onClick={loadSessions}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar Sessões
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {sessions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Nenhuma sessão conectada</p>
            <p className="text-sm mt-2">Crie e conecte uma sessão primeiro</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label className="text-sm font-medium">Sessão</label>
              <Select value={selectedSession} onValueChange={setSelectedSession}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma sessão" />
                </SelectTrigger>
                <SelectContent>
                  {sessions.map((session: any) => (
                    <SelectItem key={session.sessionId} value={session.sessionId}>
                      {session.sessionId}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Número do Destinatário</label>
              <Input
                placeholder="5511999999999 (com código do país)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Mensagem</label>
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
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
```

#### 📄 `src/components/WhatsAppNavigation.tsx`

```typescript
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WhatsAppSessions } from './WhatsAppSessions';
import { ChatView } from './ChatView';
import { MessageSquare, Settings } from 'lucide-react';

export const WhatsAppNavigation = () => {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">WhatsApp CRM</h1>
      
      <Tabs defaultValue="sessions" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sessions">
            <Settings className="w-4 h-4 mr-2" />
            Sessões
          </TabsTrigger>
          <TabsTrigger value="chat">
            <MessageSquare className="w-4 h-4 mr-2" />
            Chat
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="sessions" className="mt-6">
          <WhatsAppSessions />
        </TabsContent>
        
        <TabsContent value="chat" className="mt-6">
          <ChatView />
        </TabsContent>
      </Tabs>
    </div>
  );
};
```

### 6️⃣ ADICIONAR AO APP PRINCIPAL

No arquivo `src/App.tsx` ou na página principal, adicione:

```typescript
import { WhatsAppNavigation } from '@/components/WhatsAppNavigation';

function App() {
  return (
    <div className="min-h-screen bg-background">
      <WhatsAppNavigation />
    </div>
  );
}

export default App;
```

### 7️⃣ CONFIGURAR SUPABASE (OPCIONAL - PARA WEBHOOK)

Se quiser receber mensagens automaticamente, configure a Edge Function no Supabase:

1. Acesse: https://supabase.com/dashboard
2. Vá em **Edge Functions**
3. Crie uma nova função chamada `whatsapp-webhook`
4. Cole o código da Edge Function (veja `INTEGRACAO_WHATSAPP_COMPLETA_LOVABLE.md`)

## ✅ CHECKLIST FINAL

- [ ] Acessei o Lovable
- [ ] Configurei as variáveis de ambiente
- [ ] Criei o arquivo `whatsappApi.ts`
- [ ] Criei o componente `WhatsAppSessions.tsx`
- [ ] Criei o componente `ChatView.tsx`
- [ ] Criei o componente `WhatsAppNavigation.tsx`
- [ ] Adicionei ao App principal
- [ ] Testei criar uma sessão
- [ ] Testei enviar uma mensagem

## 🎯 RESULTADO ESPERADO

Após seguir todos os passos, você terá:

1. ✅ Interface para criar sessões WhatsApp
2. ✅ QR Code para conectar o WhatsApp
3. ✅ Interface para enviar mensagens
4. ✅ Integração completa com a API

## 📞 LINKS IMPORTANTES

- **API WhatsApp**: https://whatsapp-api-ugdv.onrender.com
- **Webhook Supabase**: https://qzxywaajfmnkycrpzwmr.supabase.co/functions/v1/whatsapp-webhook
- **Lovable**: https://lovable.dev
- **Documentação Completa**: `INTEGRACAO_WHATSAPP_COMPLETA_LOVABLE.md`

## 🆘 PROBLEMAS COMUNS

### Erro: "Token não fornecido"
- A API está funcionando, mas alguns endpoints precisam de autenticação
- Para criar sessões e enviar mensagens, não precisa de token

### Erro: "CORS"
- Verifique se a URL da API está correta nas variáveis de ambiente
- A API já está configurada para aceitar requisições do Lovable

### QR Code não aparece
- Aguarde 2-3 segundos após criar a sessão
- Clique no botão de QR Code na lista de sessões

### Mensagem não envia
- Verifique se a sessão está com status "connected"
- Verifique se o número está no formato correto: 5511999999999

---

**🚀 Pronto! Agora é só implementar no Lovable!**
