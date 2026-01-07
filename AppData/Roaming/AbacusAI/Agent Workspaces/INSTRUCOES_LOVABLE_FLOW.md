# 🚀 INSTRUÇÕES PARA ATUALIZAR O LOVABLE/FLOW

## ✅ DEPLOY REALIZADO COM SUCESSO!

As alterações foram enviadas para o GitHub e o Koyeb fará o deploy automático em alguns minutos.

**URL da API:** `https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app`

---

## 🔧 PROBLEMA IDENTIFICADO

**Apenas o admin consegue enviar mensagens porque:**
- O sistema Flow/Lovable está usando o token do admin para TODOS os usuários
- Cada usuário precisa fazer seu próprio login e usar seu próprio token
- O sessionId deve ser `user_X` onde X é o ID do usuário

---

## 📝 CÓDIGO PARA ATUALIZAR NO LOVABLE

### 1. Criar arquivo `src/services/whatsappApi.ts`

```typescript
const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

class WhatsAppAPI {
  private token: string | null = null;
  private sessionId: string | null = null;
  private userId: number | null = null;

  constructor() {
    this.token = localStorage.getItem('whatsapp_token');
    this.sessionId = localStorage.getItem('whatsapp_sessionId');
    const userIdStr = localStorage.getItem('whatsapp_userId');
    this.userId = userIdStr ? parseInt(userIdStr) : null;
  }

  async login(email: string, password: string) {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Falha no login');
    }

    const data = await response.json();
    
    this.token = data.token;
    this.sessionId = data.sessionId;
    this.userId = data.user.id;
    
    localStorage.setItem('whatsapp_token', data.token);
    localStorage.setItem('whatsapp_sessionId', data.sessionId);
    localStorage.setItem('whatsapp_userId', data.user.id.toString());
    localStorage.setItem('whatsapp_user', JSON.stringify(data.user));
    
    return data;
  }

  async sendMessage(to: string, message: string) {
    if (!this.token || !this.sessionId) {
      throw new Error('Usuário não autenticado. Faça login primeiro.');
    }

    const response = await fetch(`${API_URL}/api/sessions/${this.sessionId}/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ to, message })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao enviar mensagem');
    }

    return response.json();
  }

  async configureWebhook(webhookUrl: string) {
    if (!this.token || !this.sessionId) {
      throw new Error('Usuário não autenticado');
    }

    const response = await fetch(`${API_URL}/api/sessions/${this.sessionId}/webhook`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`
      },
      body: JSON.stringify({ webhookUrl })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Erro ao configurar webhook');
    }

    return response.json();
  }

  async getSessionStatus() {
    if (!this.token) {
      throw new Error('Usuário não autenticado');
    }

    const response = await fetch(`${API_URL}/api/auth/me`, {
      headers: { 'Authorization': `Bearer ${this.token}` }
    });

    if (!response.ok) {
      throw new Error('Erro ao verificar status');
    }

    return response.json();
  }

  logout() {
    this.token = null;
    this.sessionId = null;
    this.userId = null;
    localStorage.removeItem('whatsapp_token');
    localStorage.removeItem('whatsapp_sessionId');
    localStorage.removeItem('whatsapp_userId');
    localStorage.removeItem('whatsapp_user');
  }

  isAuthenticated(): boolean {
    return !!this.token && !!this.sessionId;
  }

  getCurrentUser() {
    const userStr = localStorage.getItem('whatsapp_user');
    return userStr ? JSON.parse(userStr) : null;
  }
}

export const whatsappApi = new WhatsAppAPI();
```

---

### 2. Criar endpoint para receber webhooks (Backend do Flow)

```typescript
// No backend do sistema Flow/Lovable
app.post('/api/whatsapp/webhook', async (req, res) => {
  try {
    const { event, sessionId, userId, message } = req.body;

    console.log('📥 Webhook recebido:', { event, sessionId, userId });

    if (event === 'message') {
      // Salvar mensagem no banco do Flow
      await db.messages.create({
        session_id: sessionId,
        user_id: userId,
        phone: message.from,
        message_text: message.body,
        message_type: message.type,
        direction: 'received',
        timestamp: new Date(message.timestamp * 1000),
        whatsapp_message_id: message.id
      });

      // Notificar usuário via WebSocket ou evento
      console.log('✅ Mensagem salva:', message.body);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).json({ error: error.message });
  }
});
```

---

### 3. Atualizar componente de Login

```typescript
import { whatsappApi } from '@/services/whatsappApi';

function WhatsAppLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await whatsappApi.login(email, password);
      
      console.log('✅ Login realizado:', data);
      
      // Configurar webhook
      const webhookUrl = 'https://seu-sistema-flow.com/api/whatsapp/webhook';
      await whatsappApi.configureWebhook(webhookUrl);
      
      console.log('✅ Webhook configurado');
      
      // Redirecionar ou atualizar UI
      window.location.href = '/dashboard';
      
    } catch (error) {
      console.error('❌ Erro no login:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleLogin}>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Senha"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Entrando...' : 'Entrar'}
      </button>
    </form>
  );
}
```

---

### 4. Atualizar componente de Envio de Mensagens

```typescript
import { whatsappApi } from '@/services/whatsappApi';

function SendMessage() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await whatsappApi.sendMessage(phone, message);
      
      console.log('✅ Mensagem enviada com sucesso');
      alert('Mensagem enviada!');
      
      setMessage('');
      
    } catch (error) {
      console.error('❌ Erro ao enviar:', error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSend}>
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="5511999999999"
        required
      />
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Digite sua mensagem"
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? 'Enviando...' : 'Enviar'}
      </button>
    </form>
  );
}
```

---

## 🧪 COMO TESTAR

### 1. Testar Login de Usuário Não-Admin

```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "elainecnassif@gmail.com", "password": "senha_aqui"}'
```

### 2. Testar Envio de Mensagem

```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/sessions/user_2/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"to": "5511999999999", "message": "Teste"}'
```

### 3. Configurar Webhook

```bash
curl -X PUT https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/sessions/user_2/webhook \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer SEU_TOKEN" \
  -d '{"webhookUrl": "https://seu-sistema-flow.com/api/whatsapp/webhook"}'
```

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Criar arquivo `src/services/whatsappApi.ts` no Lovable
- [ ] Criar endpoint `/api/whatsapp/webhook` no backend do Flow
- [ ] Atualizar componente de login para usar `whatsappApi.login()`
- [ ] Configurar webhook após login bem-sucedido
- [ ] Atualizar componente de envio para usar `whatsappApi.sendMessage()`
- [ ] Remover qualquer código que use token hardcoded do admin
- [ ] Testar login com usuário não-admin
- [ ] Testar envio de mensagem com usuário não-admin
- [ ] Testar recebimento de mensagens via webhook

---

## 🔍 VERIFICAÇÕES IMPORTANTES

1. **Cada usuário deve fazer login separadamente**
   - Não compartilhar tokens entre usuários
   - Cada usuário tem seu próprio `sessionId` (user_1, user_2, etc)

2. **Token deve ser enviado em todas as requisições**
   - Header: `Authorization: Bearer TOKEN`

3. **SessionId correto deve ser usado**
   - Usar o sessionId retornado no login
   - Formato: `user_X` onde X é o ID do usuário

4. **Webhook deve ser configurado após login**
   - URL do webhook deve estar acessível publicamente
   - Endpoint deve aceitar POST com JSON

---

## 📞 SUPORTE

Se ainda houver problemas:

1. Verificar logs no console do navegador
2. Verificar se o token está sendo salvo no localStorage
3. Verificar se o sessionId está correto
4. Verificar se o webhook está recebendo as mensagens
5. Verificar logs no Koyeb: https://app.koyeb.com

---

## 🎯 RESULTADO ESPERADO

Após implementar essas alterações:

✅ Cada usuário poderá fazer login com suas próprias credenciais
✅ Cada usuário poderá enviar mensagens usando seu próprio WhatsApp
✅ Mensagens recebidas serão enviadas via webhook para o sistema Flow
✅ Sistema Flow receberá e processará mensagens de todos os usuários
✅ Não haverá mais problema de "apenas admin envia mensagens"
