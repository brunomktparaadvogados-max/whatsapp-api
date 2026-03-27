const { Client, LocalAuth } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════
// LIMITES DE MEMÓRIA — Evita sobrecarga no Koyeb
// ═══════════════════════════════════════════════════════════════════
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 4;
const QR_CODE_TIMEOUT_MS = 5 * 60 * 1000;       // 5 minutos para escanear QR
const IDLE_CLEANUP_MS = 10 * 60 * 1000;          // 10 minutos de inatividade
const CLEANUP_INTERVAL_MS = 30 * 1000;           // verifica a cada 30 segundos
const SESSION_INIT_TIMEOUT_MS = 120000;           // 2 minutos para Chromium iniciar

class SessionManager {
  constructor(database, io) {
    this.sessions = new Map();
    this.db = database;
    this.io = io;
    this.reconnectAttempts = new Map();
    this.maxReconnectAttempts = 3;
    this.inMemoryMessages = new Map();
    this.sessionLastActivity = new Map();
    this.sessionCreationQueue = [];
    this.isProcessingQueue = false;

    this.init();
  }

  async init() {
    console.log('⚠️ MongoDB/Mongoose não é mais usado. Usando PostgreSQL (Supabase).');
    console.log('✅ Banco de dados configurado via DATABASE_URL');
    console.log(`📊 Limite de sessões simultâneas: ${MAX_CONCURRENT_SESSIONS}`);

    // Em vez de restaurar todas as sessões (que cria N processos Chromium),
    // apenas marca todas como desconectadas. Usuário reconecta sob demanda.
    await this.markAllSessionsDisconnected();

    // Inicia limpeza automática inteligente
    this.startAutoCleanup();
  }

