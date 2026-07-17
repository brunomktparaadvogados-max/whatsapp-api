const path = require('path');
const QRCode = require('qrcode');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

class WWebJSProvider {
  constructor({ io = null, dataPath = null, maxSessions = 4, sendTimeoutMs = 45000 } = {}) {
    this.io = io;
    this.dataPath = dataPath || process.env.WWEBJS_AUTH_PATH || path.join(__dirname, '..', '.wwebjs_auth');
    this.maxSessions = Number(process.env.WWEBJS_MAX_SESSIONS || maxSessions || 4);
    this.sendTimeoutMs = Number(process.env.WWEBJS_SEND_TIMEOUT_MS || sendTimeoutMs || 45000);
    this.sessions = new Map();
    this.initLocks = new Map();
    this.sendLocks = new Map();
  }

  configured() {
    return true;
  }

  normalizePhone(to) {
    let digits = String(to || '').replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
      digits = `55${digits}`;
    }
    return digits;
  }

  getPhoneVariants(to) {
    const digits = this.normalizePhone(to);
    if (!digits) return [];
    const variants = new Set([digits]);

    if (digits.startsWith('55') && digits.length === 13 && digits[4] === '9') {
      variants.add(`${digits.slice(0, 4)}${digits.slice(5)}`);
    }
    if (digits.startsWith('55') && digits.length === 12) {
      variants.add(`${digits.slice(0, 4)}9${digits.slice(4)}`);
    }

    return [...variants];
  }

  httpError(status, message, code = 'WWEBJS_ERROR', details = null) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.details = details;
    return error;
  }

  sessionView(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return {
        id: sessionId,
        instanceName: `wwebjs_${sessionId}`,
        status: 'not_created',
        canSend: false,
        qrCode: null,
        qr_code: null,
        engine: 'wwebjs'
      };
    }

    const connected = session.status === 'connected';
    return {
      id: sessionId,
      instanceName: `wwebjs_${sessionId}`,
      status: session.status,
      canSend: connected,
      qrCode: connected ? null : session.qrCode,
      qr_code: connected ? null : session.qrCode,
      engine: 'wwebjs',
      info: session.info || null,
      lastSeen: session.lastSeen || null
    };
  }

  async evictIfNeeded(exceptSessionId = null) {
    const live = [...this.sessions.values()].filter(s => s.client && s.status === 'connected');
    if (live.length < this.maxSessions) return;

    live
      .filter(s => s.id !== exceptSessionId)
      .sort((a, b) => (a.lastSeen || 0) - (b.lastSeen || 0));

    const victim = live.find(s => s.id !== exceptSessionId);
    if (!victim) return;

    try {
      await victim.client.destroy();
    } catch (_) {
      // ignore destroy errors
    }
    victim.client = null;
    victim.status = 'authenticated';
  }

  createClient(sessionId) {
    return new Client({
      authStrategy: new LocalAuth({
        clientId: sessionId,
        dataPath: this.dataPath
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote',
          '--disable-extensions'
        ],
        timeout: Number(process.env.WWEBJS_PUPPETEER_TIMEOUT_MS || 180000),
        protocolTimeout: Number(process.env.WWEBJS_PUPPETEER_TIMEOUT_MS || 180000)
      }
    });
  }

  async ensureSession(sessionId, { userId = null } = {}) {
    const existing = this.sessions.get(sessionId);
    if (existing?.client) return existing;

    if (this.initLocks.has(sessionId)) return await this.initLocks.get(sessionId);

    const initPromise = (async () => {
      await this.evictIfNeeded(sessionId);

      const session = existing || {
        id: sessionId,
        userId,
        client: null,
        status: 'initializing',
        qrCode: null,
        info: null,
        lastSeen: Date.now()
      };
      session.userId = userId || session.userId;
      session.status = 'initializing';
      session.lastSeen = Date.now();
      this.sessions.set(sessionId, session);

      const client = this.createClient(sessionId);
      session.client = client;
      this.bindClientEvents(client, session);
      client.initialize().catch(error => {
        session.status = 'failed';
        session.lastError = error.message;
      });

      return session;
    })();

    this.initLocks.set(sessionId, initPromise);
    try {
      return await initPromise;
    } finally {
      this.initLocks.delete(sessionId);
    }
  }

  bindClientEvents(client, session) {
    client.on('qr', async qr => {
      session.qrCode = await QRCode.toDataURL(qr);
      session.status = 'qr_code';
      session.lastSeen = Date.now();
      if (this.io && session.userId) {
        this.io.to(`user_${session.userId}`).emit('qr_code', {
          sessionId: session.id,
          qrCode: session.qrCode
        });
      }
    });

    client.on('authenticated', () => {
      session.status = 'authenticated';
      session.lastSeen = Date.now();
    });

    client.on('ready', () => {
      session.status = 'connected';
      session.qrCode = null;
      session.lastSeen = Date.now();
      session.info = client.info || null;
      if (this.io && session.userId) {
        this.io.to(`user_${session.userId}`).emit('session_connected', {
          sessionId: session.id,
          info: session.info,
          engine: 'wwebjs'
        });
      }
    });

    client.on('disconnected', reason => {
      session.status = 'disconnected';
      session.lastSeen = Date.now();
      session.lastError = reason || null;
      if (this.io && session.userId) {
        this.io.to(`user_${session.userId}`).emit('session_disconnected', {
          sessionId: session.id,
          reason,
          engine: 'wwebjs'
        });
      }
    });

    client.on('auth_failure', message => {
      session.status = 'auth_failure';
      session.qrCode = null;
      session.lastSeen = Date.now();
      session.lastError = message || null;
    });
  }

  async getQr(sessionId, { waitMs = 8000, userId = null } = {}) {
    const session = await this.ensureSession(sessionId, { userId });
    const started = Date.now();
    while (Date.now() - started <= waitMs) {
      const view = this.sessionView(sessionId);
      if (view.status === 'connected' || view.qrCode) return view;
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    return this.sessionView(sessionId);
  }

  async getState(sessionId) {
    return this.sessionView(sessionId);
  }

  async logout(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session?.client) {
      try {
        await session.client.logout();
      } catch (_) {
        try { await session.client.destroy(); } catch (__) { /* ignore */ }
      }
    }
    this.sessions.delete(sessionId);
    return { success: true };
  }

  async deleteInstance(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session?.client) {
      try { await session.client.destroy(); } catch (_) { /* ignore */ }
    }
    this.sessions.delete(sessionId);
    return { success: true };
  }

  async waitUntilReady(sessionId, waitMs = 90000) {
    const started = Date.now();
    while (Date.now() - started <= waitMs) {
      const session = this.sessions.get(sessionId);
      if (session?.status === 'connected' && session.client) return session;
      if (['qr_code', 'auth_failure', 'failed'].includes(session?.status)) return session;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    return this.sessions.get(sessionId) || null;
  }

  async sendWithTimeout(client, chatId, text, mediaUrl = null) {
    const sendPromise = mediaUrl
      ? MessageMedia.fromUrl(mediaUrl).then(media => client.sendMessage(chatId, media, { caption: text }))
      : client.sendMessage(chatId, text);
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(this.httpError(504, 'Timeout ao enviar via WhatsApp Web fallback.', 'WWEBJS_SEND_TIMEOUT')), this.sendTimeoutMs);
    });
    return await Promise.race([sendPromise, timeoutPromise]);
  }

  async sendText(sessionId, to, text, { mediaUrl = null, userId = null } = {}) {
    const previous = this.sendLocks.get(sessionId) || Promise.resolve();
    const current = previous.catch(() => {}).then(() => this._sendTextUnlocked(sessionId, to, text, { mediaUrl, userId }));
    this.sendLocks.set(sessionId, current);
    try {
      return await current;
    } finally {
      if (this.sendLocks.get(sessionId) === current) this.sendLocks.delete(sessionId);
    }
  }

  async _sendTextUnlocked(sessionId, to, text, { mediaUrl = null, userId = null } = {}) {
    await this.ensureSession(sessionId, { userId });
    const session = await this.waitUntilReady(sessionId);
    if (!session || session.status !== 'connected' || !session.client) {
      throw this.httpError(
        409,
        'WhatsApp Web fallback ainda nao esta conectado. Escaneie o QR deste canal antes do disparo.',
        'WWEBJS_SESSION_NOT_CONNECTED',
        this.sessionView(sessionId)
      );
    }

    const variants = this.getPhoneVariants(to);
    let numberId = null;
    let resolvedPhone = variants[0] || this.normalizePhone(to);
    for (const candidate of variants) {
      numberId = await session.client.getNumberId(candidate);
      if (numberId) {
        resolvedPhone = candidate;
        break;
      }
    }

    if (!numberId) {
      throw this.httpError(422, 'Numero nao registrado no WhatsApp.', 'invalid_number', { to, variants });
    }

    const chatId = numberId._serialized || `${resolvedPhone}@c.us`;
    const sentMessage = await this.sendWithTimeout(session.client, chatId, text, mediaUrl);
    const messageId = sentMessage?.id?._serialized || sentMessage?.id?.id || null;
    if (!messageId) {
      throw this.httpError(502, 'WhatsApp Web nao retornou ID de mensagem.', 'WWEBJS_UNCONFIRMED_SEND');
    }

    session.lastSeen = Date.now();
    return {
      provider: 'wwebjs',
      sessionId,
      instanceName: `wwebjs_${sessionId}`,
      to: resolvedPhone,
      messageId,
      raw: {
        id: messageId,
        timestamp: sentMessage.timestamp,
        chatId
      }
    };
  }

  async sendMedia(sessionId, to, mediaUrl, caption = '', options = {}) {
    return await this.sendText(sessionId, to, caption, { ...options, mediaUrl });
  }
}

module.exports = WWebJSProvider;
