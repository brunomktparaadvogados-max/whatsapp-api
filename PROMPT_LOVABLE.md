# 🚀 PROMPT PARA O LOVABLE - INTEGRAÇÃO WHATSAPP API

Cole este prompt no chat do Lovable:

---

Atualize o sistema Flow para integrar com a API WhatsApp. Use estas informações:

**API URL:** https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app

## 1. AUTENTICAÇÃO

Implemente login com JWT:

```typescript
// Login
POST /api/auth/login
Body: { email: "admin@flow.com", password: "admin123" }
Retorna: { token, user, sessionId, sessionStatus }

// Verificar sessão
GET /api/auth/me
Headers: { Authorization: Bearer {token} }
Retorna: { user, session: { sessionId, status, qrCode, info } }
```

Salve o token no localStorage e use em todas as requisições.

## 2. CONEXÃO WHATSAPP

Crie componente para conectar WhatsApp:

```typescript
// Criar sessão
POST /api/sessions
Headers: { Authorization: Bearer {token} }

// Verificar status (polling a cada 3s)
GET /api/auth/me
- Se status = "qr_code": exibir session.qrCode (imagem base64)
- Se status = "connected": mostrar sucesso
```

Interface: QR Code grande, instruções claras, loading durante conexão.

## 3. ENVIAR MENSAGENS

```typescript
POST /api/messages/send
Headers: { Authorization: Bearer {token} }
Body: {
  to: "5511999999999",  // DDI + DDD + número (sem espaços)
  message: "Texto da mensagem"
}
```

Validar número, mostrar loading, feedback de sucesso/erro.

## 4. RECEBER MENSAGENS (WEBSOCKET)

```typescript
import { io } from 'socket.io-client';

const socket = io('https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app', {
  auth: { token }
});

// Eventos:
socket.on('qr_code', (data) => setQrCode(data.qrCode));
socket.on('session_connected', (data) => setConnected(true));
socket.on('new_message', (data) => addMessage(data.message));
socket.on('message_sent', (data) => addMessage(data.message));
socket.on('message_status', (data) => updateStatus(data));
```

## 5. CRM E CHAT

```typescript
// Listar contatos
GET /api/sessions/{sessionId}/contacts
Retorna: { contacts: [{ id, phone_number, name, unread_count, last_message_at }] }

// Histórico de mensagens
GET /api/sessions/{sessionId}/messages/{contactPhone}
Retorna: { messages: [{ id, body, from_me, timestamp, status }] }
```

Interface:
- Lista de contatos à esquerda (foto, nome, contador de não lidas)
- Chat à direita (histórico + input para enviar)
- Atualização em tempo real via WebSocket

## 6. ESTRUTURA DO COMPONENTE

```typescript
export default function WhatsAppChat() {
  const [token] = useState(localStorage.getItem('whatsapp_token'));
  const [socket, setSocket] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  // Conectar WebSocket
  useEffect(() => {
    const newSocket = io(API_URL, { auth: { token } });
    newSocket.on('new_message', handleNewMessage);
    setSocket(newSocket);
    return () => newSocket.disconnect();
  }, []);

  // Carregar contatos
  const loadContacts = async () => {
    const res = await fetch(`${API_URL}/api/sessions/user_1/contacts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setContacts(data.contacts);
  };

  // Carregar mensagens
  const loadMessages = async (phone) => {
    const res = await fetch(`${API_URL}/api/sessions/user_1/messages/${phone}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setMessages(data.messages);
  };

  // Enviar mensagem
  const sendMessage = async () => {
    await fetch(`${API_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to: selectedContact.phone_number, message: newMessage })
    });
    setNewMessage('');
  };

  return (
    <div className="flex h-screen">
      {/* Lista de Contatos */}
      <div className="w-1/3 border-r">
        {contacts.map(contact => (
          <div key={contact.id} onClick={() => setSelectedContact(contact)}>
            <span>{contact.name || contact.phone_number}</span>
            {contact.unread_count > 0 && <span>{contact.unread_count}</span>}
          </div>
        ))}
      </div>

      {/* Chat */}
      <div className="w-2/3 flex flex-col">
        <div className="flex-1 overflow-y-auto">
          {messages.map(msg => (
            <div key={msg.id} className={msg.from_me ? 'text-right' : 'text-left'}>
              {msg.body}
            </div>
          ))}
        </div>
        <div className="p-4 flex gap-2">
          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
          />
          <button onClick={sendMessage}>Enviar</button>
        </div>
      </div>
    </div>
  );
}
```

## 7. TRATAMENTO DE ERROS

```typescript
// Token expirado
if (response.status === 401) {
  localStorage.removeItem('whatsapp_token');
  navigate('/login');
}

// Sessão desconectada
if (error.includes('não conectada')) {
  toast.error('WhatsApp desconectado. Reconecte.');
  navigate('/whatsapp/connect');
}
```

## 8. CHECKLIST

Implemente nesta ordem:
1. ✅ Login e autenticação
2. ✅ Conexão WhatsApp (QR Code)
3. ✅ Envio de mensagens
4. ✅ WebSocket para recebimento
5. ✅ Lista de contatos
6. ✅ Interface de chat
7. ✅ Atualização em tempo real

Use shadcn/ui para componentes, Tailwind para estilização, e socket.io-client para WebSocket.

A API está funcionando perfeitamente. Todos os endpoints estão operacionais e testados.
