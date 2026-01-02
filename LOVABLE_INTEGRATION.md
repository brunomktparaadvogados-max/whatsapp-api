# 🔌 INTEGRAÇÃO LOVABLE - SISTEMA FLOW

## 📋 Código para colar no Chat do Lovable

Cole este prompt no chat do Lovable para adicionar a integração WhatsApp ao sistema Flow:

---

```
Preciso integrar o WhatsApp ao sistema Flow. Crie os seguintes componentes:

## 1. SERVIÇO DE API WHATSAPP (src/services/whatsappApi.ts)

```typescript
import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const WHATSAPP_API_URL = process.env.VITE_WHATSAPP_API_URL || 'http://localhost:3000';

class WhatsAppService {
  private token: string | null = null;
  private socket: Socket | null = null;

  setToken(token: string) {
    this.token = token;
    this.connectWebSocket();
  }

  private connectWebSocket() {
    if (this.socket) {
      this.socket.disconnect();
    }

    this.socket = io(WHATSAPP_API_URL);
    
    this.socket.on('connect', () => {
      console.log('WebSocket conectado');
      if (this.token) {
        this.socket?.emit('authenticate', this.token);
      }
    });

    this.socket.on('new_message', (data) => {
      window.dispatchEvent(new CustomEvent('whatsapp:new_message', { detail: data }));
    });

    this.socket.on('qr_code', (data) => {
      window.dispatchEvent(new CustomEvent('whatsapp:qr_code', { detail: data }));
    });

    this.socket.on('session_connected', (data) => {
      window.dispatchEvent(new CustomEvent('whatsapp:session_connected', { detail: data }));
    });

    this.socket.on('message_status', (data) => {
      window.dispatchEvent(new CustomEvent('whatsapp:message_status', { detail: data }));
    });
  }

  private getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  async login(email: string, password: string) {
    const response = await axios.post(`${WHATSAPP_API_URL}/api/auth/login`, {
      email,
      password
    });
    this.setToken(response.data.token);
    return response.data;
  }

  async register(email: string, password: string, name: string, company?: string) {
    const response = await axios.post(`${WHATSAPP_API_URL}/api/auth/register`, {
      email,
      password,
      name,
      company
    });
    this.setToken(response.data.token);
    return response.data;
  }

