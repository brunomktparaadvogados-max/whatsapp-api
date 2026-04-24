const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

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

    const sessionId = `user_${userId}`;

    setImmediate(async () => {
      try {
        console.log(`🔄 Criando sessão automática para usuário ${userId}...`);
        await sessionManager.createSession(sessionId, userId);
        console.log(`✅ Sessão ${sessionId} criada com sucesso`);
      } catch (error) {
        console.error(`❌ Erro ao criar sessão automática para usuário ${userId}:`, error.message);
      }
    });

    res.json({
      success: true,
      token,
      user: { id: userId, email, name, company },
      sessionId: sessionId,
      message: 'Usuário criado! Sua sessão WhatsApp está sendo inicializada em background.'
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
    const sessionId = `user_${user.id}`;

    const existingSession = sessionManager.getSession(sessionId);
    let sessionStatus = 'not_found';

    if (existingSession) {
      sessionStatus = existingSession.status;
    } else {
      setImmediate(async () => {
        try {
          console.log(`🔄 Criando sessão automática para usuário ${user.id} no login...`);
          await sessionManager.createSession(sessionId, user.id);
          console.log(`✅ Sessão ${sessionId} criada com sucesso`);
        } catch (error) {
          console.error(`❌ Erro ao criar sessão automática:`, error.message);
        }
      });
      sessionStatus = 'initializing';
    }

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        company: user.company
      },
      sessionId: sessionId,
      sessionStatus: sessionStatus
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

    const sessionId = `user_${req.userId}`;
    const session = sessionManager.getSession(sessionId);

    let sessionInfo = {
      sessionId: sessionId,
      status: 'not_created',
      qrCode: null
    };

    if (session) {
      sessionInfo = {
        sessionId: session.id,
        status: session.status,
        qrCode: session.qrCode,
        info: session.info
      };
    }

    res.json({
      success: true,
      user,
      session: sessionInfo
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    const users = await db.getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/users/:userId', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    const userIdToDelete = parseInt(req.params.userId);
    if (userIdToDelete === req.userId) {
      return res.status(400).json({ error: 'Você não pode deletar sua própria conta.' });
    }

    const sessionId = `user_${userIdToDelete}`;
    const session = sessionManager.getSession(sessionId);
    if (session) {
      await sessionManager.deleteSession(sessionId);
    }

    await db.deleteUser(userIdToDelete);
    res.json({ success: true, message: 'Usuário deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/admin/cleanup-sessions', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    const allSessions = await db.getAllSessionsFromDB();
    let cleaned = 0;

    for (const session of allSessions) {
      const sessionId = session.id;

      if (!sessionId || sessionId === 'T' || sessionId === 'test' || sessionId === 'default') {
        await db.deleteSession(sessionId);
        cleaned++;
        continue;
      }

      if (!sessionId.startsWith('user_')) {
        await db.deleteSession(sessionId);
        cleaned++;
        continue;
      }

      const userId = parseInt(sessionId.replace('user_', ''));
      const user = await db.getUserById(userId);
      if (!user) {
        await db.deleteSession(sessionId);
        cleaned++;
      }
    }

    res.json({
      success: true,
      message: `${cleaned} sessões inválidas removidas`,
      cleaned
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', async (req, res) => {
  // SEMPRE retorna 200 para o Koyeb health check não falhar
  const response = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };

  try {
    const health = await sessionManager.healthCheck();
    const dbCapacity = await db.getDatabaseCapacityPercentage();
    const messagesCount = await db.getMessagesCount();
    const dbSize = await db.getDatabaseSize();

    response.database = {
      capacity: `${dbCapacity.toFixed(2)}%`,
      size: dbSize?.size || 'unknown',
      messages: messagesCount,
      status: dbCapacity < 80 ? 'healthy' : 'warning'
    };
    Object.assign(response, health);
  } catch (error) {
    response.database = { status: 'initializing', error: error.message };
  }

  res.json(response);
});

app.get('/api/health', async (req, res) => {
  try {
    const health = await sessionManager.healthCheck();
    const dbCapacity = await db.getDatabaseCapacityPercentage();
    const messagesCount = await db.getMessagesCount();
    const dbSize = await db.getDatabaseSize();

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        capacity: `${dbCapacity.toFixed(2)}%`,
        size: dbSize?.size || 'unknown',
        messages: messagesCount,
        status: dbCapacity < 80 ? 'healthy' : 'warning'
      },
      ...health
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message
    });
  }
});

app.get('/api/my-session', authMiddleware, async (req, res) => {
  try {
    const sessionId = `user_${req.userId}`;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ 
        error: 'Sessão não encontrada',
        message: 'Sua sessão ainda não foi criada. Faça login novamente ou aguarde a inicialização.'
      });
    }

    res.json({
      success: true,
      sessionId: session.id,
      status: session.status,
      qrCode: session.qrCode,
      info: session.info
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/my-qr', authMiddleware, async (req, res) => {
  try {
    const sessionId = `user_${req.userId}`;
    const session = sessionManager.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({ 
        error: 'Sessão não encontrada',
        message: 'Sua sessão ainda não foi criada. Aguarde alguns minutos após o login.'
      });
    }

    if (!session.qrCode) {
      return res.json({
        success: true,
        qrCode: null,
        status: session.status,
        message: (session.status === 'connected' || session.status === 'authenticated')
          ? 'WhatsApp já está conectado!'
          : 'QR Code ainda não disponível. Aguarde...'
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


app.post('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    // Se admin enviar sessionId no body, usar esse. Senão, usar o próprio userId
    let targetSessionId;
    let targetUserId;

    if (isAdmin && req.body.sessionId) {
      // Admin criando sessão para outro usuário
      targetSessionId = req.body.sessionId;
      // Extrair userId do sessionId (formato: user_X)
      targetUserId = parseInt(targetSessionId.replace('user_', ''));

      // Verificar se o usuário existe
      const targetUser = await db.getUserById(targetUserId);
      if (!targetUser) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
    } else {
      // Usuário criando sua própria sessão
      targetSessionId = `user_${req.userId}`;
      targetUserId = req.userId;
    }

    const existingSession = sessionManager.getSession(targetSessionId);
    if (existingSession) {
      // Se a sessão existe e está em estado ativo, retorna ela
      if (['connected', 'authenticated', 'qr_code', 'initializing'].includes(existingSession.status)) {
        return res.json({
          success: true,
          sessionId: existingSession.id,
          status: existingSession.status,
          qrCode: existingSession.qrCode || null,
          message: existingSession.status === 'connected' ? 'WhatsApp já está conectado!' : 'Sessão já existe. Aguarde o QR Code.'
        });
      }
      // Se está em estado morto (failed, disconnected, auth_failure), limpa e recria
      console.log(`🔄 Sessão ${targetSessionId} está em estado '${existingSession.status}', recriando...`);
    }

    setImmediate(async () => {
      try {
        console.log(`🔄 Criando sessão ${targetSessionId} para usuário ${targetUserId}...`);
        await sessionManager.createSession(targetSessionId, targetUserId);
        console.log(`✅ Sessão ${targetSessionId} criada`);
      } catch (error) {
        console.error(`❌ Erro ao criar sessão ${targetSessionId}:`, error.message);
        // Emite erro via Socket.IO para o frontend saber
        io.to(`user_${targetUserId}`).emit('session_error', {
          sessionId: targetSessionId,
          error: error.message
        });
      }
    });

    res.json({
      success: true,
      sessionId: targetSessionId,
      status: 'initializing',
      message: 'Sessão sendo criada. QR Code estará disponível em 30-60 segundos.'
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

    if (!dbSession) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    if (!isAdmin && dbSession.user_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const liveSession = sessionManager.getSession(sessionId);

    res.json({
      success: true,
      session: {
        ...dbSession,
        status: liveSession ? liveSession.status : dbSession.status,
        qrCode: liveSession ? liveSession.qrCode : null,
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

    if (!dbSession) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    if (!isAdmin && dbSession.user_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
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

    if (!dbSession) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    if (!isAdmin && dbSession.user_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
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
    let { sessionId } = req.params;
    const { to, message } = req.body;

    // Auto-detectar sessão se não for informada ou for 'auto'
    if (!sessionId || sessionId === 'auto') {
      const userSessions = await db.getSessionsByUserId(req.userId);
      const activeSessions = userSessions.filter(s => {
        const session = sessionManager.getSession(s.id);
        return session && (session.status === 'connected' || session.status === 'authenticated');
      });

      if (activeSessions.length === 0) {
        return res.status(404).json({ error: 'Nenhuma sessão conectada encontrada' });
      }

      if (activeSessions.length === 1) {
        sessionId = activeSessions[0].id;
      } else {
        return res.status(400).json({
          error: 'Múltiplas sessões conectadas. Especifique qual usar.',
          sessions: activeSessions.map(s => s.id)
        });
      }
    }

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
    console.error(`Erro ao enviar mensagem para ${req.body.to} na sessão ${req.params.sessionId}:`, error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/sessions/:sessionId/message', authMiddleware, async (req, res) => {
  try {
    let { sessionId } = req.params;
    const { to, message } = req.body;

    console.log(`📤 [SEND MESSAGE] Requisição recebida:`);
    console.log(`   - User ID: ${req.userId}`);
    console.log(`   - Session ID param: ${sessionId}`);
    console.log(`   - To: ${to}`);

    // Auto-detectar sessão se não for informada ou for 'auto'
    if (!sessionId || sessionId === 'auto') {
      console.log(`🔍 [SEND MESSAGE] Auto-detectando sessão para user ${req.userId}...`);
      const userSessions = await db.getSessionsByUserId(req.userId);
      console.log(`   - Sessões encontradas: ${userSessions.length}`);
      userSessions.forEach(s => {
        console.log(`     * ${s.id} - Status DB: ${s.status}`);
      });

      const activeSessions = userSessions.filter(s => {
        const session = sessionManager.getSession(s.id);
        const isActive = session && (session.status === 'connected' || session.status === 'authenticated');
        console.log(`     * ${s.id} - Em memória: ${!!session} - Status: ${session?.status || 'N/A'} - Ativa: ${isActive}`);
        return isActive;
      });

      console.log(`   - Sessões ativas: ${activeSessions.length}`);

      if (activeSessions.length === 0) {
        console.log(`❌ [SEND MESSAGE] Nenhuma sessão conectada encontrada`);
        return res.status(404).json({ error: 'Nenhuma sessão conectada encontrada' });
      }

      if (activeSessions.length === 1) {
        sessionId = activeSessions[0].id;
        console.log(`✅ [SEND MESSAGE] Sessão auto-detectada: ${sessionId}`);
      } else {
        console.log(`⚠️ [SEND MESSAGE] Múltiplas sessões conectadas`);
        return res.status(400).json({
          error: 'Múltiplas sessões conectadas. Especifique qual usar.',
          sessions: activeSessions.map(s => s.id)
        });
      }
    }

    console.log(`🔍 [SEND MESSAGE] Verificando sessão ${sessionId} no banco...`);
    const dbSession = await db.getSession(sessionId);

    if (!dbSession) {
      console.log(`❌ [SEND MESSAGE] Sessão ${sessionId} não encontrada no banco`);
      return res.status(404).json({ error: 'Sessão não encontrada no banco de dados' });
    }

    console.log(`   - Sessão encontrada no banco:`);
    console.log(`     * ID: ${dbSession.id}`);
    console.log(`     * User ID: ${dbSession.user_id}`);
    console.log(`     * Status: ${dbSession.status}`);
    console.log(`     * Req User ID: ${req.userId}`);

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    if (!isAdmin && dbSession.user_id !== req.userId) {
      console.log(`❌ [SEND MESSAGE] Sessão pertence ao usuário ${dbSession.user_id}, mas requisição é do usuário ${req.userId}`);
      return res.status(403).json({
        error: 'Você não tem permissão para usar esta sessão',
        details: {
          sessionUserId: dbSession.user_id,
          requestUserId: req.userId
        }
      });
    }

    if (isAdmin) {
      console.log(`✅ [SEND MESSAGE] Admin ${req.userId} autorizado a usar sessão de outro usuário`);
    }

    if (!to || !message) {
      return res.status(400).json({
        error: 'Campos "to" e "message" são obrigatórios'
      });
    }

    console.log(`✅ [SEND MESSAGE] Enviando mensagem via SessionManager...`);
    const result = await sessionManager.sendMessage(sessionId, to, message);
    console.log(`✅ [SEND MESSAGE] Mensagem enviada com sucesso!`);
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      data: result
    });
  } catch (error) {
    console.error(`❌ [SEND MESSAGE] Erro ao enviar mensagem:`, error);

    const errorMsg = (error.message || '').toLowerCase();
    const isSessionDead = errorMsg.includes('perdeu conexão') ||
                          errorMsg.includes('caiu') ||
                          errorMsg.includes('reconectando') ||
                          errorMsg.includes('não está conectada') ||
                          errorMsg.includes('não encontrada') ||
                          errorMsg.includes('não disponível');
    const isRateLimit = errorMsg.includes('timeout') || errorMsg.includes('rate');
    const statusCode = isSessionDead ? 503 : (isRateLimit ? 429 : 400);

    res.status(statusCode).json({
      success: false,
      error: error.message,
      errorType: isSessionDead ? 'session_error' : (isRateLimit ? 'rate_limit' : 'send_error'),
      action: isSessionDead ? 'reconnect_session' : 'check_number',
      details: isSessionDead
        ? 'Sessão WhatsApp desconectou. Reconexão automática em progresso.'
        : 'Falha ao enviar mensagem. Verifique o número e tente novamente.'
    });
  }
});

app.post('/api/sessions/:sessionId/messages/media', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { to, mediaUrl, caption } = req.body;

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    const dbSession = await db.getSession(sessionId);
    if (!dbSession) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    if (!isAdmin && dbSession.user_id !== req.userId) {
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

app.put('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { webhookUrl } = req.body;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    if (!isAdmin && dbSession.user_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    if (!webhookUrl) {
      return res.status(400).json({ error: 'webhookUrl é obrigatório' });
    }

    await db.updateSessionWebhook(sessionId, webhookUrl);

    console.log(`✅ Webhook configurado para sessão ${sessionId}: ${webhookUrl}`);

    res.json({
      success: true,
      message: 'Webhook configurado com sucesso',
      webhookUrl
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    if (!isAdmin && dbSession.user_id !== req.userId) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const webhookUrl = await db.getSessionWebhook(sessionId);

    res.json({
      success: true,
      webhookUrl
    });
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
    const { limit = 100, source = 'db' } = req.query;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    let messages;
    if (source === 'memory') {
      messages = sessionManager.getInMemoryMessages(sessionId, contactPhone);
    } else {
      messages = await db.getMessagesByContact(sessionId, contactPhone, parseInt(limit));
      messages = messages.reverse();
    }

    res.json({
      success: true,
      messages,
      source
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/sessions/:sessionId/messages/memory', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { contactPhone } = req.query;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    const messages = sessionManager.getInMemoryMessages(sessionId, contactPhone);

    res.json({
      success: true,
      messages,
      count: messages.length
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/sessions/:sessionId/messages/memory', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { contactPhone } = req.query;

    const dbSession = await db.getSession(sessionId);
    if (!dbSession || dbSession.user_id !== req.userId) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    sessionManager.clearInMemoryMessages(sessionId, contactPhone);

    res.json({
      success: true,
      message: 'Mensagens em memória limpas com sucesso'
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

app.post('/api/admin/cleanup-messages', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    console.log('🗑️ Iniciando limpeza de mensagens...');

    const countResult = await db.all('SELECT COUNT(*) as count FROM messages');
    const totalMensagens = countResult[0].count;

    console.log(`📊 Total de mensagens antes da limpeza: ${totalMensagens}`);

    await db.run('DELETE FROM messages');

    const newCountResult = await db.all('SELECT COUNT(*) as count FROM messages');
    const remainingMessages = newCountResult[0].count;

    console.log(`✅ Limpeza concluída! Mensagens deletadas: ${totalMensagens}`);

    res.json({
      success: true,
      message: 'Todas as mensagens foram deletadas com sucesso',
      deletedCount: totalMensagens,
      remainingCount: remainingMessages
    });
  } catch (error) {
    console.error('❌ Erro ao limpar mensagens:', error);
    res.status(500).json({ error: error.message });
  }
});

// REMOVIDO: health simplificado duplicado que sobrescrevia o detalhado (linha ~271)

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

async function initializeDefaultSession() {
  try {
    // No Koyeb com filesystem efêmero, NÃO restauramos sessões no startup.
    // Cada sessão será criada sob demanda quando o usuário acessar.
    console.log('✅ Startup limpo — sessões serão criadas sob demanda.');
    console.log('💡 Usuários devem clicar em "Criar Sessão" e escanear o QR Code.');

    const memUsage = process.memoryUsage();
    console.log(`📊 Memória no startup: RSS=${Math.round(memUsage.rss / 1024 / 1024)}MB, Heap=${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  } catch (error) {
    console.error('❌ Erro na inicialização:', error.message);
  }
}

cron.schedule('0 * * * *', async () => {
  console.log('🧹 Executando limpeza de sessões inativas...');
  try {
    const cleaned = await sessionManager.cleanupInactiveSessions();
    console.log(`✅ ${cleaned} sessões inativas foram limpas`);
  } catch (error) {
    console.error('❌ Erro na limpeza de sessões:', error);
  }
});


cron.schedule('*/10 * * * *', async () => {
  console.log('🧹 Executando limpeza automática de mensagens antigas (a cada 10 minutos)...');
  try {
    const deletedCount = await db.deleteOldMessages(20);
    const totalMessages = await db.getMessagesCount();
    const dbSize = await db.getDatabaseSize();
    const capacity = await db.getDatabaseCapacityPercentage();

    console.log(`✅ Limpeza concluída:`);
    console.log(`   - ${deletedCount} mensagens antigas removidas (>20min)`);
    console.log(`   - ${totalMessages} mensagens restantes`);
    if (dbSize) {
      console.log(`   - Tamanho do banco: ${dbSize.size} (${capacity.toFixed(2)}%)`);
    }

    if (capacity >= 50) {
      console.log(`⚠️ Capacidade crítica! Executando limpeza adicional...`);
      const cleanedByCapacity = await db.cleanupByCapacity();
      console.log(`   - ${cleanedByCapacity} mensagens adicionais removidas`);
    }
  } catch (error) {
    console.error('❌ Erro na limpeza de mensagens:', error.message);
  }
});

cron.schedule('0 */6 * * *', async () => {
  console.log('💾 Executando backup de usuários (a cada 6 horas)...');
  try {
    const users = await db.backupUsers();
    console.log(`✅ Backup concluído: ${users.length} usuários salvos`);
  } catch (error) {
    console.error('❌ Erro no backup de usuários:', error.message);
  }
});

cron.schedule('*/5 * * * *', async () => {
  console.log('🔍 Verificando saúde do sistema (a cada 5 minutos)...');
  try {
    const capacity = await db.getDatabaseCapacityPercentage();
    const sessions = sessionManager.getAllSessions();
    const activeSessions = sessions.filter(s => s.status === 'connected').length;
    
    console.log(`📊 Status do sistema:`);
    console.log(`   - Capacidade do banco: ${capacity.toFixed(2)}%`);
    console.log(`   - Sessões ativas: ${activeSessions}/${sessions.length}`);
    
    if (capacity > 90) {
      console.error(`🚨 ALERTA: Banco de dados com ${capacity.toFixed(2)}% de capacidade!`);
      await db.cleanupByCapacity();
    }
  } catch (error) {
    console.error('❌ Erro na verificação de saúde:', error.message);
  }
});

// ═══════════════════════════════════════════════════════════════════
// MONITORAMENTO DE MEMÓRIA — Previne OOM kills no Koyeb
// Verifica a cada 2 minutos. Se RSS > 400MB, força limpeza agressiva.
// ═══════════════════════════════════════════════════════════════════
const MEMORY_CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutos
const MEMORY_WARN_MB = 300;   // Alerta
const MEMORY_CRITICAL_MB = 400; // Limpeza agressiva
const MEMORY_EMERGENCY_MB = 500; // Mata sessões ociosas

setInterval(async () => {
  const mem = process.memoryUsage();
  const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
  const rssMB = Math.round(mem.rss / 1024 / 1024);
  console.log(`🧠 Memória — Heap: ${heapMB}MB | RSS: ${rssMB}MB`);

  // Tenta garbage collection se disponível
  if (global.gc) {
    global.gc();
    const afterGC = process.memoryUsage();
    console.log(`🧹 GC executado — Heap: ${Math.round(afterGC.heapUsed / 1024 / 1024)}MB | RSS: ${Math.round(afterGC.rss / 1024 / 1024)}MB`);
  }

  if (rssMB >= MEMORY_EMERGENCY_MB) {
    console.error(`🚨 EMERGÊNCIA DE MEMÓRIA: ${rssMB}MB RSS! Limpando sessões não-connected...`);
    // Mata TODAS as sessões que NÃO estão connected
    const sessions = sessionManager.getAllSessions();
    for (const s of sessions) {
      if (s.status !== 'connected') {
        console.log(`💀 Matando sessão ${s.id} (status: ${s.status}) para liberar memória`);
        try { await sessionManager.cleanupSession(s.id); } catch (e) { /* ignora */ }
      }
    }
    // Mata processos chromium órfãos
    try {
      const { execSync } = require('child_process');
      execSync('pkill -f "chromium.*--type=renderer" 2>/dev/null || true');
      console.log('🧹 Processos chromium renderer órfãos eliminados');
    } catch (e) { /* ignora */ }

  } else if (rssMB >= MEMORY_CRITICAL_MB) {
    console.warn(`⚠️ MEMÓRIA CRÍTICA: ${rssMB}MB RSS! Limpando sessões mortas...`);
    await sessionManager.forceCleanupDeadSessions();
    // Limpa mensagens em memória antigas
    sessionManager.inMemoryMessages.clear();
    console.log('🧹 Cache de mensagens em memória limpo');

  } else if (rssMB >= MEMORY_WARN_MB) {
    console.warn(`⚠️ Memória elevada: ${rssMB}MB RSS`);
  }
}, MEMORY_CHECK_INTERVAL_MS);

// ═══════════════════════════════════════════════════════════════════
// VERIFICAÇÃO DE SESSÕES ZUMBIS — Mata sessões "authenticated" presas
// Se uma sessão está "authenticated" por mais de 3 minutos sem virar
// "connected", o Chromium provavelmente travou.
// ═══════════════════════════════════════════════════════════════════
const ZOMBIE_CHECK_INTERVAL_MS = 3 * 60 * 1000; // 3 minutos
const AUTHENTICATED_MAX_AGE_MS = 3 * 60 * 1000; // 3 minutos máximo em "authenticated"

setInterval(async () => {
  const now = Date.now();
  const allSessions = sessionManager.getAllSessions();

  for (const s of allSessions) {
    if (s.status === 'authenticated' && s.lastSeen && (now - s.lastSeen) > AUTHENTICATED_MAX_AGE_MS) {
      console.warn(`🧟 Sessão zumbi detectada: ${s.id} — presa em "authenticated" por ${Math.round((now - s.lastSeen) / 1000)}s`);
      console.log(`🔄 Destruindo e recriando sessão ${s.id}...`);

      try {
        const sessionData = sessionManager.getSession(s.id);
        if (sessionData) {
          // Tenta verificar se realmente está morta
          const alive = await sessionManager.isSessionAlive(s.id);
          if (!alive) {
            console.log(`💀 Sessão ${s.id} confirmada como morta. Limpando...`);
            await sessionManager.cleanupSession(s.id);
            await db.updateSessionStatus(s.id, 'disconnected');
          }
        }
      } catch (e) {
        console.error(`❌ Erro ao limpar sessão zumbi ${s.id}:`, e.message);
      }
    }
  }
}, ZOMBIE_CHECK_INTERVAL_MS);

app.get('/api/debug/chromium', async (req, res) => {
  const { execSync } = require('child_process');
  try {
    const chromiumPath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium';
    const checks = {
      chromiumPath: chromiumPath,
      chromiumExists: require('fs').existsSync(chromiumPath),
      chromiumVersion: null,
      puppeteerConfig: {
        executablePath: chromiumPath,
        env: process.env.NODE_ENV
      }
    };

    try {
      checks.chromiumVersion = execSync(`${chromiumPath} --version`).toString().trim();
    } catch (e) {
      checks.chromiumVersion = `Error: ${e.message}`;
    }

    res.json(checks);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de debug para verificar sessões (apenas admin)
app.get('/api/debug/sessions', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const allSessionsDB = await db.all('SELECT * FROM sessions');
    const allSessionsMemory = sessionManager.getAllSessions();

    const debug = {
      database: allSessionsDB.map(s => ({
        id: s.id,
        user_id: s.user_id,
        status: s.status,
        phone_number: s.phone_number,
        phone_name: s.phone_name,
        created_at: s.created_at,
        updated_at: s.updated_at
      })),
      memory: allSessionsMemory.map(s => ({
        id: s.id,
        userId: s.userId,
        status: s.status,
        hasClient: !!s.client,
        phoneNumber: s.info?.wid?.user || null,
        phoneName: s.info?.pushname || null
      })),
      users: await db.all('SELECT id, name, email FROM users')
    };

    res.json(debug);
  } catch (error) {
    console.error('Erro no debug:', error);
    res.status(500).json({ error: error.message });
  }
});

// Endpoint de limpeza manual de mensagens antigas
app.post('/api/cleanup-messages', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    const { hoursOld = 24 } = req.body;

    console.log(`🧹 Limpeza manual de mensagens iniciada (>${hoursOld}h)...`);

    const deletedCount = await db.deleteOldMessages(hoursOld);
    const totalMessages = await db.getMessagesCount();
    const dbSize = await db.getDatabaseSize();

    res.json({
      success: true,
      deletedCount,
      remainingMessages: totalMessages,
      databaseSize: dbSize?.size || 'N/A',
      databaseSizeBytes: dbSize?.size_bytes || 0,
      message: `${deletedCount} mensagens antigas foram removidas com sucesso`
    });
  } catch (error) {
    console.error('❌ Erro na limpeza manual:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      message: 'Erro ao executar limpeza de mensagens'
    });
  }
});

// Endpoint para obter estatísticas do banco de dados
app.get('/api/database-stats', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
    }

    const totalMessages = await db.getMessagesCount();
    const dbSize = await db.getDatabaseSize();
    const allUsers = await db.all('SELECT COUNT(*) as count FROM users');
    const allSessions = await db.all('SELECT COUNT(*) as count FROM sessions');
    const allContacts = await db.all('SELECT COUNT(*) as count FROM contacts');

    res.json({
      success: true,
      stats: {
        totalMessages: totalMessages || 0,
        totalUsers: allUsers[0]?.count || 0,
        totalSessions: allSessions[0]?.count || 0,
        totalContacts: allContacts[0]?.count || 0,
        databaseSize: dbSize?.size || 'N/A',
        databaseSizeBytes: dbSize?.size_bytes || 0
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint simplificado para envio de mensagens (auto-detecta sessão)
// Atualizado: Admin pode enviar mensagens de qualquer sessão
app.post('/api/messages/send', authMiddleware, async (req, res) => {
  try {
    const { to, message, sessionId } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        error: 'Campos "to" e "message" são obrigatórios'
      });
    }

    const currentUser = await db.getUserById(req.userId);
    const isAdmin = currentUser.email === 'admin@flow.com';

    let targetSessionId = sessionId;

    // Auto-detectar sessão se não for informada
    if (!targetSessionId) {
      const userSessions = isAdmin
        ? await db.all('SELECT * FROM sessions WHERE status IN ($1, $2)', ['connected', 'authenticated'])
        : await db.getSessionsByUserId(req.userId);

      const activeSessions = userSessions.filter(s => {
        const session = sessionManager.getSession(s.id);
        return session && (session.status === 'connected' || session.status === 'authenticated');
      });

      if (activeSessions.length === 0) {
        return res.status(404).json({
          error: 'Nenhuma sessão conectada encontrada. Conecte seu WhatsApp primeiro.',
          action: 'connect_whatsapp'
        });
      }

      if (activeSessions.length === 1) {
        targetSessionId = activeSessions[0].id;
      } else {
        return res.status(400).json({
          error: 'Múltiplas sessões conectadas. Especifique qual usar no campo "sessionId".',
          sessions: activeSessions.map(s => ({
            id: s.id,
            createdAt: s.created_at
          }))
        });
      }
    }

    // Verificar se a sessão existe
    const dbSession = await db.getSession(targetSessionId);
    if (!dbSession) {
      return res.status(404).json({ error: 'Sessão não encontrada' });
    }

    // Verificar permissões: admin pode usar qualquer sessão, usuário comum apenas suas próprias
    if (!isAdmin && dbSession.user_id !== req.userId) {
      return res.status(403).json({ error: 'Sessão não encontrada ou não pertence a você' });
    }

    const result = await sessionManager.sendMessage(targetSessionId, to, message);
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      sessionId: targetSessionId,
      data: result
    });
  } catch (error) {
    console.error(`Erro ao enviar mensagem:`, error);

    // Categoriza o erro para o frontend saber o que fazer
    const errorMsg = (error.message || '').toLowerCase();
    const isSessionDead = errorMsg.includes('perdeu conexão') ||
                          errorMsg.includes('caiu') ||
                          errorMsg.includes('reconectando') ||
                          errorMsg.includes('não está conectada') ||
                          errorMsg.includes('não encontrada') ||
                          errorMsg.includes('não disponível');

    const isRateLimit = errorMsg.includes('timeout') || errorMsg.includes('rate');

    // Erro de sessão = 503 (Service Unavailable, temporário)
    // Erro de rate limit = 429
    // Erro de número/conteúdo = 400
    const statusCode = isSessionDead ? 503 : (isRateLimit ? 429 : 400);
    const action = isSessionDead ? 'reconnect_session' : (isRateLimit ? 'slow_down' : 'check_number');

    res.status(statusCode).json({
      success: false,
      error: error.message,
      errorType: isSessionDead ? 'session_error' : (isRateLimit ? 'rate_limit' : 'send_error'),
      action: action,
      details: isSessionDead
        ? 'Sessão WhatsApp desconectou. Reconexão automática em progresso. Tente novamente em 1 minuto.'
        : 'Falha ao enviar mensagem. Verifique o número e tente novamente.'
    });
  }
});

// Endpoint para obter URLs de webhook do usuário (para configurar no n8n/Flow)
app.get('/api/webhooks/info', authMiddleware, async (req, res) => {
  try {
    const userSessions = await db.getSessionsByUserId(req.userId);

    if (userSessions.length === 0) {
      return res.status(404).json({
        error: 'Nenhuma sessão encontrada. Crie uma sessão primeiro.',
        action: 'create_session'
      });
    }

    const baseUrl = process.env.API_URL || `https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app`;

    const webhooksInfo = userSessions.map(session => ({
      sessionId: session.id,
      status: session.status,
      webhooks: {
        // Webhook para ENVIAR mensagens (usar no n8n/Flow para enviar)
        send: {
          url: `${baseUrl}/api/sessions/${session.id}/message`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer SEU_TOKEN_JWT'
          },
          body: {
            to: '5511999999999',
            message: 'Sua mensagem aqui'
          },
          description: 'Use este endpoint para ENVIAR mensagens via WhatsApp'
        },
        // Webhook para RECEBER mensagens (configurar no Flow para receber notificações)
        receive: {
          url: session.webhook_url || 'Não configurado',
          method: 'POST',
          description: 'Configure este webhook no Flow para RECEBER mensagens do WhatsApp',
          howToSet: `PUT ${baseUrl}/api/sessions/${session.id}/webhook`,
          examplePayload: {
            event: 'message',
            sessionId: session.id,
            userId: req.userId,
            message: {
              id: 'msg_id',
              from: '5511999999999',
              body: 'Mensagem recebida',
              type: 'chat',
              timestamp: 1234567890
            }
          }
        }
      }
    }));

    res.json({
      success: true,
      userId: req.userId,
      totalSessions: userSessions.length,
      webhooks: webhooksInfo,
      instructions: {
        send: 'Use o webhook "send" no n8n/Flow para ENVIAR mensagens',
        receive: 'Configure o webhook "receive" para RECEBER mensagens no Flow',
        authentication: 'Inclua o header Authorization: Bearer SEU_TOKEN em todas as requisições'
      }
    });
  } catch (error) {
    console.error('Erro ao obter webhooks:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Endpoint de diagnóstico — mostra erros recentes e saúde das sessões
app.get('/api/debug/errors', authMiddleware, async (req, res) => {
  try {
    const currentUser = await db.getUserById(req.userId);
    if (currentUser.email !== 'admin@flow.com') {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const health = await sessionManager.healthCheck();
    const recentErrors = sessionManager.getRecentErrors(20);
    res.json({
      success: true,
      health,
      recentErrors,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoint para verificar se uma sessão específica está viva
app.get('/api/sessions/:sessionId/alive', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const alive = await sessionManager.isSessionAlive(sessionId);
    const session = sessionManager.getSession(sessionId);
    res.json({
      success: true,
      sessionId,
      alive,
      status: session?.status || 'not_in_memory',
      lastSeen: session?.lastSeen ? new Date(session.lastSeen).toISOString() : null
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

if (process.env.RENDER_EXTERNAL_URL) {
  const keepAliveUrl = `${process.env.RENDER_EXTERNAL_URL}/health`;
  console.log(`🔄 Configurando keep-alive para: ${keepAliveUrl}`);

  cron.schedule('*/10 * * * *', async () => {
    try {
      const axios = require('axios');
      await axios.get(keepAliveUrl, { timeout: 5000 });
      console.log('💓 Keep-alive ping enviado');
    } catch (error) {
      console.error('❌ Erro no keep-alive:', error.message);
    }
  });
}

// Monitor de memória básico removido — substituído pelo monitor avançado com 3 thresholds (linha ~1295)

server.listen(PORT, HOST, async () => {
  console.log(`\n🚀 ========================================`);
  console.log(`   WhatsApp API Server v2.0`);
  console.log(`========================================`);
  console.log(`📡 Servidor rodando em: http://${HOST}:${PORT}`);
  console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 MongoDB: ${process.env.MONGODB_URI ? '✅ Configurado' : '⚠️ Não configurado'}`);
  console.log(`========================================\n`);

  await initializeDefaultSession();

  console.log(`\n✅ API pronta para receber requisições!`);
  console.log(`📖 Documentação: http://${HOST}:${PORT}\n`);
});

process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM recebido. Encerrando gracefully...');

  const sessions = sessionManager.getAllSessions();
  for (const session of sessions) {
    try {
      console.log(`🔌 Desconectando sessão: ${session.id}`);
      await sessionManager.deleteSession(session.id);
    } catch (error) {
      console.error(`❌ Erro ao desconectar ${session.id}:`, error.message);
    }
  }

  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
