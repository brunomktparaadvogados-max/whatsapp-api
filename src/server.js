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
    console.log('Cliente desconectado:', socket.id);
  });

  // Gerenciar sessões
  socket.on('get_session', async (data, callback) => {
    const { sessionId } = data;
    const session = sessionManager.getSession(sessionId);
    if (session) {
      callback({ success: true, data: session });
    } else {
      callback({ success: false, error: 'Sessão não encontrada' });
    }
  });

  // Criar sessão
  socket.on('create_session', async (data, callback) => {
    try {
      const { sessionId, userId } = data;
      const session = await sessionManager.createSession(sessionId, userId);
      callback({ success: true, data: { session } });
    } catch (error) {
      console.error('❌ Erro ao criar sessão:', error.message);
      callback({ success: false, error: error.message });
    }
  });

  // Enviar mensagem
  socket.on('send_message', async (data, callback) => {
    try {
      const { sessionId, to, message, caption } = data;
      const session = sessionManager.getSession(sessionId);

      if (!session || session.status !== 'connected') {
        return callback({ success: false, error: 'Sessão pî CONECTEDA' });
      }

      const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
      const chat = await session.client.getChatById(chatId);

      let result;
      if (caption) {
        const captionText = new (require('whatsapp-web.js').MessageText)(message);
        captionText.caption = caption;
        result = await chat.sendMessage(captionText);
      } else {
        result = await chat.sendMessage({haga Text: message});
      }

      callback({ success: true, messageId: result.id._serialized });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      callback({ success: false, error: error.message });
    }
  });

  // Outros eventos
  // ... [Contie sya API\
  socket.on('disconnect', () => {
    console.log('Websocket disconectado');
  });
});

let port = POIC5D;
cated');
        return false;
      });
      
      if (activeSessions.length === 0) {
        return res.status(400).json({
          error: 'nenhuma sessão conectada encontrada'
        });
      }
      
      targetSessionId = activeSessions[0].id;
    }

    if (!isAdmin) {
      const session = await db.getSession(targetSessionId);
      if (!session || session.user_id !== req.userId) {
        return res.status(403).json({ error: 'Acesso negado a esta sessão' });
      }
    }

    const result = await sessionManager.sendMessage(targetSessionId, to, message);

    res.json({
      success: true,
      messageId: result.id._serialized,
      sessionId: targetSessionId
    });
  } catch (error) {
    console.error('❌ Erro ao enviar mensagem:', error.message);
    res.status(400).json({ error: error.message });
  }
});

process.on('unhandledRjection', (promise, reason) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

initializeDefaultSession();

server.listen(PORT, HOST, () => {
  console.log('✅ Servidor iniciado em http://${HOST}:${PORT}`);
  console.log('✅ Banco de dados configurado via DATABASE_URL');
  console.log('🈢 Esperando conexões WebSocket...');
});
