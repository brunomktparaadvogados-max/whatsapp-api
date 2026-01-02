const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor(database, io) {
    this.sessions = new Map();
    this.sessionDir = process.env.SESSION_DIR || './sessions';
    this.db = database;
    this.io = io;

    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
    }
  }

  async createSession(sessionId, userId) {
    console.log(`🆕 Tentando criar sessão: ${sessionId}`);

    if (this.sessions.has(sessionId)) {
      console.log(`⚠️ Sessão ${sessionId} já existe na memória`);
      throw new Error('Sessão já existe na memória');
    }

    const existingSession = await this.db.getSession(sessionId);
    if (existingSession) {
      console.log(`⚠️ Sessão ${sessionId} já existe no banco`);
      throw new Error('Sessão já existe no banco de dados');
    }

    console.log(`💾 Criando sessão ${sessionId} no banco de dados...`);
    await this.db.createSession(sessionId, userId);

    const sessionData = {
      id: sessionId,
      userId,
      qrCode: null,
      status: 'initializing',
      client: null,
      info: null
    };

    console.log(`🤖 Inicializando cliente WhatsApp para sessão ${sessionId}...`);
    const client = new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: this.sessionDir
      }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.setupClientEvents(client, sessionData);

    sessionData.client = client;
    this.sessions.set(sessionId, sessionData);

    console.log(`⏳ Aguardando inicialização do cliente ${sessionId}...`);

    const initPromise = client.initialize();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout na inicialização')), 60000)
    );

    try {
      await Promise.race([initPromise, timeoutPromise]);
      console.log(`✅ Cliente ${sessionId} inicializado com sucesso`);
    } catch (error) {
      console.error(`❌ Erro ao inicializar cliente ${sessionId}:`, error.message);

      if (sessionData.client) {
        try {
          await sessionData.client.destroy();
        } catch (e) {
          console.error(`⚠️ Erro ao destruir cliente ${sessionId}:`, e.message);
        }
      }

      this.sessions.delete(sessionId);
      await this.db.deleteSession(sessionId);
      throw error;
    }

    return sessionData;
  }

  setupClientEvents(client, sessionData) {
    client.on('qr', async (qr) => {
      console.log(`📱 QR Code gerado para sessão: ${sessionData.id}`);
      sessionData.qrCode = await QRCode.toDataURL(qr);
      sessionData.status = 'qr_code';

      this.io.to(`user_${sessionData.userId}`).emit('qr_code', {
        sessionId: sessionData.id,
        qrCode: sessionData.qrCode
      });
    });

    client.on('authenticated', async () => {
      console.log(`✅ Autenticado: ${sessionData.id}`);
      sessionData.status = 'authenticated';

      await this.db.updateSessionStatus(sessionData.id, 'authenticated');

      this.io.to(`user_${sessionData.userId}`).emit('session_authenticated', {
        sessionId: sessionData.id,
        info: sessionData.info
      });
    });

    client.on('ready', async () => {
      console.log(`🟢 Cliente PRONTO e CONECTADO: ${sessionData.id}`);
      sessionData.status = 'connected';
      sessionData.info = {
        wid: client.info.wid._serialized,
        pushname: client.info.pushname,
        platform: client.info.platform
      };
      sessionData.qrCode = null;

      await this.db.updateSessionStatus(
        sessionData.id,
        'connected',
        client.info.wid._serialized,
        client.info.pushname
      );

      console.log(`💾 Sessão ${sessionData.id} salva no banco com status: connected`);
      console.log(`📞 Número conectado: ${client.info.wid._serialized}`);
      console.log(`👤 Nome: ${client.info.pushname}`);

      this.io.to(`user_${sessionData.userId}`).emit('session_connected', {
        sessionId: sessionData.id,
        info: sessionData.info
      });
    });

    client.on('auth_failure', async (msg) => {
      console.error(`❌ Falha na autenticação: ${sessionData.id}`, msg);
      sessionData.status = 'auth_failure';

      await this.db.updateSessionStatus(sessionData.id, 'auth_failure');

      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionData.id,
        error: 'Falha na autenticação'
      });
    });

    client.on('disconnected', async (reason) => {
      console.log(`🔴 Desconectado: ${sessionData.id}`, reason);
      sessionData.status = 'disconnected';

      await this.db.updateSessionStatus(sessionData.id, 'disconnected');

      this.io.to(`user_${sessionData.userId}`).emit('session_disconnected', {
        sessionId: sessionData.id,
        reason
      });
    });

    client.on('message', async (message) => {
      const contactPhone = message.from.replace('@c.us', '');

      const messageData = {
        id: message.id._serialized,
        sessionId: sessionData.id,
        contactPhone,
        messageType: message.type,
        body: message.body,
        mediaUrl: null,
        mediaMimetype: null,
        fromMe: message.fromMe,
        timestamp: message.timestamp,
        status: 'received'
      };

      if (message.hasMedia) {
        try {
          const media = await message.downloadMedia();
          messageData.mediaUrl = `data:${media.mimetype};base64,${media.data}`;
          messageData.mediaMimetype = media.mimetype;
        } catch (error) {
          console.error('Erro ao baixar mídia:', error);
        }
      }

      await this.db.saveMessage(messageData);

      await this.db.upsertContact(sessionData.id, contactPhone, message._data.notifyName);

      this.io.to(`user_${sessionData.userId}`).emit('new_message', {
        sessionId: sessionData.id,
        message: messageData
      });

      if (!message.fromMe) {
        await this.processAutoReplies(sessionData.id, message);
      }
    });

    client.on('message_create', async (message) => {
      if (message.fromMe) {
        const contactPhone = message.to.replace('@c.us', '');

        const messageData = {
          id: message.id._serialized,
          sessionId: sessionData.id,
          contactPhone,
          messageType: message.type,
          body: message.body,
          mediaUrl: null,
          mediaMimetype: null,
          fromMe: true,
          timestamp: message.timestamp,
          status: 'sent'
        };

        await this.db.saveMessage(messageData);
        await this.db.upsertContact(sessionData.id, contactPhone);

        this.io.to(`user_${sessionData.userId}`).emit('message_sent', {
          sessionId: sessionData.id,
          message: messageData
        });
      }
    });

    client.on('message_ack', async (message, ack) => {
      const statusMap = {
        0: 'error',
        1: 'pending',
        2: 'sent',
        3: 'delivered',
        4: 'read'
      };

      const status = statusMap[ack] || 'unknown';
      await this.db.updateMessageStatus(message.id._serialized, status);

      this.io.to(`user_${sessionData.userId}`).emit('message_status', {
        sessionId: sessionData.id,
        messageId: message.id._serialized,
        status
      });
    });
  }

  async processAutoReplies(sessionId, message) {
    const autoReplies = await this.db.getAutoReplies(sessionId);

    for (const reply of autoReplies) {
      let shouldReply = false;

      if (reply.trigger_type === 'keyword') {
        const keywords = reply.trigger_value.toLowerCase().split(',').map(k => k.trim());
        const messageText = message.body.toLowerCase();
        shouldReply = keywords.some(keyword => messageText.includes(keyword));
      } else if (reply.trigger_type === 'exact') {
        shouldReply = message.body.toLowerCase() === reply.trigger_value.toLowerCase();
      } else if (reply.trigger_type === 'first_message') {
        const previousMessages = await this.db.getMessagesByContact(sessionId, message.from.replace('@c.us', ''), 2);
        shouldReply = previousMessages.length === 1;
      }

      if (shouldReply) {
        await this.sendMessage(sessionId, message.from.replace('@c.us', ''), reply.response_message);
        break;
      }
    }
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  getAllSessions() {
    const sessions = [];
    this.sessions.forEach((session, id) => {
      sessions.push({
        id: session.id,
        status: session.status,
        info: session.info
      });
    });
    return sessions;
  }

  async deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (session && session.client) {
      await session.client.destroy();
    }

    this.sessions.delete(sessionId);
    await this.db.deleteSession(sessionId);

    const sessionPath = path.join(this.sessionDir, `session-${sessionId}`);
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }

    return true;
  }

  async restoreSessionsFromDatabase(userId) {
    try {
      console.log('🔄 Restaurando sessões do banco de dados...');
      const dbSessions = await this.db.getSessionsByUserId(userId);

      let restoredCount = 0;
      let removedCount = 0;

      for (const dbSession of dbSessions) {
        const sessionPath = path.join(this.sessionDir, `session-${dbSession.id}`);

        if (this.sessions.has(dbSession.id)) {
          console.log(`⏭️ Sessão ${dbSession.id} já está na memória, pulando...`);
          continue;
        }

        if (fs.existsSync(sessionPath)) {
          console.log(`📱 Restaurando sessão: ${dbSession.id}`);

          try {
            const sessionData = {
              id: dbSession.id,
              userId: dbSession.user_id,
              qrCode: null,
              status: 'initializing',
              client: null,
              info: dbSession.phone_number ? {
                wid: dbSession.phone_number,
                pushname: dbSession.phone_name || 'Desconhecido',
                platform: 'unknown'
              } : null
            };

            const client = new Client({
              authStrategy: new LocalAuth({
                clientId: dbSession.id,
                dataPath: this.sessionDir
              }),
              puppeteer: {
                headless: true,
                args: [
                  '--no-sandbox',
                  '--disable-setuid-sandbox',
                  '--disable-dev-shm-usage',
                  '--disable-accelerated-2d-canvas',
                  '--no-first-run',
                  '--no-zygote',
                  '--disable-gpu'
                ]
              }
            });

            this.setupClientEvents(client, sessionData);
            sessionData.client = client;
            this.sessions.set(dbSession.id, sessionData);

            const initPromise = client.initialize();
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Timeout na restauração')), 45000)
            );

            await Promise.race([initPromise, timeoutPromise]);
            restoredCount++;
            console.log(`✅ Sessão ${dbSession.id} restaurada com sucesso`);
          } catch (error) {
            console.error(`❌ Erro ao restaurar sessão ${dbSession.id}:`, error.message);
            this.sessions.delete(dbSession.id);

            if (error.message.includes('Timeout')) {
              console.log(`⏱️ Timeout ao restaurar ${dbSession.id}, mas sessão pode conectar depois`);
            }
          }
        } else {
          console.log(`🗑️ Removendo sessão órfã do banco: ${dbSession.id}`);
          await this.db.deleteSession(dbSession.id);
          removedCount++;
        }
      }

      console.log(`✅ Restauração concluída. ${restoredCount} sessões restauradas, ${removedCount} órfãs removidas.`);
      console.log(`📊 Total de sessões ativas: ${this.sessions.size}`);
    } catch (error) {
      console.error('❌ Erro ao restaurar sessões:', error);
    }
  }

  async sendMessage(sessionId, to, message) {
    const session = this.getSession(sessionId);
    if (!session || !session.client) {
      console.error(`❌ Erro ao enviar mensagem: Sessão ${sessionId} não encontrada na memória`);
      throw new Error('Sessão não encontrada ou não conectada');
    }

    console.log(`📤 Tentando enviar mensagem na sessão ${sessionId}`);
    console.log(`   Status atual: ${session.status}`);
    console.log(`   Cliente existe: ${!!session.client}`);

    if (session.status !== 'connected' && session.status !== 'authenticated') {
      console.error(`❌ Erro: Status inválido para envio. Status atual: ${session.status}`);
      throw new Error(`Cliente não está conectado. Status atual: ${session.status}`);
    }

    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;
    console.log(`📞 Enviando para: ${chatId}`);

    const result = await session.client.sendMessage(chatId, message);

    console.log(`✅ Mensagem enviada com sucesso! ID: ${result.id._serialized}`);

    return {
      success: true,
      messageId: result.id._serialized,
      timestamp: result.timestamp
    };
  }

  async sendMedia(sessionId, to, mediaUrl, caption = '') {
    const session = this.getSession(sessionId);
    if (!session || !session.client) {
      throw new Error('Sessão não encontrada ou não conectada');
    }

    if (session.status !== 'connected' && session.status !== 'authenticated') {
      throw new Error(`Cliente não está conectado. Status atual: ${session.status}`);
    }

    const { MessageMedia } = require('whatsapp-web.js');
    const chatId = to.includes('@c.us') ? to : `${to}@c.us`;

    let media;
    if (mediaUrl.startsWith('http')) {
      media = await MessageMedia.fromUrl(mediaUrl);
    } else {
      media = MessageMedia.fromFilePath(mediaUrl);
    }

    const result = await session.client.sendMessage(chatId, media, { caption });

    return {
      success: true,
      messageId: result.id._serialized,
      timestamp: result.timestamp
    };
  }

  async getChats(sessionId) {
    const session = this.getSession(sessionId);
    if (!session || !session.client) {
      throw new Error('Sessão não encontrada ou não conectada');
    }

    const chats = await session.client.getChats();
    return chats.map(chat => ({
      id: chat.id._serialized,
      name: chat.name,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      timestamp: chat.timestamp
    }));
  }

  async getContacts(sessionId) {
    const session = this.getSession(sessionId);
    if (!session || !session.client) {
      throw new Error('Sessão não encontrada ou não conectada');
    }

    const contacts = await session.client.getContacts();
    return contacts.map(contact => ({
      id: contact.id._serialized,
      name: contact.name,
      pushname: contact.pushname,
      number: contact.number,
      isMyContact: contact.isMyContact,
      isBlocked: contact.isBlocked
    }));
  }
}

module.exports = SessionManager;
