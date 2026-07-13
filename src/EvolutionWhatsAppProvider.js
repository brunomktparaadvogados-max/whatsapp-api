const axios = require('axios');

class EvolutionWhatsAppProvider {
  constructor({ baseUrl, apiKey, webhookUrl = null, webhookSecret = null, instancePrefix = 'pf' } = {}) {
    this.baseUrl = String(baseUrl || '').replace(/\/+$/, '');
    this.apiKey = apiKey || '';
    this.webhookUrl = webhookUrl;
    this.webhookSecret = webhookSecret;
    this.instancePrefix = instancePrefix;
    this.qrCache = new Map();
    this.stateCache = new Map();

    this.http = axios.create({
      baseURL: this.baseUrl || undefined,
      timeout: parseInt(process.env.EVOLUTION_HTTP_TIMEOUT_MS || '45000', 10),
      validateStatus: () => true,
      headers: {
        apikey: this.apiKey,
        'Content-Type': 'application/json'
      },
      transformResponse: [(data, headers) => {
        if (data === '' || data === undefined || data === null) return null;
        const contentType = String(headers?.['content-type'] || '');
        if (contentType.includes('application/json')) {
          return JSON.parse(data);
        }

        const trimmed = String(data).trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          return JSON.parse(trimmed);
        }

        const snippet = trimmed.slice(0, 180).replace(/\s+/g, ' ');
        const err = new Error(`Evolution API retornou resposta nao-JSON: ${snippet}`);
        err.responseSnippet = snippet;
        throw err;
      }]
    });
  }

  configured() {
    return !!(this.baseUrl && this.apiKey);
  }

  assertConfigured() {
    if (!this.configured()) {
      throw this.httpError(
        503,
        'Evolution API nao configurada. Defina EVOLUTION_API_URL e EVOLUTION_API_KEY no Koyeb.',
        'EVOLUTION_NOT_CONFIGURED'
      );
    }
  }

  instanceNameForSession(sessionId) {
    const safe = String(sessionId || '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/^_+|_+$/g, '');
    return `${this.instancePrefix}_${safe || 'session'}`;
  }

  httpError(status, message, code = 'EVOLUTION_ERROR', details = null) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.details = details;
    return error;
  }

  async request(method, url, data = undefined, options = {}) {
    this.assertConfigured();
    let response;
    try {
      response = await this.http.request({ method, url, data, ...options });
    } catch (error) {
      if (error.responseSnippet) {
        throw this.httpError(502, error.message, 'EVOLUTION_NON_JSON_RESPONSE', { url });
      }
      throw this.httpError(502, `Falha ao chamar Evolution API: ${error.message}`, 'EVOLUTION_REQUEST_FAILED', { url });
    }

    if (response.status >= 200 && response.status < 300) {
      return response.data;
    }

    const payload = response.data;
    const message = payload?.message || payload?.error || payload?.response?.message || `Evolution API HTTP ${response.status}`;
    throw this.httpError(response.status, Array.isArray(message) ? message.join('; ') : String(message), 'EVOLUTION_HTTP_ERROR', {
      url,
      payload
    });
  }

  isAlreadyExistsError(error) {
    const msg = String(error?.message || '').toLowerCase();
    return error?.status === 409 ||
      msg.includes('already') ||
      msg.includes('exist') ||
      msg.includes('ja existe') ||
      msg.includes('j') && msg.includes('existe');
  }

  extractQr(payload) {
    const candidates = [
      payload?.qrcode?.base64,
      payload?.qrcode?.base64Qr,
      payload?.qrcode?.qrCode,
      payload?.qrcode?.code,
      payload?.qrCode?.base64,
      payload?.qrCode?.base64Qr,
      payload?.qrCode?.qrCode,
      payload?.qrCode?.code,
      payload?.instance?.qrcode?.base64,
      payload?.instance?.qrcode?.base64Qr,
      payload?.instance?.qrcode?.qrCode,
      payload?.instance?.qrcode?.code,
      payload?.data?.qrcode?.base64,
      payload?.data?.qrcode?.base64Qr,
      payload?.data?.qrcode?.qrCode,
      payload?.data?.qrcode?.code,
      payload?.data?.qrCode?.base64,
      payload?.data?.qrCode?.base64Qr,
      payload?.data?.qrCode?.qrCode,
      payload?.data?.qrCode?.code,
      payload?.base64,
      payload?.data?.base64,
      payload?.qr,
      payload?.data?.qr,
      payload?.qrCode,
      payload?.data?.qrCode,
      payload?.code
    ].filter(value => typeof value === 'string' && value.trim());

    const value = candidates.find(Boolean);
    if (!value) return null;
    if (String(value).startsWith('data:image')) return value;
    if (String(value).length > 500 && /^[A-Za-z0-9+/=]+$/.test(String(value))) {
      return `data:image/png;base64,${value}`;
    }
    return value;
  }

  normalizeState(rawState, payload = {}) {
    const state = String(
      rawState ||
      payload?.instance?.state ||
      payload?.instance?.status ||
      payload?.instance?.connectionStatus ||
      payload?.state ||
      payload?.status ||
      payload?.connectionStatus ||
      ''
    ).toLowerCase();

    if (['open', 'connected', 'online'].includes(state)) return 'connected';
    if (['qr', 'qrcode', 'qr_code'].includes(state)) return 'qr_code';
    if (['connecting', 'initializing', 'loading'].includes(state)) return 'initializing';
    if (['close', 'closed', 'disconnected', 'offline'].includes(state)) return 'disconnected';
    return state || 'unknown';
  }

  clearSessionQr(instanceName) {
    this.qrCache.delete(instanceName);
    this.stateCache.set(instanceName, 'connected');
  }

  clearInstanceCache(instanceName) {
    this.qrCache.delete(instanceName);
    this.stateCache.delete(instanceName);
  }

  sessionView(sessionId, payload = {}, fallbackStatus = 'unknown') {
    const instanceName = this.instanceNameForSession(sessionId);
    const normalizedStatus = this.normalizeState(fallbackStatus, payload);
    const connected = normalizedStatus === 'connected';
    if (connected) this.clearSessionQr(instanceName);
    const qrCode = connected ? null : (this.extractQr(payload) || this.qrCache.get(instanceName) || null);
    const status = connected ? 'connected' : (qrCode ? 'qr_code' : normalizedStatus);
    return {
      id: sessionId,
      instanceName,
      status: connected ? 'connected' : status,
      canSend: connected,
      qrCode: connected ? null : qrCode,
      qr_code: connected ? null : qrCode,
      info: payload?.instance || payload?.profile || null,
      raw: payload
    };
  }

  async ensureInstance(sessionId, { user = null, forceQr = false } = {}) {
    const instanceName = this.instanceNameForSession(sessionId);
    const body = {
      instanceName,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      rejectCall: true,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false
    };

    if (this.webhookUrl) {
      body.webhookUrl = this.webhookUrl;
      body.webhookByEvents = false;
      body.webhookBase64 = false;
      body.webhookEvents = [
        'QRCODE_UPDATED',
        'CONNECTION_UPDATE',
        'SEND_MESSAGE',
        'SEND_MESSAGE_UPDATE',
        'MESSAGES_UPDATE'
      ];
    }

    if (user?.name) body.profileName = user.name;

    let payload = null;
    try {
      payload = await this.request('post', '/instance/create', body);
    } catch (error) {
      if (!this.isAlreadyExistsError(error)) throw error;
    }

    const view = payload ? this.sessionView(sessionId, payload, 'connecting') : await this.connect(sessionId);
    if (view.qrCode) this.qrCache.set(instanceName, view.qrCode);
    return view;
  }

  async connect(sessionId) {
    const instanceName = this.instanceNameForSession(sessionId);
    const payload = await this.request('get', `/instance/connect/${encodeURIComponent(instanceName)}`);
    const view = this.sessionView(sessionId, payload, 'connecting');
    if (view.status === 'connected') {
      this.clearSessionQr(instanceName);
    } else if (view.qrCode) {
      this.qrCache.set(instanceName, view.qrCode);
    }
    this.stateCache.set(instanceName, view.status);
    return view;
  }

  async getState(sessionId) {
    const instanceName = this.instanceNameForSession(sessionId);
    try {
      const payload = await this.request('get', `/instance/connectionState/${encodeURIComponent(instanceName)}`);
      const view = this.sessionView(sessionId, payload, payload?.instance?.state || payload?.state);
      if (view.status === 'connected') this.clearSessionQr(instanceName);
      this.stateCache.set(instanceName, view.status);
      return view;
    } catch (error) {
      if (error.status === 404 || String(error.message).toLowerCase().includes('does not exist')) {
        return { id: sessionId, instanceName, status: 'not_created', canSend: false, qrCode: null };
      }
      throw error;
    }
  }

  async getQr(sessionId, { waitMs = 8000, forceQr = false, user = null } = {}) {
    const instanceName = this.instanceNameForSession(sessionId);
    const started = Date.now();
    let lastView = null;

    if (forceQr) {
      this.clearInstanceCache(instanceName);
      await this.deleteInstance(sessionId).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1200));
      lastView = await this.ensureInstance(sessionId, { user, forceQr: false });
      if (lastView.status === 'connected') {
        this.clearSessionQr(instanceName);
        return lastView;
      }
      if (lastView.qrCode) return lastView;
    }

    while ((Date.now() - started) <= waitMs) {
      try {
        lastView = await this.getState(sessionId);
        if (lastView.status === 'connected') {
          this.clearSessionQr(instanceName);
          return lastView;
        }

        lastView = await this.connect(sessionId);
      } catch (error) {
        if (error.status === 404) {
          lastView = await this.ensureInstance(sessionId, { user, forceQr: false });
        } else {
          throw error;
        }
      }

      if (lastView.status === 'connected') {
        this.clearSessionQr(instanceName);
        return lastView;
      }
      if (lastView.qrCode) return lastView;

      await new Promise(resolve => setTimeout(resolve, 700));
    }

    return lastView || { id: sessionId, instanceName, status: 'initializing', canSend: false, qrCode: null };
  }

  async logout(sessionId) {
    const instanceName = this.instanceNameForSession(sessionId);
    this.qrCache.delete(instanceName);
    try {
      return await this.request('delete', `/instance/logout/${encodeURIComponent(instanceName)}`);
    } catch (error) {
      if (error.status === 404) return { success: true, ignored: true };
      throw error;
    }
  }

  async deleteInstance(sessionId) {
    const instanceName = this.instanceNameForSession(sessionId);
    this.qrCache.delete(instanceName);
    try {
      return await this.request('delete', `/instance/delete/${encodeURIComponent(instanceName)}`);
    } catch (error) {
      if (error.status === 404) return { success: true, ignored: true };
      throw error;
    }
  }

  normalizePhone(to) {
    let digits = String(to || '').replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) {
      digits = `55${digits}`;
    }
    return digits;
  }

  async sendText(sessionId, to, text, { delay = 1200 } = {}) {
    const instanceName = this.instanceNameForSession(sessionId);
    const state = await this.getState(sessionId);
    if (state.status !== 'connected') {
      throw this.httpError(409, 'WhatsApp nao conectado. Gere/escaneie o QR antes do disparo.', 'SESSION_NOT_CONNECTED', state);
    }

    const number = this.normalizePhone(to);
    if (!number) {
      throw this.httpError(400, 'Numero de WhatsApp invalido.', 'INVALID_PHONE');
    }

    const payload = await this.request('post', `/message/sendText/${encodeURIComponent(instanceName)}`, {
      number,
      text,
      delay
    });

    return {
      provider: 'evolution',
      sessionId,
      instanceName,
      to: number,
      messageId: payload?.key?.id || payload?.message?.key?.id || payload?.id || null,
      raw: payload
    };
  }

  async sendMedia(sessionId, to, mediaUrl, caption = '') {
    const instanceName = this.instanceNameForSession(sessionId);
    const state = await this.getState(sessionId);
    if (state.status !== 'connected') {
      throw this.httpError(409, 'WhatsApp nao conectado. Gere/escaneie o QR antes do disparo.', 'SESSION_NOT_CONNECTED', state);
    }

    const number = this.normalizePhone(to);
    const payload = await this.request('post', `/message/sendMedia/${encodeURIComponent(instanceName)}`, {
      number,
      mediatype: 'image',
      media: mediaUrl,
      caption
    });

    return {
      provider: 'evolution',
      sessionId,
      instanceName,
      to: number,
      messageId: payload?.key?.id || payload?.message?.key?.id || payload?.id || null,
      raw: payload
    };
  }

  ingestWebhook(payload = {}) {
    const instanceName = payload.instance || payload.instanceName || payload?.data?.instance || payload?.data?.instanceName;
    if (!instanceName) return null;

    const qr = this.extractQr(payload) || this.extractQr(payload?.data || {});

    const state = this.normalizeState(payload.state || payload.status || payload?.data?.state || payload?.data?.status, payload);
    if (state === 'connected') {
      this.clearSessionQr(instanceName);
    } else if (qr) {
      this.qrCache.set(instanceName, qr);
    }
    if (state && state !== 'unknown') this.stateCache.set(instanceName, state);

    return { instanceName, status: state, qrCode: qr };
  }
}

module.exports = EvolutionWhatsAppProvider;