  // ═══════════════════════════════════════════════════════════════════
  // STARTUP: Marca todas as sessões como desconectadas (não cria Chromium)
  // Isso evita 21 processos Chromium no startup que causa crash de memória
  // ═══════════════════════════════════════════════════════════════════
  async markAllSessionsDisconnected() {
    try {
      console.log('🔄 Marcando todas as sessões como desconectadas (startup limpo)...');
      const dbSessions = await this.db.getAllSessionsFromDB();
      console.log(`📊 Total de sessões no banco: ${dbSessions.length}`);

      let cleaned = 0;
      for (const session of dbSessions) {
        const sessionId = session.id;

        // Remove sessões inválidas
        if (!sessionId || sessionId === 'T' || sessionId === 'test' || sessionId === 'default') {
          console.log(`🗑️ Removendo sessão inválida: ${sessionId}`);
          await this.db.deleteSession(sessionId);
          cleaned++;
          continue;
        }

        if (!sessionId.startsWith('user_')) {
          console.log(`⚠️ Sessão ${sessionId} não segue padrão user_X, removendo...`);
          await this.db.deleteSession(sessionId);
          cleaned++;
          continue;
        }

        // Marca como disconnected em vez de tentar restaurar
        if (session.status === 'connected' || session.status === 'authenticated') {
          await this.db.updateSessionStatus(sessionId, 'disconnected');
          console.log(`📴 Sessão ${sessionId}: ${session.status} → disconnected`);
        }
      }

      if (cleaned > 0) {
        console.log(`🗑️ ${cleaned} sessões inválidas removidas`);
      }
      console.log(`✅ Startup limpo concluído. 0 processos Chromium criados (economia de memória).`);
      console.log(`💡 Sessões serão reconectadas sob demanda quando o usuário acessar.`);
    } catch (error) {
      console.error('❌ Erro ao marcar sessões como desconectadas:', error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // CRIAÇÃO DE SESSÃO — Com fila para limitar Chromium simultâneos
  // ═══════════════════════════════════════════════════════════════════
  getActiveChromiumCount() {
    let count = 0;
    this.sessions.forEach((session) => {
      if (session.client) count++;
    });
    return count;
  }

  async createSession(sessionId, userId) {
    console.log(`🆕 Criando nova sessão: ${sessionId}`);

    // Se a sessão já existe na memória E tem cliente ativo, retorna ela
    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId);
      if (existing.client && (existing.status === 'connected' || existing.status === 'qr_code' || existing.status === 'initializing')) {
        console.log(`⚠️ Sessão ${sessionId} já existe na memória com status ${existing.status}`);
        return existing;
      }
      // Se está em estado morto, limpa primeiro
      console.log(`🧹 Sessão ${sessionId} existe na memória mas está morta (${existing.status}), limpando...`);
      await this.cleanupSession(sessionId);
    }

    // Se existe no banco mas não na memória, DELETE o registro antigo
    const existingDbSession = await this.db.getSession(sessionId);
    if (existingDbSession) {
      console.log(`🔄 Sessão ${sessionId} existe no banco com status '${existingDbSession.status}', recriando...`);
      await this.db.deleteSession(sessionId);
    }

    // Verifica limite de Chromium simultâneos
    const activeCount = this.getActiveChromiumCount();
    if (activeCount >= MAX_CONCURRENT_SESSIONS) {
      console.warn(`⚠️ Limite de ${MAX_CONCURRENT_SESSIONS} sessões Chromium atingido (${activeCount} ativas)`);
      // Tenta liberar sessões mortas/inativas
      await this.forceCleanupDeadSessions();

      const newCount = this.getActiveChromiumCount();
      if (newCount >= MAX_CONCURRENT_SESSIONS) {
        throw new Error(`Limite de sessões simultâneas atingido (${MAX_CONCURRENT_SESSIONS}). Tente novamente em alguns minutos.`);
      }
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
      lastSeen: Date.now(),
      createdAt: Date.now()
    };

    console.log(`🤖 Inicializando cliente WhatsApp para sessão ${sessionId}...`);
    const client = await this.createWhatsAppClient(sessionId);
    this.setupClientEvents(client, sessionData);

    sessionData.client = client;
    this.sessions.set(sessionId, sessionData);
    this.sessionLastActivity.set(sessionId, Date.now());

    console.log(`⏳ Iniciando cliente ${sessionId} em background...`);
    console.log(`📊 Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);

    // Inicializa em background sem bloquear
    this.initializeClientInBackground(client, sessionData);

    return sessionData;
  }

  async initializeClientInBackground(client, sessionData) {
    try {
      console.log(`🚀 Inicializando cliente ${sessionData.id} em background...`);
      console.log(`⏱️ Timeout configurado: ${SESSION_INIT_TIMEOUT_MS / 1000} segundos`);

      const initPromise = client.initialize();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: Chromium não inicializou em ${SESSION_INIT_TIMEOUT_MS / 1000} segundos`)), SESSION_INIT_TIMEOUT_MS)
      );

      await Promise.race([initPromise, timeoutPromise]);

      console.log(`✅ Cliente ${sessionData.id} inicializado com sucesso`);
      this.reconnectAttempts.delete(sessionData.id);
    } catch (error) {
      console.error(`❌ Erro ao inicializar cliente ${sessionData.id}:`, error.message);

      // Limpa recursos sem deletar do banco (permite tentar de novo)
      await this.cleanupSession(sessionData.id);
      await this.db.updateSessionStatus(sessionData.id, 'failed');

      console.log(`💾 Sessão ${sessionData.id} marcada como 'failed' no banco`);
    }
  }

  // Limpa sessão da memória e destrói Chromium, sem tocar no banco
  async cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session && session.client) {
      try {
        await session.client.destroy();
        console.log(`✅ Cliente Chromium destruído: ${sessionId}`);
      } catch (e) {
        console.error(`⚠️ Erro ao destruir cliente ${sessionId}:`, e.message);
      }
    }
    this.sessions.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
    this.reconnectAttempts.delete(sessionId);

    // Limpa arquivos do disco para liberar espaço
    this.cleanupSessionFiles(sessionId);
  }

  cleanupSessionFiles(sessionId) {
    const paths = [
      path.join(__dirname, '..', '.wwebjs_auth', `session-${sessionId}`),
      path.join(__dirname, '..', '.wwebjs_cache', `session-${sessionId}`),
      path.join('/app', '.wwebjs_auth', `session-${sessionId}`),
      path.join('/app', '.wwebjs_cache', `session-${sessionId}`),
    ];
    for (const p of paths) {
      try {
        if (fs.existsSync(p)) {
          fs.rmSync(p, { recursive: true, force: true });
          console.log(`🗑️ Removido disco: ${p}`);
        }
      } catch (_e) {}
    }
  }

  async forceCleanupDeadSessions() {
    const toClean = [];
    this.sessions.forEach((session, id) => {
      // Limpa sessões em estado terminal ou mortas há muito tempo
      if (['failed', 'auth_failure', 'disconnected'].includes(session.status)) {
        toClean.push(id);
      }
    });
    for (const id of toClean) {
      console.log(`🧹 Forçando limpeza de sessão morta: ${id} (status: ${this.sessions.get(id)?.status})`);
      await this.cleanupSession(id);
    }
    if (toClean.length > 0) {
      console.log(`✅ ${toClean.length} sessões mortas limpas. Chromium ativos: ${this.getActiveChromiumCount()}`);
    }
  }

  async createWhatsAppClient(sessionId) {
    console.log(`🔧 Criando cliente WhatsApp para sessão ${sessionId}...`);

    const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_BIN || '/usr/bin/chromium-browser';

    if (!fs.existsSync(execPath)) {
      // Tenta path alternativo
      const altPath = '/usr/bin/chromium';
      if (fs.existsSync(altPath)) {
        console.log(`✅ Chromium encontrado em path alternativo: ${altPath}`);
      } else {
        console.error(`❌ Chromium não encontrado em: ${execPath} nem ${altPath}`);
        throw new Error(`Chromium não encontrado`);
      }
    }

    const actualExecPath = fs.existsSync(execPath) ? execPath : '/usr/bin/chromium';

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
          '--js-flags=--max-old-space-size=128',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ],
        executablePath: actualExecPath,
        timeout: SESSION_INIT_TIMEOUT_MS
      },
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: path.join(__dirname, '..', '.wwebjs_auth')
      }),
      markOnlineAvailable: false,
      syncFullHistory: false,
      disableAutoSeen: true
    };

    return new Client(clientConfig);
  }

  setupClientEvents(client, sessionData) {
    client.on('error', (error) => {
      if (error.message && error.message.includes('evaluation failed') && error.message.includes('markedUnread')) {
        return; // Erro ignorável
      }
      console.error(`❌ [${sessionData.id}] Erro no cliente:`, error.message);
    });

    client.on('loading_screen', (percent, message) => {
      console.log(`⏳ [${sessionData.id}] Loading: ${percent}% - ${message}`);
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());

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
      this.sessionLastActivity.set(sessionData.id, Date.now());

      await this.db.updateSessionStatus(sessionData.id, 'qr_code');

      this.io.to(`user_${sessionData.userId}`).emit('qr_code', {
        sessionId: sessionData.id,
        qrCode: sessionData.qrCode
      });
    });

    client.on('authenticated', async () => {
      console.log(`✅ Autenticado: ${sessionData.id}`);
      sessionData.status = 'authenticated';
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());

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
      this.sessionLastActivity.set(sessionData.id, Date.now());
      this.reconnectAttempts.delete(sessionData.id);

      await this.db.updateSessionStatus(
        sessionData.id,
        'connected',
        client.info.wid._serialized,
        client.info.pushname
      );

      console.log(`💾 Sessão ${sessionData.id} salva com status: connected`);
      console.log(`📞 Número: ${client.info.wid._serialized} | 👤 Nome: ${client.info.pushname}`);
      console.log(`📊 Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);

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

      // Limpa recursos de Chromium mas mantém registro no banco
      await this.cleanupSession(sessionData.id);

      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionData.id,
        error: 'Falha na autenticação. Tente reconectar.'
      });
    });

    client.on('disconnected', async (reason) => {
      console.log(`🔴 Desconectado: ${sessionData.id} - Motivo: ${reason}`);
      sessionData.status = 'disconnected';
      sessionData.lastSeen = Date.now();

      await this.db.updateSessionStatus(sessionData.id, 'disconnected');

      this.io.to(`user_${sessionData.userId}`).emit('session_disconnected', {
        sessionId: sessionData.id,
        reason
      });

      // Tenta reconectar apenas se o motivo não for logout manual
      if (reason !== 'LOGOUT' && reason !== 'CONFLICT') {
        await this.attemptReconnect(sessionData);
      } else {
        // Limpa recursos de Chromium
        await this.cleanupSession(sessionData.id);
      }
    });

    client.on('remote_session_saved', () => {
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());
    });

    client.on('message', async (message) => {
      const contactPhone = message.from.replace('@c.us', '');
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());

      if (message.from.includes('status@broadcast') || message.from.includes('@lid')) {
        return;
      }

      console.log(`📩 Msg recebida - Session: ${sessionData.id}, From: ${contactPhone}`);

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
          console.error('Erro ao baixar mídia:', error.message);
        }
      }

      // Armazena em memória (máx 50 por conversa para economizar RAM)
      const sessionKey = `${sessionData.id}_${contactPhone}`;
      if (!this.inMemoryMessages.has(sessionKey)) {
        this.inMemoryMessages.set(sessionKey, []);
      }
      this.inMemoryMessages.get(sessionKey).push(messageData);
      const messages = this.inMemoryMessages.get(sessionKey);
      if (messages.length > 50) {
        messages.shift();
      }

      await this.db.upsertContact(sessionData.id, contactPhone, message._data.notifyName);

      this.io.to(`user_${sessionData.userId}`).emit('new_message', {
        sessionId: sessionData.id,
        message: messageData
      });

      // Webhook
      const webhookUrl = await this.db.getSessionWebhook(sessionData.id);
      if (webhookUrl) {
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

          const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload),
            timeout: 5000
          });

          if (!webhookResponse.ok) {
            console.error(`❌ Webhook falhou: ${webhookResponse.status}`);
          }
        } catch (error) {
          console.error(`❌ Erro webhook:`, error.message);
        }
      }

      if (!message.fromMe) {
        await this.processAutoReplies(sessionData.id, message);
      }
    });

    client.on('message_create', async (message) => {
      if (message.fromMe) {
        const contactPhone = message.to.replace('@c.us', '');
        sessionData.lastSeen = Date.now();
        this.sessionLastActivity.set(sessionData.id, Date.now());

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

        // Webhook
        const webhookUrl = await this.db.getSessionWebhook(sessionData.id);
        if (webhookUrl) {
          try {
            const webhookPayload = {
              phone: contactPhone,
              message: messageData.body || '',
              fromMe: true,
              timestamp: messageData.timestamp,
              messageId: messageData.id,
              sessionId: sessionData.id,
              userId: sessionData.userId
            };

            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
              timeout: 5000
            });
          } catch (error) {
            console.error(`❌ Erro webhook:`, error.message);
          }
        }
      }
    });

    client.on('message_ack', async (message, ack) => {
      const statusMap = { 0: 'error', 1: 'pending', 2: 'sent', 3: 'delivered', 4: 'read' };
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
      await this.cleanupSession(sessionData.id);
      return;
    }

    this.reconnectAttempts.set(sessionData.id, attempts + 1);
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);

    console.log(`🔄 Tentativa ${attempts + 1}/${this.maxReconnectAttempts} para ${sessionData.id} em ${delay}ms`);

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
    try {
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
    } catch (error) {
      console.error(`❌ Erro em auto-replies para ${sessionId}:`, error.message);
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

    await this.cleanupSession(sessionId);
    await this.db.deleteSession(sessionId);

    // Limpa mensagens em memória dessa sessão
    for (const key of this.inMemoryMessages.keys()) {
      if (key.startsWith(`${sessionId}_`)) {
        this.inMemoryMessages.delete(key);
      }
    }

    console.log(`✅ Sessão ${sessionId} deletada completamente`);
  }

  normalizePhoneNumber(phoneNumber) {
    let normalized = phoneNumber.replace(/\D/g, '');

    if (!normalized.startsWith('55')) {
      normalized = `55${normalized}`;
    }

    if (normalized.length === 12 || normalized.length === 13) {
      return normalized;
    }

    return normalized;
  }

  async sendMessage(sessionId, phoneNumber, message, mediaUrl = null) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      throw new Error('Sessão não encontrada');
    }

    if (session.status !== 'connected' && session.status !== 'authenticated') {
      throw new Error(`Sessão não está conectada. Status atual: ${session.status}`);
    }

    const client = session.client;
    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const chatId = normalizedPhone.includes('@c.us') ? normalizedPhone : `${normalizedPhone}@c.us`;

    console.log(`📞 Enviando para: ${phoneNumber} → ${normalizedPhone}`);

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
      this.sessionLastActivity.set(sessionId, Date.now());

      return messageData;
    } catch (error) {
      console.error(`❌ Erro ao enviar na sessão ${sessionId}:`, error.message);

      // Retry com/sem 9º dígito
      if (normalizedPhone.length === 13 && normalizedPhone.startsWith('55')) {
        try {
          console.log(`🔄 Tentando sem 9º dígito...`);
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

          await this.db.upsertContact(sessionId, phoneWithout9);
          session.lastSeen = Date.now();
          this.sessionLastActivity.set(sessionId, Date.now());

          return {
            id: sentMessage.id._serialized,
            sessionId, contactPhone: phoneWithout9,
            messageType: sentMessage.type, body: message,
            mediaUrl, mediaMimetype: null, fromMe: true,
            timestamp: sentMessage.timestamp, status: 'sent'
          };
        } catch (retryError) {
          throw error;
        }
      }

      if (normalizedPhone.length === 12 && normalizedPhone.startsWith('55')) {
        try {
          console.log(`🔄 Tentando com 9º dígito...`);
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

          await this.db.upsertContact(sessionId, phoneWith9);
          session.lastSeen = Date.now();
          this.sessionLastActivity.set(sessionId, Date.now());

          return {
            id: sentMessage.id._serialized,
            sessionId, contactPhone: phoneWith9,
            messageType: sentMessage.type, body: message,
            mediaUrl, mediaMimetype: null, fromMe: true,
            timestamp: sentMessage.timestamp, status: 'sent'
          };
        } catch (retryError) {
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
          message: 'Sessão existe no banco mas não está ativa. Clique em "Criar Sessão" para reconectar.'
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
    const memUsage = process.memoryUsage();
    const health = {
      totalSessions: this.sessions.size,
      connectedSessions: 0,
      disconnectedSessions: 0,
      authStrategy: 'LocalAuth',
      maxConcurrent: MAX_CONCURRENT_SESSIONS,
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      },
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

  // Mantém compatibilidade mas não faz nada perigoso no Koyeb
  async restoreAllSessions() {
    console.log('⚠️ restoreAllSessions chamado — redirecionando para markAllSessionsDisconnected');
    await this.markAllSessionsDisconnected();
  }

  async restoreSessionsFromDatabase(userId) {
    console.log('⚠️ restoreSessionsFromDatabase chamado — no Koyeb sem dados persistentes, ignorando');
    console.log('💡 Sessões serão criadas sob demanda quando o usuário acessar');
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
    } else {
      for (const key of this.inMemoryMessages.keys()) {
        if (key.startsWith(`${sessionId}_`)) {
          this.inMemoryMessages.delete(key);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-CLEANUP INTELIGENTE:
  // - Sessões qr_code: remove após 5 minutos (QR expirou)
  // - Sessões failed/disconnected sem cliente: remove após 10 minutos
  // - Sessões connected/authenticated: NUNCA remove automaticamente
  // ═══════════════════════════════════════════════════════════════════
  startAutoCleanup() {
    console.log(`🔄 Auto-limpeza inteligente iniciada (verifica a cada ${CLEANUP_INTERVAL_MS / 1000}s)`);
    console.log(`   - QR Code timeout: ${QR_CODE_TIMEOUT_MS / 1000}s`);
    console.log(`   - Idle cleanup: ${IDLE_CLEANUP_MS / 1000}s`);

    setInterval(async () => {
      const now = Date.now();
      const toDestroy = [];

      for (const [sid, lastTs] of this.sessionLastActivity.entries()) {
        const sess = this.sessions.get(sid);
        if (!sess) {
          this.sessionLastActivity.delete(sid);
          continue;
        }

        // NUNCA remove sessões connected ou authenticated
        if (sess.status === 'connected' || sess.status === 'authenticated') {
          continue;
        }

        // Sessões com QR code: remove após QR_CODE_TIMEOUT_MS (QR expirou)
        if (sess.status === 'qr_code' && (now - lastTs) > QR_CODE_TIMEOUT_MS) {
          toDestroy.push({ sid, reason: `QR expirado (${Math.round((now - lastTs) / 1000)}s)` });
          continue;
        }

        // Sessões inicializando: permite até SESSION_INIT_TIMEOUT_MS + margem
        if (sess.status === 'initializing' && (now - lastTs) > (SESSION_INIT_TIMEOUT_MS + 30000)) {
          toDestroy.push({ sid, reason: `Inicialização travada (${Math.round((now - lastTs) / 1000)}s)` });
          continue;
        }

        // Sessões mortas (failed, disconnected, etc): remove após IDLE_CLEANUP_MS
        if (['failed', 'disconnected', 'auth_failure'].includes(sess.status) && (now - lastTs) > IDLE_CLEANUP_MS) {
          toDestroy.push({ sid, reason: `Inativa ${Math.round((now - lastTs) / 1000)}s (${sess.status})` });
          continue;
        }
      }

      for (const { sid, reason } of toDestroy) {
        console.log(`🧹 Auto-limpeza: "${sid}" — ${reason}`);
        try {
          await this.cleanupSession(sid);
        } catch (e) {
          console.error(`Erro ao auto-limpar ${sid}:`, e.message);
          this.sessions.delete(sid);
          this.sessionLastActivity.delete(sid);
        }
      }

      if (toDestroy.length > 0) {
        console.log(`✅ Auto-limpeza: ${toDestroy.length} sessão(ões) removidas. Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);
      }
    }, CLEANUP_INTERVAL_MS);
  }
}

module.exports = SessionManager;
