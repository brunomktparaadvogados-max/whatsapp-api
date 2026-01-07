# 🚀 Integração WhatsApp com Lovable - Guia Simplificado

## 📋 O que você vai construir

Um sistema completo de WhatsApp integrado ao seu CRM, onde:
- ✅ Login automático detecta se você já tem WhatsApp conectado
- ✅ Se não tiver, mostra QR Code para conectar (apenas uma vez)
- ✅ Depois de conectar, nunca mais precisa escanear QR Code
- ✅ Envie e receba mensagens diretamente do seu CRM
- ✅ Tudo funciona automaticamente em background

---

## 🎯 Passo 1: Criar o Serviço de API

Crie o arquivo `src/services/whatsapp.service.ts`:

```typescript
const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

interface WhatsAppSession {
  status: 'checking' | 'not_created' | 'qr_ready' | 'connected' | 'disconnected';
  qrCode?: string;
  phoneNumber?: string;
  userName?: string;
}

class WhatsAppService {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('auth_token');
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Erro desconhecido' }));
      throw new Error(error.error || 'Erro na requisição');
    }

    return response.json();
  }

  async login(email: string, password: string) {
    const data = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }).then(res => res.json());

    if (data.token) {
      this.token = data.token;
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('user_info', JSON.stringify(data.user));
    }

    return data;
  }

  async getSessionStatus(): Promise<WhatsAppSession> {
    try {
      const data = await this.request('/api/my-session');
      
      return {
        status: data.status === 'connected' ? 'connected' : 'qr_ready',
        phoneNumber: data.info?.wid?.user,
        userName: data.info?.pushname,
      };
    } catch (error) {
      return { status: 'not_created' };
    }
  }

  async createSession() {
    return this.request('/api/sessions', { method: 'POST' });
  }

  async getQRCode(): Promise<WhatsAppSession> {
    try {
      const data = await this.request('/api/my-qr');
      
      if (data.status === 'connected') {
        return {
          status: 'connected',
          phoneNumber: data.info?.wid?.user,
          userName: data.info?.pushname,
        };
      }

      return {
        status: data.qrCode ? 'qr_ready' : 'checking',
        qrCode: data.qrCode,
      };
    } catch (error) {
      return { status: 'checking' };
    }
  }

  async sendMessage(phone: string, message: string) {
    return this.request('/api/messages/send', {
      method: 'POST',
      body: JSON.stringify({ to: phone, message }),
    });
  }

  logout() {
    this.token = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user_info');
  }
}

export const whatsappService = new WhatsAppService();
```

---

## 🎨 Passo 2: Criar Hook Personalizado

Crie o arquivo `src/hooks/useWhatsApp.ts`:

```typescript
import { useState, useEffect, useCallback } from 'react';
import { whatsappService } from '@/services/whatsapp.service';
import { useToast } from '@/hooks/use-toast';

export function useWhatsApp() {
  const [status, setStatus] = useState<'checking' | 'not_created' | 'qr_ready' | 'connected' | 'disconnected'>('checking');
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const checkStatus = useCallback(async () => {
    try {
      const session = await whatsappService.getSessionStatus();
      setStatus(session.status);
      
      if (session.status === 'connected') {
        setPhoneNumber(session.phoneNumber || '');
        setUserName(session.userName || '');
        setQrCode(null);
      } else if (session.status === 'qr_ready') {
        fetchQRCode();
      }
    } catch (error) {
      setStatus('not_created');
    }
  }, []);

  const fetchQRCode = useCallback(async () => {
    try {
      const session = await whatsappService.getQRCode();
      
      if (session.status === 'connected') {
        setStatus('connected');
        setPhoneNumber(session.phoneNumber || '');
        setUserName(session.userName || '');
        setQrCode(null);
        
        toast({
          title: "✅ WhatsApp Conectado!",
          description: "Pronto para enviar mensagens",
        });
      } else if (session.qrCode) {
        setStatus('qr_ready');
        setQrCode(session.qrCode);
        
        // Verificar novamente em 10 segundos
        setTimeout(fetchQRCode, 10000);
      } else {
        // QR ainda não disponível
        setTimeout(fetchQRCode, 3000);
      }
    } catch (error) {
      console.error('Erro ao buscar QR Code:', error);
    }
  }, [toast]);

  const connect = useCallback(async () => {
    try {
      setLoading(true);
      const result = await whatsappService.createSession();
      
      if (result.status === 'connected') {
        setStatus('connected');
        toast({
          title: "✅ WhatsApp já conectado!",
          description: "Você já possui uma conexão ativa",
        });
        checkStatus();
      } else {
        toast({
          title: "Conectando WhatsApp...",
          description: "Aguarde o QR Code aparecer",
        });
        
        setTimeout(() => {
          fetchQRCode();
        }, 5000);
      }
    } catch (error: any) {
      toast({
        title: "Erro ao conectar",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [checkStatus, fetchQRCode, toast]);

  const sendMessage = useCallback(async (phone: string, message: string) => {
    try {
      setLoading(true);
      await whatsappService.sendMessage(phone, message);
      
      toast({
        title: "✅ Mensagem enviada!",
        description: `Enviado para ${phone}`,
      });
      
      return true;
    } catch (error: any) {
      toast({
        title: "Erro ao enviar",
        description: error.message,
        variant: "destructive",
      });
      return false;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  return {
    status,
    qrCode,
    phoneNumber,
    userName,
    loading,
    connect,
    sendMessage,
    refresh: checkStatus,
  };
}
```

