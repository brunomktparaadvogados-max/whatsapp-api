const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

class SessionManager {
  constructor(database, io) {
    this.sessions = new Map();
    this.db = database;
    this.io = io;
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 5;
    this.inMemoryMessages = new Map();
    this.sessionLastActivity = new Map();

    this.initMongoDB();
    setTimeout(() => this.startAutoCleanup(), 5000);
  }

  async initMongoDB() {
    console.log('⚠️ MongoDB/Mongoose não é mais usado. Usando PostgreSQL (Supabase).');
    console.log('✅ Banco de dados configurado via DATABASE_URL');

    await this.restoreAllSessions();
  }

  async restoreAllSessions() {
    try {
      console.log('🔄 Restaurando sessões do banco de dados...');
      const dbSessions = await this.db.getAllSessionsFromDB();

      console.log(`📊 Total de sessões no banco: ${dbSessions.length}`);

      for (const session of dbSessions) {
        const sessionId = session.id;

        if (!sessionId || sessionId === 'T' || sessionId === 'test' || sessionId === 'default') {
          console.log(`🗑️ Removendo sessão inválida: ${sessionId}`);
          await this.db.deleteSession(sessionId);
          continue;
        }

        if (!sessionId.startsWith('user_')) {
          console.log(`⚠️ Sessão ${sessionId} não segue padrão user_X, removendo...`);
          await this.db.deleteSession(sessionId);
          continue;
        }

        if (session.status === 'connected' || session.status === 'authenticated') {
          console.log(`🔄 Tentando restaurar sessão: ${sessionId}`);
          try {
            await this.restoreSession(session.id, session.user_id);
          } catch (error) {
            console.error(`❌ Erro ao restaurar sessão ${session.id}:`, error.message);
            await this.db.updateSessionStatus(session.id, 'disconnected');
          }
        }
      }

      console.log(`✅ Processo de restauração concluído. ${this.sessions.size} sessões ativas.`);
    } catch (error) {
      console.error('❌ Erro ao restaurar sessões:', error);
    }
  }

  async restoreSession(sessionId, userId) {
    if (this.sessions.has(sessionId)) {
      console.log(`⚠️ Sessão ${sessionId} já está ativa`);
      return this.sessions.get(sessionId);
    }

    const sessionData = {
      id: sessionId,
      userId,
      qrCode: null,
      status: 'restoring',
      client: null,
      info: null,
      lastSeen: Date.now()
    };

    const client = await this.createWhatsAppClient(sessionId);
    this.setupClientEvents(client, sessionData);

    sessionData.client = client;
    this.sessions.set(sessionId, sessionData);
    this.sessionLastActivity.set(sessionId, Date.now());

    try {
      await client.initialize();
      console.log(`✅ Sessão ${sessionId} restaurada com sucesso`);
      return sessionData;
    } catch (error) {
      console.error(`❌ Erro ao restaurar sessão ${sessionId}:`, error.message);
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  async createWhatsAppClient(sessionId) {
    console.log(`🔧 Criando cliente WhatsApp para sessão ${sessionId}...`);

    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '/usr/bin/chromium-browser';
    console.log(`🔍 Puppeteer executable path: ${execPath}`);

    if (!fs.existsSync(execPath)) {
      console.error(`❌ Chromium não encontrado em: ${execPath}`);
      throw new Error(`Chromium não encontrado em: ${execPath}`);
    }
    console.log(`✅ Chromium encontrado em: ${execPath}`);

    const clientConfig = {
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-default-browser-check',
          '--disable-software-rasterizer',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        executablePath: execPath,
        timeout: 180000
      },
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: path.join(__dirname, '..', '.wwebjs_auth')
      }),
      markOnlineAvailable: false,
      syncFullHistory: false,
      disableAutoSeen: true
    };

