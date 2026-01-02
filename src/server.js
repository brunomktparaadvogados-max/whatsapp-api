const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const DatabaseManager = require('./database');
const SessionManager = require('./SessionManager');
const MetaWhatsAppAPI = require('./MetaAPI');
const { generateToken, authMiddleware } = require('./auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseManager();
const sessionManager = new SessionManager(db, io);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static('public'));

io.on('connection', (socket) => {
  console.log('Cliente WebSocket conectado:', socket.id);

  socket.on('authenticate', (token) => {
    const jwt = require('jsonwebtoken');
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'seu-secret-super-seguro-mude-isso');
      socket.join(`user_${decoded.userId}`);
      socket.emit('authenticated', { success: true });
    } catch (error) {
      socket.emit('auth_error', { error: 'Token inválido' });
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente WebSocket desconectado:', socket.id);
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, company } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome são obrigatórios' });
    }

    const existingUser = await db.getUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email já cadastrado' });
    }

    const userId = await db.createUser(email, password, name, company);
    const token = generateToken(userId);

    res.json({
      success: true,
      token,
      user: { id: userId, email, name, company }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    }

    const user = await db.getUserByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const isValidPassword = db.verifyPassword(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId é obrigatório' });
    }

    const session = await sessionManager.createSession(sessionId, req.userId);

    res.json({
      success: true,
      sessionId: session.id,
      status: session.status,
      message: 'Sessão criada com sucesso. Aguarde o QR Code.'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const sessions = await db.getSessionsByUserId(req.userId);

    const sessionsWithStatus = sessions.map(session => {
      const liveSession = sessionManager.getSession(session.id);
      return {
        ...session,
        status: liveSession ? liveSession.status : session.status,
        info: liveSession ? liveSession.info : null
      };
    });

    res.json({ success: true, sessions: sessionsWithStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const dbSession = await db.getSession(sessionId);

    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const liveSession = sessionManager.getSession(sessionId);

    res.json({
      success: true,
      session: {
        ...dbSession,
        status: liveSession ? liveSession.status : dbSession.status,
        info: liveSession ? liveSession.info : null
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/qr', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const dbSession = await db.getSession(sessionId);

    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const session = sessionManager.getSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Sessão não está ativa' });
    }

    if (!session.qrCode) {
      return res.status(404).json({
        error: 'QR Code não disponível',
        status: session.status
      });
    }

    res.json({
      success: true,
      qrCode: session.qrCode,
      status: session.status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const dbSession = await db.getSession(sessionId);

    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    await sessionManager.deleteSession(sessionId);

    res.json({
      success: true,
      message: 'Sessão deletada com sucesso'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/messages', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, message } = req.body;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (!to || !message) {
      return res.status(400).json({
        error: 'Campos "to" e "message" são obrigatórios'
      });
    }

    const result = await sessionManager.sendMessage(sessionId, to, message);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/messages/media', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, mediaUrl, caption } = req.body;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (!to || !mediaUrl) {
      return res.status(400).json({
        error: 'Campos "to" e "mediaUrl" são obrigatórios'
      });
    }

    const result = await sessionManager.sendMedia(sessionId, to, mediaUrl, caption);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/contacts', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const contacts = await db.getContactsBySession(sessionId);

    res.json({
      success: true,
      contacts
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/contacts/:contactPhone/messages', authMiddleware, async (req, res) => {
  try {
    const { sessionId, contactPhone } = req.params;
    const { limit = 100 } = req.query;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const messages = await db.getMessagesByContact(sessionId, contactPhone, parseInt(limit));

    res.json({
      success: true,
      messages: messages.reverse()
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/auto-replies', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { triggerType, triggerValue, responseMessage } = req.body;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (!triggerType || !triggerValue || !responseMessage) {
      return res.status(400).json({
        error: 'Campos triggerType, triggerValue e responseMessage são obrigatórios'
      });
    }

    const result = await db.createAutoReply(sessionId, triggerType, triggerValue, responseMessage);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: 'Resposta automática criada com sucesso'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/auto-replies', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const autoReplies = await db.getAutoReplies(sessionId);

    res.json({
      success: true,
      autoReplies
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/auto-replies/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;

    await db.deleteAutoReply(id);

    res.json({
      success: true,
      message: 'Resposta automática deletada'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/scheduled-messages', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { contactPhone, message, mediaUrl, scheduledAt } = req.body;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (!contactPhone || !message || !scheduledAt) {
      return res.status(400).json({
        error: 'Campos contactPhone, message e scheduledAt são obrigatórios'
      });
    }

    const result = await db.createScheduledMessage(sessionId, contactPhone, message, mediaUrl, scheduledAt);

    res.json({
      success: true,
      id: result.lastInsertRowid,
      message: 'Mensagem agendada com sucesso'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/meta/config', authMiddleware, async (req, res) => {
  try {
    const { accessToken, phoneNumberId, businessAccountId } = req.body;

    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({
        error: 'Campos accessToken e phoneNumberId são obrigatórios'
      });
    }

    const result = await db.saveMetaConfig(req.userId, accessToken, phoneNumberId, businessAccountId);

    res.json({
      success: true,
      message: 'Configuração Meta salva com sucesso'
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/meta/config', authMiddleware, async (req, res) => {
  try {
    const metaConfig = await db.getMetaConfig(req.userId);

    if (!metaConfig) {
      return res.json({
        success: true,
        configured: false,
        config: null
      });
    }

    res.json({
      success: true,
      configured: true,
      config: {
        phoneNumberId: metaConfig.phone_number_id,
        businessAccountId: metaConfig.business_account_id,
        hasAccessToken: !!metaConfig.access_token
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/meta/send', authMiddleware, async (req, res) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        error: 'Campos "to" e "message" são obrigatórios'
      });
    }

    const metaConfig = await db.getMetaConfig(req.userId);
    if (!metaConfig) {
      return res.status(400).json({
        error: 'Configure a API do Meta primeiro em /api/meta/config'
      });
    }

    const metaAPI = new MetaWhatsAppAPI(metaConfig.access_token, metaConfig.phone_number_id);
    const result = await metaAPI.sendMessage(to, message);

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/meta/send-media', authMiddleware, async (req, res) => {
  try {
    const { to, mediaType, mediaUrl, caption } = req.body;

    if (!to || !mediaType || !mediaUrl) {
      return res.status(400).json({
        error: 'Campos "to", "mediaType" e "mediaUrl" são obrigatórios'
      });
    }

    const metaConfig = await db.getMetaConfig(req.userId);
    if (!metaConfig) {
      return res.status(400).json({
        error: 'Configure a API do Meta primeiro em /api/meta/config'
      });
    }

    const metaAPI = new MetaWhatsAppAPI(metaConfig.access_token, metaConfig.phone_number_id);
    const result = await metaAPI.sendMedia(to, mediaType, mediaUrl, caption);

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/meta/send-template', authMiddleware, async (req, res) => {
  try {
    const { to, templateName, languageCode = 'pt_BR', components = [] } = req.body;

    if (!to || !templateName) {
      return res.status(400).json({
        error: 'Campos "to" e "templateName" são obrigatórios'
      });
    }

    const metaConfig = await db.getMetaConfig(req.userId);
    if (!metaConfig) {
      return res.status(400).json({
        error: 'Configure a API do Meta primeiro em /api/meta/config'
      });
    }

    const metaAPI = new MetaWhatsAppAPI(metaConfig.access_token, metaConfig.phone_number_id);
    const result = await metaAPI.sendTemplate(to, templateName, languageCode, components);

    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/meta/send-bulk', authMiddleware, async (req, res) => {
  try {
    const { contacts, message, delayMs = 1000 } = req.body;

    if (!contacts || !Array.isArray(contacts) || !message) {
      return res.status(400).json({
        error: 'Campos contacts (array) e message são obrigatórios'
      });
    }

    const metaConfig = await db.getMetaConfig(req.userId);
    if (!metaConfig) {
      return res.status(400).json({
        error: 'Configure a API do Meta primeiro em /api/meta/config'
      });
    }

    const metaAPI = new MetaWhatsAppAPI(metaConfig.access_token, metaConfig.phone_number_id);
    const results = await metaAPI.sendBulkMessages(contacts, message, delayMs);

    res.json({
      success: true,
      results
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

cron.schedule('* * * * *', async () => {
  const pendingMessages = await db.getPendingScheduledMessages();

  for (const msg of pendingMessages) {
    try {
      if (msg.media_url) {
        await sessionManager.sendMedia(msg.session_id, msg.contact_phone, msg.media_url, msg.message);
      } else {
        await sessionManager.sendMessage(msg.session_id, msg.contact_phone, msg.message);
      }

      await db.updateScheduledMessageStatus(msg.id, 'sent', new Date().toISOString());
    } catch (error) {
      console.error(`Erro ao enviar mensagem agendada ${msg.id}:`, error);
      await db.updateScheduledMessageStatus(msg.id, 'failed');
    }
  }
});

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

async function initializeDefaultSession() {
  try {
    const defaultSessionId = 'WhatsApp';
    const adminUser = await db.getUserByEmail('admin@flow.com');

    if (!adminUser) {
      console.log('⚠️ Usuário admin não encontrado. Sessão padrão não criada.');
      return;
    }

    const existingSession = await db.getSession(defaultSessionId);

    if (!existingSession) {
      console.log('📱 Criando sessão padrão "WhatsApp"...');
      await sessionManager.createSession(defaultSessionId, adminUser.id);
      console.log('✅ Sessão padrão "WhatsApp" criada com sucesso!');
      console.log(`🔗 Acesse http://${HOST}:${PORT} para escanear o QR Code`);
    } else {
      console.log('✅ Sessão padrão "WhatsApp" já existe');
    }
  } catch (error) {
    console.error('❌ Erro ao criar sessão padrão:', error.message);
  }
}

server.listen(PORT, HOST, async () => {
  console.log(`🚀 WhatsApp API + CRM rodando em http://${HOST}:${PORT}`);
  console.log(`📱 Interface web: http://${HOST}:${PORT}`);
  console.log(`🔌 WebSocket ativo para chat em tempo real`);
  console.log(`💚 Sistema completo com autenticação, CRM e automações`);
  console.log(`\n👤 Login padrão: admin@flow.com / admin123`);

  await initializeDefaultSession();
});