---

## 📱 Passo 3: Criar Componente de Conexão

Crie o arquivo `src/components/WhatsAppConnect.tsx`:

```typescript
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, CheckCircle2, Smartphone } from 'lucide-react';

export function WhatsAppConnect() {
  const { status, qrCode, phoneNumber, userName, loading, connect, refresh } = useWhatsApp();

  if (status === 'checking') {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Verificando conexão...</span>
        </CardContent>
      </Card>
    );
  }

  if (status === 'connected') {
    return (
      <Card className="border-green-200 bg-green-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <CardTitle className="text-green-900">WhatsApp Conectado</CardTitle>
          </div>
          <CardDescription className="text-green-700">
            Sua conta está ativa e pronta para uso
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {userName && (
            <p className="text-sm">
              <span className="font-medium">Nome:</span> {userName}
            </p>
          )}
          {phoneNumber && (
            <p className="text-sm">
              <span className="font-medium">Telefone:</span> {phoneNumber}
            </p>
          )}
          <Button onClick={refresh} variant="outline" size="sm" className="mt-4">
            Atualizar Status
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (status === 'qr_ready' && qrCode) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Conectar WhatsApp</CardTitle>
          <CardDescription>
            Escaneie o QR Code com seu WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-center">
            <img 
              src={qrCode} 
              alt="QR Code WhatsApp" 
              className="w-64 h-64 border-4 border-primary rounded-lg"
            />
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-2">
            <p className="text-sm font-medium text-blue-900">Como conectar:</p>
            <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
              <li>Abra o WhatsApp no seu celular</li>
              <li>Toque em "Mais opções" ou "Configurações"</li>
              <li>Toque em "Aparelhos conectados"</li>
              <li>Toque em "Conectar um aparelho"</li>
              <li>Aponte seu celular para esta tela</li>
            </ol>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            Aguardando conexão... O QR Code atualiza automaticamente
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Smartphone className="h-6 w-6" />
          <CardTitle>Conectar WhatsApp</CardTitle>
        </div>
        <CardDescription>
          Conecte sua conta do WhatsApp para começar a enviar mensagens
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          onClick={connect} 
          disabled={loading}
          className="w-full"
          size="lg"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Conectando...
            </>
          ) : (
            <>
              <Smartphone className="mr-2 h-4 w-4" />
              Conectar WhatsApp
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## 💬 Passo 4: Criar Componente de Envio

Crie o arquivo `src/components/WhatsAppSend.tsx`:

```typescript
import { useState } from 'react';
import { useWhatsApp } from '@/hooks/useWhatsApp';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Send, Loader2 } from 'lucide-react';

