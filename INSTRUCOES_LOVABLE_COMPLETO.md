# 📱 INSTRUÇÕES PARA ATUALIZAR O SISTEMA FLOW (LOVABLE)

## 🎯 OBJETIVO
Atualizar o sistema Flow para enviar e receber mensagens do WhatsApp através da API corrigida, com foco especial no funcionamento do CRM e Chat.

---

## 📋 INFORMAÇÕES DA API ATUALIZADA

**URL da API:** `https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app`

**Credenciais de Teste:**
- Email: `admin@flow.com`
- Senha: `admin123`

**Status:** ✅ API corrigida e funcionando
- ✅ Banco de dados migrado
- ✅ Sessões restauradas automaticamente
- ✅ Envio de mensagens funcionando
- ✅ Recebimento de mensagens funcionando
- ✅ Webhook configurável

---

## 🔧 PASSO 1: ATUALIZAR VARIÁVEIS DE AMBIENTE

Cole no chat do Lovable:

```
Atualize a variável de ambiente do projeto:

VITE_WHATSAPP_API_URL=https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app

Certifique-se de que todas as chamadas à API usem esta URL base.
```

---

## 🔐 PASSO 2: IMPLEMENTAR AUTENTICAÇÃO

Cole no chat do Lovable:

```
Implemente o sistema de autenticação com a API WhatsApp:

1. ENDPOINT DE LOGIN:
POST /api/auth/login
Body: {
  "email": "usuario@exemplo.com",
  "password": "senha123"
}

Resposta:
{
  "success": true,
  "token": "JWT_TOKEN_AQUI",
  "user": {
    "id": 1,
    "email": "usuario@exemplo.com",
    "name": "Nome do Usuário",
    "company": "Empresa"
  },
  "sessionId": "user_1",
  "sessionStatus": "connected" // ou "not_created", "qr_code", etc
}

2. SALVAR TOKEN:
- Salve o token no localStorage: localStorage.setItem('whatsapp_token', token)
- Use o token em todas as requisições: Authorization: Bearer {token}

3. VERIFICAR SESSÃO:
GET /api/auth/me
Headers: { Authorization: Bearer {token} }

Resposta:
{
  "success": true,
  "user": { ... },
  "session": {
    "sessionId": "user_1",
    "status": "connected",
    "qrCode": null,
    "info": {
      "wid": "5511999999999@c.us",
      "pushname": "Nome no WhatsApp",
      "platform": "android"
    }
  }
}

Crie um hook useAuth() que gerencie login, logout e verificação de sessão.
```

---

## 📱 PASSO 3: IMPLEMENTAR CONEXÃO WHATSAPP

Cole no chat do Lovable:

```
Crie um componente WhatsAppConnection que:

1. VERIFICAR STATUS DA SESSÃO:
- Ao carregar, verificar GET /api/auth/me
- Se status = "not_created", mostrar botão "Conectar WhatsApp"
- Se status = "qr_code", mostrar QR Code
- Se status = "connected", mostrar status conectado

2. CRIAR SESSÃO (se não existir):
POST /api/sessions
Headers: { Authorization: Bearer {token} }
Body: {} // vazio, a API cria automaticamente

3. OBTER QR CODE:
- Após criar sessão, fazer polling a cada 3 segundos em GET /api/auth/me
- Quando status = "qr_code", exibir session.qrCode (é uma imagem base64)
- Continuar polling até status = "connected"

4. INTERFACE:
- Mostrar QR Code grande e claro
- Instruções: "Escaneie este QR Code com seu WhatsApp"
- Indicador de loading durante conexão
- Mensagem de sucesso quando conectar

Exemplo de código:

const connectWhatsApp = async () => {
  try {
    // Criar sessão
    await fetch(`${API_URL}/api/sessions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    // Iniciar polling para QR Code
    const interval = setInterval(async () => {
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      
      if (data.session.status === 'qr_code') {
        setQrCode(data.session.qrCode);
      } else if (data.session.status === 'connected') {
        clearInterval(interval);
        toast.success('WhatsApp conectado!');
      }
    }, 3000);
  } catch (error) {
    toast.error('Erro ao conectar WhatsApp');
  }
};
```

---

## 💬 PASSO 4: IMPLEMENTAR ENVIO DE MENSAGENS

Cole no chat do Lovable:

```
Atualize o sistema de envio de mensagens:

1. ENDPOINT DE ENVIO:
POST /api/messages/send
Headers: { Authorization: Bearer {token} }
Body: {
  "to": "5511999999999",  // número com DDI + DDD (sem espaços, sem +)
  "message": "Texto da mensagem"
}

Resposta:
{
  "success": true,
  "sessionId": "user_1",
  "messageId": "...",
  "timestamp": "..."
}