    console.log(`📋 Configuração do Puppeteer:`, JSON.stringify({
      headless: clientConfig.puppeteer.headless,
      executablePath: clientConfig.puppeteer.executablePath,
      timeout: clientConfig.puppeteer.timeout,
      argsCount: clientConfig.puppeteer.args.length,
      authStrategy: 'LocalAuth'
    }, null, 2));

    console.log(`✅ Cliente WhatsApp criado com sucesso para sessão ${sessionId}`);
    return new Client(clientConfig);
  }

  async createSession(sessionId, userId) {
    console.log(`🆕 Criando nova sessão: ${sessionId}`);

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
      info: null,
      lastSeen: Date.now()
    };

    console.log(`🤖 Inicializando cliente WhatsApp para sessão ${sessionId}...`);
    const client = await this.createWhatsAppClient(sessionId);
    this.setupClientEvents(client, sessionData);

    sessionData.client = client;
    this.sessions.set(sessionId, sessionData);
      this.sessionLastActivity.set(sessionId, Date.now());

    console.log(`⏳ Iniciando cliente ${sessionId} em background...`);

    // Inicializa em background sem bloquear
    this.initializeClientInBackground(client, sessionData);

    return sessionData;
  }

  async initializeClientInBackground(client, sessionData) {
    try {
      console.log(`🚀 Inicializando cliente ${sessionData.id} em background...`);
      console.log(`⏱️ Timeout configurado: 180 segundos`);

      const initPromise = client.initialize();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout: Chromium não inicializou em 180 segundos')), 180000)
      );

      await Promise.race([initPromise, timeoutPromise]);

      console.log(`✅ Cliente ${sessionData.id} inicializado com sucesso`);
      this.reconnectAttempts.delete(sessionData.id);
    } catch (error) {
      console.error(`❌ Erro ao inicializar cliente ${sessionData.id}:`, error.message);
      console.error(`📋 Stack trace:`, error.stack);

      if (sessionData.client) {
        try {
          await sessionData.client.destroy();
        } catch (e) {
          console.error(`⚠️ Erro ao destruir cliente ${sessionData.id}:`, e.message);
          console.error(`📋 Stack trace ao destruir:`, e.stack);
        }
      }

      this.sessions.delete(sessionData.id);
      await this.db.updateSessionStatus(sessionData.id, 'failed');

      console.log(`💾 Sessão ${sessionData.id} marcada como 'failed' no banco`);
    }
  }

  setupClientEvents(client, sessionData) {
    client.on('error', (error) => {
      if (error.message && error.message.includes('evaluation failed') && error.message.includes('markedUnread')) {
        console.log(`⚠️ [${sessionData.id}] Erro ignorado (sendSeen): ${error.message.substring(0, 100)}...`);
        return;
      }
      console.error(`❌ [${sessionData.id}] Erro no cliente:`, error);
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ [${sessionData.id}] Loading: ${percent}% - ${message}`);
      sessionData.lastSeen = Date.now();

      this.io.to(`user_${sessionData.userId}`).emit('loading_screen', {
        sessionId: sessionData.id,
        percent,
        message
      });
    });

    client.on('qr', async (qr) => {
      console.log(`📱 QR Code gerado para sessão: ${sessionData.id}`);
      sessionData.qrCode = await QRCode.toDataURL(qr);
      sessionData.status = 'qr_code';
      sessionData.lastSeen = Date.now();

      this.io.to(`user_${sessionData.userId}`).emit('qr_code', {
        sessionId: sessionData.id,
        qrCode: sessionData.qrCode
      });
    });

    client.on('authenticated', async () => {
      console.log(`✅ Autenticado: ${sessionData.id}`);
      sessionData.status = 'authenticated';
      sessionData.lastSeen = Date.now();

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
      sessionData.lastSeen = Date.now();
      this.reconnectAttempts.delete(sessionData.id);

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
      sessionData.lastSeen = Date.now();

      await this.db.updateSessionStatus(sessionData.id, 'auth_failure');

      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionData.id,
        error: 'Falha na autenticação'
      });
    });

    client.on('disconnected', async (reason) => {
      console.log(`🔴 Desconectado: ${sessionData.id}`, reason);
      sessionData.status = 'disconnected';
      sessionData.lastSeen = Date.now();

      await this.db.updateSessionStatus(sessionData.id, 'disconnected');

      this.io.to(`user_${sessionData.userId}`).emit('session_disconnected', {
        sessionId: sessionData.id,
        reason
      });

      await this.attemptReconnect(sessionData);
    });

    client.on('remote_session_saved', () => {
      console.log(`💾 Sessão local salva: ${sessionData.id}`);
      sessionData.lastSeen = Date.now();
    });

    client.on('message', async (message) => {
      const contactPhone = message.from.replace('@c.us', '');
      sessionData.lastSeen = Date.now();

      if (message.from.includes('status@broadcast') || message.from.includes('@lid')) {
        console.log(`⏭️ Ignorando mensagem de ${message.from} (status/lid)`);
        return;
      }

      console.log(`📩 Mensagem recebida - SessionId: ${sessionData.id}, From: ${contactPhone}, FromMe: ${message.fromMe}`);

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

      const sessionKey = `${sessionData.id}_${contactPhone}`;
      if (!this.inMemoryMessages.has(sessionKey)) {
        this.inMemoryMessages.set(sessionKey, []);
      }
      this.inMemoryMessages.get(sessionKey).push(messageData);

      const messages = this.inMemoryMessages.get(sessionKey);
      if (messages.length > 100) {
        messages.shift();
      }

      await this.db.upsertContact(sessionData.id, contactPhone, message._data.notifyName);

      this.io.to(`user_${sessionData.userId}`).emit('new_message', {
        sessionId: sessionData.id,
        message: messageData
      });

      console.log(`🔍 Verificando webhook para sessão ${sessionData.id}...`);
      const webhookUrl = await this.db.getSessionWebhook(sessionData.id);

      if (webhookUrl) {
        console.log(`✅ Webhook encontrado: ${webhookUrl}`);
        try {
          const webhookPayload = {
            phone: contactPhone,
            message: messageData.body || '',
            fromMe: message.fromMe,
            timestamp: messageData.timestamp,
            messageId: messageData.id,
            sessionId: sessionData.id,
            userId: sessionData.userId,
            messageType: messageData.messageType,
            mediaUrl: messageData.mediaUrl,
            mediaMimetype: messageData.mediaMimetype
          };

          console.log(`📤 Enviando webhook [message] para ${webhookUrl}`, JSON.stringify(webhookPayload, null, 2));
          const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload),
            timeout: 5000
          });

          if (webhookResponse.ok) {
            const responseText = await webhookResponse.text();
            console.log(`✅ Webhook enviado com sucesso! Status: ${webhookResponse.status}, Response:`, responseText);
          } else {
            const errorText = await webhookResponse.text();
            console.error(`❌ Webhook falhou: ${webhookResponse.status} ${webhookResponse.statusText}`, errorText);
          }
        } catch (error) {
          console.error(`❌ Erro ao enviar webhook:`, error.message, error.stack);
        }
      } else {
        console.warn(`⚠️ Nenhum webhook configurado para sessão ${sessionData.id}`);
      }

      if (!message.fromMe) {
        await this.processAutoReplies(sessionData.id, message);
      }
    });

    client.on('message_create', async (message) => {
      if (message.fromMe) {
        const contactPhone = message.to.replace('@c.us', '');
        sessionData.lastSeen = Date.now();

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

        await this.db.upsertContact(sessionData.id, contactPhone);

        this.io.to(`user_${sessionData.userId}`).emit('message_sent', {
          sessionId: sessionData.id,
          message: messageData
        });

        console.log(`🔍 Verificando webhook para sessão ${sessionData.id} (message_create)...`);
        const webhookUrl = await this.db.getSessionWebhook(sessionData.id);

        if (webhookUrl) {
          console.log(`✅ Webhook encontrado: ${webhookUrl}`);
          try {
            const webhookPayload = {
              phone: contactPhone,
              message: messageData.body || '',
              fromMe: true,
              timestamp: messageData.timestamp,
              messageId: messageData.id,
              sessionId: sessionData.id,
              userId: sessionData.userId,
              messageType: messageData.messageType,
              mediaUrl: messageData.mediaUrl,
              mediaMimetype: messageData.mediaMimetype
            };

            console.log(`📤 Enviando webhook [message] para ${webhookUrl}`, JSON.stringify(webhookPayload, null, 2));
            const webhookResponse = await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
              timeout: 5000
            });

            if (webhookResponse.ok) {
              const responseText = await webhookResponse.text();
              console.log(`✅ Webhook enviado com sucesso! Status: ${webhookResponse.status}, Response:`, responseText);
            } else {
              const errorText = await webhookResponse.text();
              console.error(`❌ Webhook falhou: ${webhookResponse.status} ${webhookResponse.statusText}`, errorText);
            }
          } catch (error) {
            console.error(`❌ Erro ao enviar webhook:`, error.message, error.stack);
          }
        } else {
          console.warn(`⚠️ Nenhum webhook configurado para sessão ${sessionData.id}`);
        }
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

  async attemptReconnect(sessionData) {
    const attempts = this.reconnectAttempts.get(sessionData.id) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      console.log(`❌ Máximo de tentativas de reconexão atingido para ${sessionData.id}`);
      return;
    }

    this.reconnectAttempts.set(sessionData.id, attempts + 1);
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);

    console.log(`🔄 Tentativa ${attempts + 1}/${this.maxReconnectAttempts} de reconexão para ${sessionData.id} em ${delay}ms`);

    setTimeout(async () => {
      try {
        if (sessionData.client) {
          await sessionData.client.initialize();
          console.log(`✅ Reconexão bem-sucedida para ${sessionData.id}`);
        }
      } catch (error) {
        console.error(`❌ Falha na reconexão de ${sessionData.id}:`, error.message);
        await this.attemptReconnect(sessionData);
      }
    }, delay);
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
        userId: session.userId,
        status: session.status,
        info: session.info,
        lastSeen: session.lastSeen
      });
    });
    return sessions;
  }

  async deleteSession(sessionId) {
    console.log(`🗑️ Deletando sessão: ${sessionId}`);
    const session = this.sessions.get(sessionId);

    if (session && session.client) {
      try {
        await session.client.destroy();
        console.log(`✅ Cliente WhatsApp destruído: ${sessionId}`);
      } catch (error) {
        console.error(`⚠️ Erro ao destruir cliente ${sessionId}:`, error.message);
      }
    }

    this.sessions.delete(sessionId);
    this.reconnectAttempts.delete(sessionId);
    await this.db.deleteSession(sessionId);
      this.sessionLastActivity.delete(sessionId);
      // 🧹 Limpar arquivos do disco para liberar memória RAM
      const _sPaths = [
        path.join(__dirname, '..', '.wwebjs_auth', `session-${sessionId}`),
        path.join(__dirname, '..', '.wwebjs_cache', `session-${sessionId}`),
        path.join('/app', '.wwebjs_auth', `session-${sessionId}`),
        path.join('/app', '.wwebjs_cache', `session-${sessionId}`),
      ];
      for (const _sp of _sPaths) {
        try { if (fs.existsSync(_sp)) { fs.rmSync(_sp, { recursive: true, force: true }); console.log(`🗑️ Removido disco: ${_sp}`); } } catch (_e) {}
      }

    console.log(`✅ Sessão ${sessionId} deletada completamente`);
  }

  normalizePhoneNumber(phoneNumber) {
    // Remove caracteres especiais
    let normalized = phoneNumber.replace(/\D/g, '');

    // Adiciona código do país se não tiver
    if (!normalized.startsWith('55')) {
      normalized = `55${normalized}`;
    }

    // Aceita tanto 12 dígitos (55 + DDD + 8 dígitos) quanto 13 dígitos (55 + DDD + 9 + 8 dígitos)
    if (normalized.length === 12 || normalized.length === 13) {
      return normalized;
    }

    // Se tiver menos de 12 dígitos, retorna como está (pode ser número inválido)
    return normalized;
  }

  async sendMessage(sessionId, phoneNumber, message, mediaUrl = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Sessão não encontrada');
    }

    if (session.status !== 'connected') {
      throw new Error(`Sessão não está conectada. Status atual: ${session.status}`);
    }

    const client = session.client;

    // Normaliza o número (adiciona 9 se necessário)
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const chatId = normalizedPhone.includes('@c.us') ? normalizedPhone : `${normalizedPhone}@c.us`;

    console.log(`📞 Enviando mensagem para: ${phoneNumber} → Normalizado: ${normalizedPhone}`);

    try {
      let sentMessage;

      if (mediaUrl) {
        const { MessageMedia } = require('whatsapp-web.js');
        const media = await MessageMedia.fromUrl(mediaUrl);
        sentMessage = await client.sendMessage(chatId, media, { caption: message });
      } else {
        sentMessage = await client.sendMessage(chatId, message);
      }

      const messageData = {
        id: sentMessage.id._serialized,
        sessionId: sessionId,
        contactPhone: normalizedPhone,
        messageType: sentMessage.type,
        body: message,
        mediaUrl: mediaUrl,
        mediaMimetype: null,
        fromMe: true,
        timestamp: sentMessage.timestamp,
        status: 'sent'
      };

      await this.db.upsertContact(sessionId, normalizedPhone);

      session.lastSeen = Date.now();

      return messageData;
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem na sessão ${sessionId}:`, error);

      // Se o número tem 13 dígitos (com 9), tenta com 12 dígitos (sem 9)
      if (normalizedPhone.length === 13 && normalizedPhone.startsWith('55')) {
        try {
          console.log(`🔄 Tentando enviar com 12 dígitos (removendo o 9)...`);
          const phoneWithout9 = normalizedPhone.substring(0, 4) + normalizedPhone.substring(5);
          const chatIdWithout9 = `${phoneWithout9}@c.us`;

          let sentMessage;
          if (mediaUrl) {
            const { MessageMedia } = require('whatsapp-web.js');
            const media = await MessageMedia.fromUrl(mediaUrl);
            sentMessage = await client.sendMessage(chatIdWithout9, media, { caption: message });
          } else {
            sentMessage = await client.sendMessage(chatIdWithout9, message);
          }

          const messageData = {
            id: sentMessage.id._serialized,
            sessionId: sessionId,
            contactPhone: phoneWithout9,
            messageType: sentMessage.type,
            body: message,
            mediaUrl: mediaUrl,
            mediaMimetype: null,
            fromMe: true,
            timestamp: sentMessage.timestamp,
            status: 'sent'
          };

          await this.db.upsertContact(sessionId, phoneWithout9);

          session.lastSeen = Date.now();

          console.log(`✅ Mensagem enviada com 12 dígitos`);
          return messageData;
        } catch (retryError) {
          console.error(`❌ Falha ao enviar com 12 dígitos:`, retryError);
          throw error;
        }
      }

      // Se o número tem 12 dígitos (sem 9), tenta com 13 dígitos (com 9)
      if (normalizedPhone.length === 12 && normalizedPhone.startsWith('55')) {
        try {
          console.log(`🔄 Tentando enviar com 13 dígitos (adicionando o 9)...`);
          const phoneWith9 = normalizedPhone.substring(0, 4) + '9' + normalizedPhone.substring(4);
          const chatIdWith9 = `${phoneWith9}@c.us`;

          let sentMessage;
          if (mediaUrl) {
            const { MessageMedia } = require('whatsapp-web.js');
            const media = await MessageMedia.fromUrl(mediaUrl);
            sentMessage = await client.sendMessage(chatIdWith9, media, { caption: message });
          } else {
            sentMessage = await client.sendMessage(chatIdWith9, message);
          }

          const messageData = {
            id: sentMessage.id._serialized,
            sessionId: sessionId,
            contactPhone: phoneWith9,
            messageType: sentMessage.type,
            body: message,
            mediaUrl: mediaUrl,
            mediaMimetype: null,
            fromMe: true,
            timestamp: sentMessage.timestamp,
            status: 'sent'
          };

          await this.db.upsertContact(sessionId, phoneWith9);

          session.lastSeen = Date.now();

          console.log(`✅ Mensagem enviada com 13 dígitos`);
          return messageData;
        } catch (retryError) {
          console.error(`❌ Falha ao enviar com 13 dígitos:`, retryError);
          throw error;
        }
      }

      throw error;
    }
  }

  async getQRCode(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Sessão não encontrada');
    }

    if (session.status === 'connected') {
      return { status: 'connected', info: session.info };
    }

    if (session.qrCode) {
      return { status: session.status, qrCode: session.qrCode };
    }

    return { status: session.status, message: 'QR Code ainda não foi gerado' };
  }

  async getSessionStatus(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      const dbSession = await this.db.getSession(sessionId);
      if (dbSession) {
        return {
          id: sessionId,
          status: 'disconnected',
          message: 'Sessão existe no banco mas não está ativa na memória'
        };
      }
      throw new Error('Sessão não encontrada');
    }

    return {
      id: session.id,
      status: session.status,
      info: session.info,
      lastSeen: session.lastSeen,
      reconnectAttempts: this.reconnectAttempts.get(sessionId) || 0
    };
  }

  async healthCheck() {
    const health = {
      totalSessions: this.sessions.size,
      connectedSessions: 0,
      disconnectedSessions: 0,
      authStrategy: 'LocalAuth',
      sessions: []
    };

    this.sessions.forEach((session, id) => {
      if (session.status === 'connected' || session.status === 'authenticated') {
        health.connectedSessions++;
      } else {
        health.disconnectedSessions++;
      }

      health.sessions.push({
        id: session.id,
        status: session.status,
        lastSeen: session.lastSeen,
        timeSinceLastSeen: Date.now() - session.lastSeen
      });
    });

    return health;
  }

  async cleanupInactiveSessions(maxInactiveTime = 3600000) {
    const now = Date.now();
    const sessionsToCleanup = [];

    this.sessions.forEach((session, id) => {
      if (session.status === 'disconnected' && (now - session.lastSeen) > maxInactiveTime) {
        sessionsToCleanup.push(id);
      }
    });

    for (const sessionId of sessionsToCleanup) {
      console.log(`🧹 Limpando sessão inativa: ${sessionId}`);
      await this.deleteSession(sessionId);
    }

    return sessionsToCleanup.length;
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

      const sessionFiles = fs.readdirSync(this.sessionDir).filter(f => f.startsWith('session-'));
      for (const sessionFile of sessionFiles) {
        const sessionId = sessionFile.replace('session-', '');

        if (!this.sessions.has(sessionId)) {
          const dbSession = await this.db.getSession(sessionId);

          if (!dbSession) {
            console.log(`📱 Encontrada sessão no disco sem registro no banco: ${sessionId}`);
            console.log(`💾 Criando registro no banco para sessão ${sessionId}...`);

            try {
              await this.db.createSession(sessionId, userId);
              console.log(`✅ Registro criado no banco para sessão ${sessionId}`);

              const sessionPath = path.join(this.sessionDir, sessionFile);
              console.log(`📱 Restaurando sessão do disco: ${sessionId}`);

              const sessionData = {
                id: sessionId,
                userId: userId,
                qrCode: null,
                status: 'initializing',
                client: null,
                info: null
              };

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

              const initPromise = client.initialize();
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Timeout na restauração')), 45000)
              );

              await Promise.race([initPromise, timeoutPromise]);
              restoredCount++;
              console.log(`✅ Sessão ${sessionId} restaurada com sucesso`);
            } catch (error) {
              console.error(`❌ Erro ao restaurar sessão ${sessionId}:`, error.message);
              this.sessions.delete(sessionId);
            }
          }
        }
      }

      console.log(`✅ Processo de restauração concluído. ${restoredCount} sessões ativas.`);
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

    try {
      const result = await session.client.sendMessage(chatId, message, { sendSeen: false });

      console.log(`✅ Mensagem enviada com sucesso! ID: ${result.id._serialized}`);

      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp
      };
    } catch (error) {
      console.error(`❌ Erro ao enviar mensagem:`, error.message);
      throw error;
    }
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

  getInMemoryMessages(sessionId, contactPhone = null) {
    if (contactPhone) {
      const sessionKey = `${sessionId}_${contactPhone}`;
      return this.inMemoryMessages.get(sessionKey) || [];
    }

    const allMessages = [];
    for (const [key, messages] of this.inMemoryMessages.entries()) {
      if (key.startsWith(`${sessionId}_`)) {
        allMessages.push(...messages);
      }
    }
    return allMessages.sort((a, b) => a.timestamp - b.timestamp);
  }

  clearInMemoryMessages(sessionId, contactPhone = null) {
    if (contactPhone) {
      const sessionKey = `${sessionId}_${contactPhone}`;
      this.inMemoryMessages.delete(sessionKey);
      console.log(`🗑️ Mensagens em memória limpas para ${sessionKey}`);
    } else {
      let clearedCount = 0;
      for (const key of this.inMemoryMessages.keys()) {
        if (key.startsWith(`${sessionId}_`)) {
          this.inMemoryMessages.delete(key);
          clearedCount++;
        }
      }
      console.log(`🗑️ ${clearedCount} conversas limpas da memória para sessão ${sessionId}`);
    }
  }
}


  // ═══════════════════════════════════════════════════════════════════
  // AUTO-CLEANUP: Destroi sessões sem atividade após 40s (libera memória)
  // ═══════════════════════════════════════════════════════════════════
  startAutoCleanup() {
    const IDLE_MS = 40 * 1000; // 40 segundos sem atividade
    console.log('🔄 Auto-limpeza iniciada: sessões ociosas serão destruídas após 40s');
    setInterval(async () => {
      const now = Date.now();
      const toDestroy = [];
      for (const [sid, lastTs] of this.sessionLastActivity.entries()) {
        const sess = this.sessions.get(sid);
        if (!sess) { this.sessionLastActivity.delete(sid); continue; }
        const isReady = sess.status === 'ready';
        if (!isReady && (now - lastTs) > IDLE_MS) {
          toDestroy.push({ sid, idleSec: Math.round((now - lastTs) / 1000) });
        }
      }
      for (const { sid, idleSec } of toDestroy) {
        console.log(`🧹 Auto-limpeza: "${sid}" ocioso ${idleSec}s (não conectado) — destruindo...`);
        try {
          await this.deleteSession(sid);
        } catch (e) {
          console.error(`Erro ao auto-limpar ${sid}:`, e.message);
          this.sessions.delete(sid);
          this.sessionLastActivity.delete(sid);
        }
      }
      if (toDestroy.length > 0) {
        console.log(`✅ Auto-limpeza: ${toDestroy.length} sessão(ões) removidas. Sessões ativas: ${this.sessions.size}`);
      }
    }, 10000); // verifica a cada 10 segundos
  }

module.exports = SessionManager;
