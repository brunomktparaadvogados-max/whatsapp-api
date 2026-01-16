# 🚀 API WhatsApp + CRM Integrado

API REST completa para WhatsApp com sistema de CRM que move leads automaticamente baseado em palavras-chave.

## ✨ Funcionalidades

### WhatsApp
- ✅ Conexão via QR Code
- ✅ Envio de mensagens
- ✅ Recebimento de mensagens via WebSocket
- ✅ Suporte a mídia (imagens, áudios, vídeos)
- ✅ Lista de contatos
- ✅ Histórico de conversas
- ✅ Webhook para integração

### CRM
- ✅ Movimentação automática de leads
- ✅ Detecção de palavras-chave
- ✅ Notificações em tempo real via WebSocket
- ✅ API REST para gerenciar leads
- ✅ Histórico de movimentações

## 🎯 Palavras-chave Configuradas

| Palavra-chave | Estágio | Descrição |
|---------------|---------|-----------|
| "interessado" | qualified | Lead qualificado |
| "quero saber mais" | qualified | Lead qualificado |
| "não tenho interesse" | lost | Lead perdido |
| "já comprei" | won | Lead ganho |

## 🚀 Deploy Rápido

```bash
# 1. Clone o repositório
git clone https://github.com/seu-usuario/whatsapp-api.git
cd whatsapp-api

# 2. Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com suas credenciais

# 3. Faça deploy no Render
# Siga o guia: DEPLOY_RAPIDO.md
```

## 📚 Documentação

- [Guia de Deploy Rápido](DEPLOY_RAPIDO.md) - Deploy em 5 minutos
- [Guia Completo de Deploy](GUIA_DEPLOY_CORRIGIDO.md) - Documentação detalhada
- [Resumo da Correção CRM](RESUMO_CORRECAO_CRM.md) - Como funciona o CRM

## 🔗 Endpoints Principais

### Autenticação
```bash
POST /api/auth/login
POST /api/auth/register
```

### Sessões WhatsApp
```bash
GET /api/sessions
POST /api/sessions
DELETE /api/sessions/:id
GET /api/sessions/:id/qr
```

### Mensagens
```bash
POST /api/messages/send
GET /api/sessions/:id/messages
```

### CRM - Leads
```bash
GET /api/leads
GET /api/leads/:contactPhone
PUT /api/leads/:contactPhone
```

## 🧪 Testar

```bash
# Testar API
chmod +x testar_api_crm.sh
./testar_api_crm.sh

# Ou manualmente
curl https://seu-servico.onrender.com/health
```

## 🔧 Tecnologias

- **Node.js** - Runtime
- **Express** - Framework web
- **whatsapp-web.js** - Cliente WhatsApp
- **Socket.io** - WebSocket
- **PostgreSQL** - Banco de dados (Supabase)
- **Puppeteer** - Automação do navegador

## 📊 Fluxo de Funcionamento

### Enviar Mensagem
```
Lovable → API → WhatsApp → Contato
```

### Receber Mensagem + Mover Lead
```
Contato → WhatsApp → API → Detecta palavra-chave → Move lead → WebSocket → Lovable
```

## 🌐 Integração com Lovable

```typescript
// src/services/whatsappApi.ts
const API_URL = import.meta.env.VITE_WHATSAPP_API_URL;

export const whatsappApi = {
  login: async (email, password) => { ... },
  sendMessage: async (token, sessionId, to, message) => { ... },
  getLeads: async (token) => { ... },
  updateLead: async (token, contactPhone, stage) => { ... }
}

// Escutar eventos
socket.on('new_message', (data) => { ... });
socket.on('lead_moved', (data) => { ... });
```

## 🐛 Troubleshooting

### Deploy falhou
- Verifique os logs no Render
- Confirme que o `DATABASE_URL` está configurado

### Leads não estão sendo movidos
- Verifique se a mensagem contém uma palavra-chave
- Veja os logs da API

### WhatsApp não conecta
- Aguarde 2-3 minutos após escanear o QR Code
- Verifique se o Chromium está instalado

## 📝 Variáveis de Ambiente

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
JWT_SECRET=seu-secret-aqui
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch: `git checkout -b feature/nova-funcionalidade`
3. Commit: `git commit -m 'feat: adiciona nova funcionalidade'`
4. Push: `git push origin feature/nova-funcionalidade`
5. Abra um Pull Request

## 📄 Licença

MIT

## 👨‍💻 Autor

Sistema Flow - Automação de WhatsApp + CRM

---

**⚡ Deploy em 5 minutos | 🚀 Pronto para produção | 💪 100% funcional**