2. VALIDAÇÕES:
- Verificar se WhatsApp está conectado antes de enviar
- Validar formato do número (apenas dígitos, com DDI)
- Mostrar loading durante envio
- Mostrar confirmação de sucesso
- Tratar erros (sessão desconectada, número inválido, etc)

3. INTERFACE:
- Campo de input para número de telefone
- Campo de textarea para mensagem
- Botão "Enviar" com loading state
- Histórico de mensagens enviadas

Exemplo de código:

const sendMessage = async (to: string, message: string) => {
  try {
    setLoading(true);
    
    const response = await fetch(`${API_URL}/api/messages/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ to, message })
    });

    const data = await response.json();
    
    if (data.success) {
      toast.success('Mensagem enviada!');
      setMessage('');
    } else {
      toast.error(data.error || 'Erro ao enviar mensagem');
    }
  } catch (error) {
    toast.error('Erro ao enviar mensagem');
  } finally {
    setLoading(false);
  }
};
```

---

## 📥 PASSO 5: IMPLEMENTAR RECEBIMENTO DE MENSAGENS (WEBHOOK)

Cole no chat do Lovable:

```
Configure o recebimento de mensagens via webhook:

1. CRIAR ENDPOINT NO LOVABLE:
Crie um endpoint público que receberá as mensagens:
POST /api/webhook/whatsapp

Body que a API enviará:
{
  "event": "message",
  "sessionId": "user_1",
  "userId": 1,
  "message": {
    "id": "...",
    "from": "5511999999999",
    "body": "Texto da mensagem",
    "type": "chat",
    "timestamp": 1234567890,
    "mediaUrl": null,
    "mediaMimetype": null
  }
}

2. CONFIGURAR WEBHOOK NA API:
PUT /api/sessions/{sessionId}/webhook
Headers: { Authorization: Bearer {token} }
Body: {
  "webhookUrl": "https://seu-projeto.lovable.app/api/webhook/whatsapp"
}

3. PROCESSAR MENSAGENS RECEBIDAS:
- Salvar mensagem no banco de dados local (Supabase)
- Atualizar interface em tempo real
- Notificar usuário de nova mensagem
- Atualizar contador de mensagens não lidas

4. ALTERNATIVA - POLLING:
Se não conseguir criar webhook, use polling:

const checkNewMessages = async () => {
  const response = await fetch(`${API_URL}/api/sessions/${sessionId}/messages`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await response.json();
  // Processar novas mensagens
};

// Executar a cada 5 segundos
setInterval(checkNewMessages, 5000);
```

---

## 💼 PASSO 6: IMPLEMENTAR CRM E CHAT

Cole no chat do Lovable:

```
Atualize o sistema de CRM e Chat para funcionar com a API:

1. LISTAR CONTATOS:
GET /api/sessions/{sessionId}/contacts
Headers: { Authorization: Bearer {token} }

Resposta:
{
  "success": true,
  "contacts": [
    {
      "id": 1,
      "phone_number": "5511999999999",
      "name": "Nome do Contato",
      "profile_pic": "url_da_foto",
      "last_message_at": "2024-01-01T10:00:00Z",
      "unread_count": 3
    }
  ]
}

2. OBTER HISTÓRICO DE MENSAGENS:
GET /api/sessions/{sessionId}/messages/{contactPhone}
Headers: { Authorization: Bearer {token} }

Resposta:
{
  "success": true,
  "messages": [
    {
      "id": "...",
      "contact_phone": "5511999999999",
      "message_type": "chat",
      "body": "Texto da mensagem",
      "from_me": false,
      "timestamp": 1234567890,
      "status": "received",
      "created_at": "2024-01-01T10:00:00Z"
    }
  ]
}

3. INTERFACE DO CHAT:
- Lista de contatos à esquerda (com foto, nome, última mensagem, contador de não lidas)
- Área de conversa à direita (histórico de mensagens)
- Campo de input para enviar mensagem
- Atualização em tempo real (via webhook ou polling)

4. FUNCIONALIDADES:
- Assumir conversa (marcar como atendida)
- Marcar mensagens como lidas
- Buscar contatos
- Filtrar por status (não lidas, atendidas, etc)
- Enviar mensagens rápidas (templates)

Exemplo de estrutura:

<div className="flex h-screen">
  {/* Lista de Contatos */}
  <div className="w-1/3 border-r">
    <ContactList 
      contacts={contacts}
      onSelectContact={setSelectedContact}
      selectedContact={selectedContact}
    />
  </div>
  
  {/* Área de Chat */}
  <div className="w-2/3 flex flex-col">
    <ChatHeader contact={selectedContact} />
    <MessageList messages={messages} />
    <MessageInput onSend={sendMessage} />
  </div>
</div>
```

---

## 🔄 PASSO 7: IMPLEMENTAR WEBSOCKET (TEMPO REAL)

Cole no chat do Lovable:

```
Implemente conexão WebSocket para atualizações em tempo real:

1. CONECTAR AO WEBSOCKET:
import { io } from 'socket.io-client';

const socket = io('https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app', {
  auth: {
    token: localStorage.getItem('whatsapp_token')
  }
});

2. EVENTOS DISPONÍVEIS:

// QR Code gerado
socket.on('qr_code', (data) => {
  console.log('QR Code:', data.qrCode);
  setQrCode(data.qrCode);
});

// Sessão conectada
socket.on('session_connected', (data) => {
  console.log('WhatsApp conectado!', data.info);
  setConnected(true);
});

// Nova mensagem recebida
socket.on('new_message', (data) => {
  console.log('Nova mensagem:', data.message);
  addMessageToChat(data.message);
  updateContactList(data.message);
});

// Mensagem enviada
socket.on('message_sent', (data) => {
  console.log('Mensagem enviada:', data.message);
  addMessageToChat(data.message);
});

// Status da mensagem atualizado
socket.on('message_status', (data) => {
  console.log('Status:', data.status);
  updateMessageStatus(data.messageId, data.status);
});

// Sessão desconectada
socket.on('session_disconnected', (data) => {
  console.log('WhatsApp desconectado');
  setConnected(false);
});

3. ENTRAR NA SALA DO USUÁRIO:
socket.emit('join', { userId: user.id });

4. DESCONECTAR AO SAIR:
useEffect(() => {
  return () => {
    socket.disconnect();
  };
}, []);
```

---

## ✅ PASSO 8: CHECKLIST DE IMPLEMENTAÇÃO

Cole no chat do Lovable:

```
Implemente as seguintes funcionalidades na ordem:

✅ FASE 1 - AUTENTICAÇÃO:
- [ ] Tela de login
- [ ] Salvar token no localStorage
- [ ] Hook useAuth()
- [ ] Proteção de rotas

✅ FASE 2 - CONEXÃO WHATSAPP:
- [ ] Componente WhatsAppConnection
- [ ] Criar sessão
- [ ] Exibir QR Code
- [ ] Polling de status
- [ ] Indicador de conexão

✅ FASE 3 - ENVIO DE MENSAGENS:
- [ ] Formulário de envio
- [ ] Validação de número
- [ ] Envio via API
- [ ] Feedback de sucesso/erro
- [ ] Loading states

✅ FASE 4 - RECEBIMENTO DE MENSAGENS:
- [ ] Configurar webhook OU polling
- [ ] Processar mensagens recebidas
- [ ] Salvar no banco local
- [ ] Notificações

✅ FASE 5 - CRM E CHAT:
- [ ] Lista de contatos
- [ ] Histórico de mensagens
- [ ] Interface de chat
- [ ] Envio de mensagens no chat
- [ ] Contador de não lidas
- [ ] Busca de contatos

✅ FASE 6 - TEMPO REAL:
- [ ] Conexão WebSocket
- [ ] Eventos de mensagens
- [ ] Atualização automática
- [ ] Indicadores de status

✅ FASE 7 - MELHORIAS:
- [ ] Templates de mensagens
- [ ] Envio de mídia
- [ ] Filtros e busca
- [ ] Estatísticas
- [ ] Exportação de dados

Implemente cada fase completamente antes de passar para a próxima.
```

---

## 🐛 PASSO 9: TRATAMENTO DE ERROS

Cole no chat do Lovable:

```
Implemente tratamento de erros robusto:

1. ERROS COMUNS:

// Sessão não conectada
if (error.message.includes('não conectada')) {
  toast.error('WhatsApp desconectado. Reconecte escaneando o QR Code.');
  navigate('/whatsapp/connect');
}

// Token expirado
if (response.status === 401) {
  toast.error('Sessão expirada. Faça login novamente.');
  localStorage.removeItem('whatsapp_token');
  navigate('/login');
}

// Número inválido
if (error.message.includes('número inválido')) {
  toast.error('Número de telefone inválido. Use formato: 5511999999999');
}

// Sessão não encontrada
if (error.message.includes('não encontrada')) {
  toast.error('Sessão não encontrada. Crie uma nova conexão.');
  navigate('/whatsapp/connect');
}

2. RETRY AUTOMÁTICO:
const fetchWithRetry = async (url, options, retries = 3) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    if (retries > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return fetchWithRetry(url, options, retries - 1);
    }
    throw error;
  }
};

3. FALLBACK:
- Se WebSocket falhar, usar polling
- Se webhook falhar, usar polling
- Salvar mensagens localmente se API estiver offline
- Sincronizar quando API voltar
```

---

## 📚 PASSO 10: DOCUMENTAÇÃO E TESTES

Cole no chat do Lovable:

```
Adicione documentação e testes:

1. DOCUMENTAÇÃO:
- Adicione comentários nos componentes principais
- Crie README com instruções de uso
- Documente variáveis de ambiente necessárias

2. TESTES MANUAIS:
- [ ] Login funciona
- [ ] QR Code aparece
- [ ] Conexão WhatsApp funciona
- [ ] Envio de mensagem funciona
- [ ] Recebimento de mensagem funciona
- [ ] Chat atualiza em tempo real
- [ ] Lista de contatos atualiza
- [ ] Contador de não lidas funciona
- [ ] Busca de contatos funciona
- [ ] Logout funciona

3. LOGS:
- Adicione console.log em pontos críticos
- Use toast para feedback ao usuário
- Capture erros com try/catch
```

---

## 🎨 EXEMPLO COMPLETO DE COMPONENTE

```typescript
import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useToast } from '@/hooks/use-toast';

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

export default function WhatsAppChat() {
  const [token] = useState(localStorage.getItem('whatsapp_token'));
  const [socket, setSocket] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const { toast } = useToast();

  // Conectar WebSocket
  useEffect(() => {
    const newSocket = io(API_URL, {
      auth: { token }
    });

    newSocket.on('new_message', (data) => {
      if (data.message.contact_phone === selectedContact?.phone_number) {
        setMessages(prev => [...prev, data.message]);
      }
      loadContacts(); // Atualizar lista
    });

    setSocket(newSocket);

    return () => newSocket.disconnect();
  }, [token]);

  // Carregar contatos
  const loadContacts = async () => {
    try {
      const response = await fetch(`${API_URL}/api/sessions/user_1/contacts`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await response.json();
      setContacts(data.contacts);
    } catch (error) {
      toast({ title: 'Erro ao carregar contatos', variant: 'destructive' });
    }
  };

  // Carregar mensagens
  const loadMessages = async (contactPhone) => {
    try {
      const response = await fetch(
        `${API_URL}/api/sessions/user_1/messages/${contactPhone}`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      const data = await response.json();
      setMessages(data.messages);
    } catch (error) {
      toast({ title: 'Erro ao carregar mensagens', variant: 'destructive' });
    }
  };

  // Enviar mensagem
  const sendMessage = async () => {
    if (!newMessage.trim()) return;

    try {
      const response = await fetch(`${API_URL}/api/messages/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: selectedContact.phone_number,
          message: newMessage
        })
      });

      if (response.ok) {
        setNewMessage('');
        toast({ title: 'Mensagem enviada!' });
      }
    } catch (error) {
      toast({ title: 'Erro ao enviar mensagem', variant: 'destructive' });
    }
  };

  useEffect(() => {
    loadContacts();
  }, []);

  useEffect(() => {
    if (selectedContact) {
      loadMessages(selectedContact.phone_number);
    }
  }, [selectedContact]);

  return (
    <div className="flex h-screen">
      {/* Lista de Contatos */}
      <div className="w-1/3 border-r overflow-y-auto">
        {contacts.map(contact => (
          <div
            key={contact.id}
            onClick={() => setSelectedContact(contact)}
            className={`p-4 cursor-pointer hover:bg-gray-100 ${
              selectedContact?.id === contact.id ? 'bg-blue-50' : ''
            }`}
          >
            <div className="flex justify-between">
              <span className="font-semibold">{contact.name || contact.phone_number}</span>
              {contact.unread_count > 0 && (
                <span className="bg-green-500 text-white rounded-full px-2 py-1 text-xs">
                  {contact.unread_count}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 truncate">
              {contact.last_message_at}
            </p>
          </div>
        ))}
      </div>

      {/* Área de Chat */}
      <div className="w-2/3 flex flex-col">
        {selectedContact ? (
          <>
            {/* Header */}
            <div className="p-4 border-b">
              <h2 className="font-semibold">
                {selectedContact.name || selectedContact.phone_number}
              </h2>
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.from_me ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-xs px-4 py-2 rounded-lg ${
                      msg.from_me
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-200 text-black'
                    }`}
                  >
                    {msg.body}
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="p-4 border-t flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                placeholder="Digite sua mensagem..."
                className="flex-1 px-4 py-2 border rounded-lg"
              />
              <button
                onClick={sendMessage}
                className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
              >
                Enviar
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            Selecione um contato para iniciar a conversa
          </div>
        )}
      </div>
    </div>
  );
}
```

---

## 🚀 RESUMO FINAL

**Cole tudo isso no chat do Lovable em partes, seguindo a ordem dos passos.**

A API está funcionando perfeitamente agora. Todos os erros foram corrigidos:
- ✅ Banco de dados migrado
- ✅ Sessões restauradas automaticamente
- ✅ Envio e recebimento de mensagens funcionando
- ✅ WebSocket para tempo real
- ✅ Webhook configurável

Siga os passos acima e o sistema Flow estará totalmente integrado e funcional!