export function WhatsAppSend() {
  const { status, loading, sendMessage } = useWhatsApp();
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!phone || !message) return;

    setSending(true);
    const success = await sendMessage(phone, message);
    setSending(false);

    if (success) {
      setMessage('');
    }
  };

  if (status !== 'connected') {
    return (
      <Card className="border-yellow-200 bg-yellow-50">
        <CardContent className="py-8 text-center">
          <p className="text-yellow-800">
            Conecte seu WhatsApp primeiro para enviar mensagens
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Enviar Mensagem</CardTitle>
        <CardDescription>
          Envie mensagens WhatsApp diretamente do CRM
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Número do WhatsApp</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="5511999999999"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
          />
          <p className="text-xs text-muted-foreground">
            Digite com código do país (ex: 5511999999999)
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="message">Mensagem</Label>
          <Textarea
            id="message"
            placeholder="Digite sua mensagem..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
          />
        </div>

        <Button 
          onClick={handleSend} 
          disabled={!phone || !message || sending || loading}
          className="w-full"
          size="lg"
        >
          {sending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Enviando...
            </>
          ) : (
            <>
              <Send className="mr-2 h-4 w-4" />
              Enviar Mensagem
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
```

---

## 🎯 Passo 5: Criar Página Principal

Crie o arquivo `src/pages/WhatsApp.tsx`:

```typescript
import { WhatsAppConnect } from '@/components/WhatsAppConnect';
import { WhatsAppSend } from '@/components/WhatsAppSend';

export default function WhatsAppPage() {
  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WhatsApp</h1>
          <p className="text-muted-foreground mt-2">
            Gerencie suas mensagens do WhatsApp
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <WhatsAppConnect />
          <WhatsAppSend />
        </div>
      </div>
    </div>
  );
}
```

---

## 🔐 Passo 6: Adicionar Login (se necessário)

Se seu app ainda não tem login, crie `src/components/Login.tsx`:

```typescript
import { useState } from 'react';
import { whatsappService } from '@/services/whatsapp.service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      setLoading(true);
      await whatsappService.login(email, password);
      
      toast({
        title: "Login realizado!",
        description: "Bem-vindo ao sistema",
      });
      
      onSuccess();
    } catch (error: any) {
      toast({
        title: "Erro no login",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Entrar no Sistema</CardTitle>
          <CardDescription>
            Digite suas credenciais para acessar
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Entrando...' : 'Entrar'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## 🚀 Passo 7: Integrar no App Principal

Atualize seu `src/App.tsx`:

```typescript
import { useState, useEffect } from 'react';
import { Login } from '@/components/Login';
import WhatsAppPage from '@/pages/WhatsApp';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    setIsAuthenticated(!!token);
  }, []);

  if (!isAuthenticated) {
    return <Login onSuccess={() => setIsAuthenticated(true)} />;
  }

  return <WhatsAppPage />;
}

export default App;
```

---

## ✅ Pronto! Como Funciona

### 🎯 Experiência do Usuário:

1. **Primeiro Acesso:**
   - Usuário faz login
   - Sistema verifica automaticamente se tem WhatsApp conectado
   - Se não tiver, mostra botão "Conectar WhatsApp"
   - Clica no botão → QR Code aparece
   - Escaneia QR Code no celular
   - ✅ Conectado! Nunca mais precisa escanear

2. **Próximos Acessos:**
   - Usuário faz login
   - Sistema detecta que WhatsApp já está conectado
   - Mostra "✅ WhatsApp Conectado"
   - Pode enviar mensagens imediatamente

3. **Enviando Mensagens:**
   - Digite o número (com código do país)
   - Digite a mensagem
   - Clique em "Enviar"
   - ✅ Mensagem enviada!

---

## 🎨 Personalização

### Cores e Tema
Todos os componentes usam o sistema de design do shadcn/ui. Para personalizar:

```typescript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#25D366', // Verde WhatsApp
          foreground: '#ffffff',
        },
      },
    },
  },
};
```

### Textos e Mensagens
Todos os textos estão nos componentes e podem ser facilmente alterados.

---

## 🔧 Troubleshooting

### "Verificando conexão..." não sai
- Verifique se o token está salvo: `localStorage.getItem('auth_token')`
- Verifique o console do navegador para erros

### QR Code não aparece
- Aguarde 10-15 segundos após clicar em "Conectar"
- Verifique sua conexão com a internet
- Tente fazer logout e login novamente

### Mensagem não envia
- Verifique se o WhatsApp está conectado (badge verde)
- Verifique o formato do número: `5511999999999`
- Verifique o console para erros

---

## 📱 Recursos Adicionais

### Receber Mensagens (Webhook)
Para receber mensagens, adicione um endpoint no seu backend e configure o webhook na API.

### Enviar Imagens
Use o endpoint `/api/sessions/:sessionId/messages/media` para enviar imagens.

### Múltiplas Sessões
Cada usuário tem sua própria sessão. O sistema gerencia automaticamente.

---

**🎉 Tudo pronto! Seu CRM agora tem WhatsApp integrado com uma experiência perfeita!**