  async createSession(sessionId: string) {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/api/sessions`,
      { sessionId },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getSessions() {
    const response = await axios.get(
      `${WHATSAPP_API_URL}/api/sessions`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getQRCode(sessionId: string) {
    const response = await axios.get(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/qr`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async deleteSession(sessionId: string) {
    const response = await axios.delete(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async sendMessage(sessionId: string, to: string, message: string) {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/messages`,
      { to, message },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async sendMedia(sessionId: string, to: string, mediaUrl: string, caption?: string) {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/messages/media`,
      { to, mediaUrl, caption },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getContacts(sessionId: string) {
    const response = await axios.get(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/contacts`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getMessages(sessionId: string, contactPhone: string, limit = 100) {
    const response = await axios.get(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/contacts/${contactPhone}/messages?limit=${limit}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async createAutoReply(sessionId: string, triggerType: string, triggerValue: string, responseMessage: string) {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/auto-replies`,
      { triggerType, triggerValue, responseMessage },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async getAutoReplies(sessionId: string) {
    const response = await axios.get(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/auto-replies`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async deleteAutoReply(id: number) {
    const response = await axios.delete(
      `${WHATSAPP_API_URL}/api/auto-replies/${id}`,
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async scheduleMessage(sessionId: string, contactPhone: string, message: string, scheduledAt: string, mediaUrl?: string) {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/api/sessions/${sessionId}/scheduled-messages`,
      { contactPhone, message, scheduledAt, mediaUrl },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async configureMetaAPI(accessToken: string, phoneNumberId: string, businessAccountId?: string) {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/api/meta/config`,
      { accessToken, phoneNumberId, businessAccountId },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  async sendBulkMessages(contacts: string[], message: string, delayMs = 1000) {
    const response = await axios.post(
      `${WHATSAPP_API_URL}/api/meta/send-bulk`,
      { contacts, message, delayMs },
      { headers: this.getHeaders() }
    );
    return response.data;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

export const whatsappService = new WhatsAppService();
```

## 2. PÁGINA DE GERENCIAMENTO DE SESSÕES (src/pages/WhatsAppSessions.tsx)

Crie uma página com:
- Lista de sessões do usuário
- Botão para criar nova sessão
- Exibição de QR Code em modal
- Status de conexão em tempo real
- Botão para deletar sessão

## 3. PÁGINA DE CRM/CHAT (src/pages/WhatsAppCRM.tsx)

Crie uma página estilo WhatsApp Web com:
- Sidebar esquerda: lista de contatos com última mensagem e contador de não lidas
- Área central: histórico de mensagens do contato selecionado
- Input inferior: campo para digitar e enviar mensagens
- Botão para enviar mídia
- Atualização em tempo real via WebSocket

## 4. PÁGINA DE AUTOMAÇÕES (src/pages/WhatsAppAutomation.tsx)

Crie uma página com:
- Lista de respostas automáticas configuradas
- Formulário para criar nova resposta automática com:
  - Tipo de gatilho: palavra-chave, mensagem exata, primeira mensagem
  - Valor do gatilho
  - Mensagem de resposta
- Botão para deletar resposta automática

## 5. PÁGINA DE AGENDAMENTO (src/pages/WhatsAppSchedule.tsx)

Crie uma página com:
- Formulário para agendar mensagem:
  - Sessão
  - Número do contato
  - Mensagem
  - Data e hora
  - URL de mídia (opcional)
- Lista de mensagens agendadas

## 6. PÁGINA DE CONFIGURAÇÃO META API (src/pages/WhatsAppMetaConfig.tsx)

Crie uma página com:
- Formulário para configurar Meta API:
  - Access Token
  - Phone Number ID
  - Business Account ID (opcional)
- Instruções de como obter essas credenciais
- Seção para envio em massa com:
  - Upload de lista de contatos (CSV ou manual)
  - Mensagem
  - Delay entre envios
  - Botão para iniciar disparo

## 7. ADICIONAR ROTAS NO APP

Adicione as rotas no router principal:
- /whatsapp/sessions
- /whatsapp/crm
- /whatsapp/automation
- /whatsapp/schedule
- /whatsapp/meta-config

## 8. ADICIONAR MENU DE NAVEGAÇÃO

Adicione item "WhatsApp" no menu principal com submenu:
- Sessões
- CRM/Chat
- Automações
- Agendamento
- Configuração Meta

## 9. VARIÁVEL DE AMBIENTE

Adicione no .env:
```
VITE_WHATSAPP_API_URL=http://localhost:3000
```

## 10. INTEGRAÇÃO COM SISTEMA FLOW EXISTENTE

- Integre o WhatsApp com o CRM existente do Flow
- Sincronize contatos do WhatsApp com contatos do sistema
- Adicione histórico de conversas WhatsApp no perfil do cliente
- Permita enviar mensagens WhatsApp diretamente do CRM

Use Shadcn/UI para todos os componentes. Implemente com TypeScript e React Query para cache.
```

---

## 🎯 INSTRUÇÕES DE USO

### 1. Configure a API WhatsApp

No terminal do servidor:

```bash
cd whatsapp-api
npm install
npm start
```

### 2. Cole o código acima no Lovable

Copie todo o prompt acima e cole no chat do Lovable. Ele criará automaticamente:
- Serviço de integração
- Páginas de gerenciamento
- Componentes de UI
- Rotas e navegação

### 3. Configure no sistema Flow

Após o Lovable criar os componentes:

1. **Login no WhatsApp API**
   - Use: admin@flow.com / admin123
   - Ou crie novo usuário

2. **Criar Sessão**
   - Vá em WhatsApp > Sessões
   - Clique em "Nova Sessão"
   - Digite um ID único (ex: usuario-123)
   - Escaneie o QR Code

3. **Usar o CRM**
   - Vá em WhatsApp > CRM/Chat
   - Veja todos os contatos
   - Clique em um contato para ver histórico
   - Envie mensagens em tempo real

4. **Configurar Automações**
   - Vá em WhatsApp > Automações
   - Crie respostas automáticas
   - Tipos disponíveis:
     - **keyword**: responde quando detecta palavra-chave
     - **exact**: responde apenas se mensagem for exata
     - **first_message**: responde na primeira mensagem do contato

5. **Agendar Mensagens**
   - Vá em WhatsApp > Agendamento
   - Preencha formulário
   - Mensagens são enviadas automaticamente no horário

6. **Configurar Meta API (Envio em Massa)**
   - Vá em WhatsApp > Configuração Meta
   - Obtenha credenciais em: https://developers.facebook.com
   - Configure Access Token e Phone Number ID
   - Use para envios em massa sem bloqueio

## 🔐 AUTENTICAÇÃO POR USUÁRIO

Cada usuário do sistema Flow terá:
- Login próprio na API WhatsApp
- Sessões isoladas
- Histórico de conversas separado
- Automações individuais

## 📊 RECURSOS DO CRM

- ✅ Histórico completo de conversas
- ✅ Status de entrega (enviado, entregue, lido)
- ✅ Contador de mensagens não lidas
- ✅ Busca de mensagens
- ✅ Envio de texto e mídia
- ✅ Atualização em tempo real
- ✅ Notificações de novas mensagens

## 🤖 AUTOMAÇÕES DISPONÍVEIS

### Respostas Automáticas
- Por palavra-chave
- Por mensagem exata
- Primeira mensagem (boas-vindas)

### Agendamento
- Mensagens futuras
- Campanhas programadas
- Lembretes automáticos

### Envio em Massa (Meta API)
- Sem bloqueio
- Com delay configurável
- Templates aprovados
- Relatório de envios

## 🔗 ENDPOINTS DA API

Todos os endpoints estão documentados e prontos para uso no Lovable.

**Base URL**: `http://localhost:3000/api`

**Autenticação**: Bearer Token no header `Authorization`

## 📱 FLUXO DE INTEGRAÇÃO

1. Usuário faz login no Flow
2. Flow autentica na API WhatsApp
3. Usuário cria sessão e escaneia QR Code
4. WhatsApp conecta via WebSocket
5. Mensagens aparecem em tempo real no CRM
6. Usuário responde pelo sistema Flow
7. Automações funcionam em background

## 🎨 DESIGN

O Lovable criará interface moderna com:
- Tema escuro/claro
- Responsivo mobile
- Animações suaves
- Ícones do Lucide
- Componentes Shadcn/UI

---

**Pronto! Agora você tem WhatsApp integrado ao Flow sem custos! 🎉**
