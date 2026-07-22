const crypto = require('crypto');
const QRCode = require('qrcode');

class EvolutionGoProvider {
  constructor({ baseUrl = null, globalKey = null, instancePrefix = 'pfgo', timeoutMs = 45000 } = {}) {
    this.baseUrl = (baseUrl || process.env.EVOGO_BASE_URL || '').replace(/\/$/, '');
    this.globalKey = globalKey || process.env.EVOGO_GLOBAL_API_KEY || process.env.EVOLUTION_API_KEY || '';
    this.instancePrefix = process.env.EVOGO_INSTANCE_PREFIX || instancePrefix;
    this.timeoutMs = Number(process.env.EVOGO_TIMEOUT_MS || timeoutMs);
    this.stateCache = new Map();
    this.ensuredInstances = new Map();
    this.ensureInflight = new Map();
  }

  configured() {
    return Boolean(this.baseUrl && this.globalKey);
  }

  instanceNameForSession(sessionId) {
    return `${this.instancePrefix}_${sessionId}`;
  }

  instanceTokenForSession(sessionId) {
    const h = crypto.createHmac('sha256', this.globalKey).update(this.instanceNameForSession(sessionId)).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
  }

  instanceMeta(sessionId) {
    return {
      name: this.instanceNameForSession(sessionId),
      token: this.instanceTokenForSession(sessionId)
    };
  }

  httpError(status, message, code = 'EVOGO_ERROR', details = null) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    error.details = details;
    return error;
  }

  normalizePhone(to) {
    let digits = String(to || '').replace(/\D/g, '');
    if (digits.length >= 10 && digits.length <= 11 && !digits.startsWith('55')) digits = `55${digits}`;
    return digits;
  }

  async request(method, path, { body = null, apikey = null } = {}) {
    if (!this.configured()) {
      throw this.httpError(503, 'Evolution GO nao configurado (EVOGO_BASE_URL/EVOGO_GLOBAL_API_KEY).', 'EVOGO_NOT_CONFIGURED');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', apikey: apikey || this.globalKey },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const text = await response.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = { raw: text };
      }

      if (response.status === 503 && (json?.code === 'LICENSE_REQUIRED' || json?.error === 'service not activated')) {
        throw this.httpError(503, 'Evolution GO sem licenca ativada. Ative no painel /manager usando magic link ou login social.', 'EVOGO_LICENSE_REQUIRED', json);
      }

      if (!response.ok) {
        const message = json?.error?.message || (typeof json?.error === 'string' ? json.error : null) || json?.message || `Evolution GO HTTP ${response.status}`;
        throw this.httpError(response.status, message, json?.error?.code || 'EVOGO_HTTP_ERROR', json);
      }

      return json;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw this.httpError(504, 'Timeout ao chamar Evolution GO.', 'EVOGO_TIMEOUT');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  async ensureInstance(sessionId) {
    const meta = this.instanceMeta(sessionId);
    const cached = this.ensuredInstances.get(sessionId);
    if (cached === meta.token) return meta;

    if (this.ensureInflight.has(sessionId)) return await this.ensureInflight.get(sessionId);

    const promise = (async () => {
      try {
        await this.request('POST', '/instance/create', { body: { name: meta.name, token: meta.token } });
      } catch (error) {
        const detailText = JSON.stringify(error.details || {});
        const alreadyExists = error.status === 400
          || error.status === 409
          || /exist|duplicate|uni_instances_token/i.test(`${error.message || ''} ${detailText}`);
        if (!alreadyExists) throw error;
      }
      this.ensuredInstances.set(sessionId, meta.token);
      return meta;
    })().finally(() => {
      this.ensureInflight.delete(sessionId);
    });

    this.ensureInflight.set(sessionId, promise);
    return await promise;
  }

  extractRawQr(raw) {
    const qr = raw?.data?.code || raw?.code || raw?.qrCode || raw?.data?.qrCode || raw?.data?.qr || raw?.qrcode || raw?.data?.qrcode || null;
    return qr;
  }

  async extractQr(raw) {
    const qr = this.extractRawQr(raw);
    if (!qr) return null;
    if (typeof qr === 'string') {
      const value = qr.trim();
      if (!value) return null;
      if (value.startsWith('data:')) return value;
      const looksLikeImageBase64 = /^(iVBOR|\/9j\/|R0lGOD|UklGR)/.test(value);
      if (looksLikeImageBase64) return `data:image/png;base64,${value}`;
      return await QRCode.toDataURL(value);
    }
    if (qr.base64) {
      const value = String(qr.base64 || '').trim();
      if (!value) return null;
      if (value.startsWith('data:')) return value;
      if (/^(iVBOR|\/9j\/|R0lGOD|UklGR)/.test(value)) return `data:image/png;base64,${value}`;
      return await QRCode.toDataURL(value);
    }
    return null;
  }

  mapStatus(raw, qrCode = null) {
    const status = String(raw?.status || raw?.data?.status || raw?.data?.state || '').toLowerCase();
    const explicitLoggedIn = raw?.loggedIn === true || raw?.data?.loggedIn === true;
    const connected = explicitLoggedIn || raw?.data?.myJid || raw?.myJid ||
      ['connected', 'open', 'online'].includes(status);
    if (connected) return 'connected';
    if (qrCode || this.extractRawQr(raw)) return 'qr_code';
    return 'disconnected';
  }

  async sessionView(sessionId, raw, statusOverride = null) {
    const qrCode = statusOverride === 'connected' ? null : await this.extractQr(raw);
    const status = statusOverride || this.mapStatus(raw, qrCode);
    return {
      id: sessionId,
      instanceName: this.instanceNameForSession(sessionId),
      status,
      canSend: status === 'connected',
      qrCode,
      qr_code: qrCode,
      engine: 'evolution_go',
      raw
    };
  }

  async getState(sessionId) {
    const { token } = this.instanceMeta(sessionId);
    try {
      const raw = await this.request('GET', '/instance/status', { apikey: token });
      const view = await this.sessionView(sessionId, raw);
      this.stateCache.set(sessionId, view);
      return view;
    } catch (error) {
      if (error.code === 'EVOGO_LICENSE_REQUIRED') throw error;
      return await this.sessionView(sessionId, null, 'disconnected');
    }
  }

  async getQr(sessionId, { waitMs = 8000 } = {}) {
    const { token } = await this.ensureInstance(sessionId);
    await this.request('POST', '/instance/connect', {
      apikey: token,
      body: { immediate: true, subscribe: ['messages.upsert', 'connection.update'] }
    }).catch(() => {});
    const started = Date.now();
    while (Date.now() - started <= waitMs) {
      const rawState = await this.request('GET', '/instance/status', { apikey: token }).catch(() => null);
      if (rawState) {
        const state = await this.sessionView(sessionId, rawState);
        this.stateCache.set(sessionId, state);
        if (state.status === 'connected' || state.qrCode) return state;
      }
      const rawQr = await this.request('GET', '/instance/qr', { apikey: token }).catch(() => null);
      if (rawQr) {
        const view = await this.sessionView(sessionId, rawQr);
        if (view.qrCode || view.status === 'connected') return view;
      }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    return await this.sessionView(sessionId, null, 'initializing');
  }

  async sendText(sessionId, to, text, { delay = 0 } = {}) {
    const { token } = await this.ensureInstance(sessionId);
    const state = await this.getState(sessionId);
    if (!state.canSend) {
      throw this.httpError(409, 'Evolution GO nao conectado. Escaneie o QR deste canal antes do disparo.', 'EVOGO_SESSION_NOT_CONNECTED', state);
    }

    const number = String(to).includes('@') ? String(to) : this.normalizePhone(to);
    if (!number) throw this.httpError(400, 'Numero de WhatsApp invalido.', 'INVALID_PHONE');

    const raw = await this.request('POST', '/send/text', {
      apikey: token,
      body: { number, text: String(text || ''), delay: Number(delay) || 0 }
    });
    const messageId = raw?.data?.Info?.ID || raw?.data?.info?.id || raw?.messageId || raw?.data?.messageId || null;
    if (!messageId) {
      throw this.httpError(502, 'Evolution GO nao retornou ID de mensagem.', 'EVOGO_UNCONFIRMED_SEND', raw);
    }

    return {
      provider: 'evolution_go',
      sessionId,
      instanceName: this.instanceNameForSession(sessionId),
      to: number,
      messageId,
      raw
    };
  }

  async sendMedia(sessionId, to, mediaUrl, caption = '') {
    if (mediaUrl) {
      throw this.httpError(400, 'Envio de midia via Evolution GO ainda nao habilitado.', 'EVOGO_MEDIA_NOT_ENABLED');
    }
    return await this.sendText(sessionId, to, caption);
  }

  async logout(sessionId) {
    const { token } = await this.ensureInstance(sessionId);
    await this.request('POST', '/instance/disconnect', { apikey: token, body: {} }).catch(() => {});
    return { success: true };
  }

  async deleteInstance(sessionId) {
    const name = this.instanceNameForSession(sessionId);
    await this.request('DELETE', `/instance/delete/${encodeURIComponent(name)}`, { apikey: this.globalKey }).catch(async () => {
      const token = this.instanceTokenForSession(sessionId);
      await this.request('DELETE', '/instance/delete', { apikey: token }).catch(() => {});
    });
    this.stateCache.delete(sessionId);
    this.ensuredInstances.delete(sessionId);
    this.ensureInflight.delete(sessionId);
    return { success: true };
  }

  async health() {
    try {
      let raw;
      try {
        raw = await this.request('GET', '/instance/all');
      } catch (error) {
        if (error.status !== 404) throw error;
        raw = await this.request('GET', '/server/ok');
      }
      const count = Array.isArray(raw?.data) ? raw.data.length : (Array.isArray(raw) ? raw.length : null);
      return { ok: true, reachable: true, instances: count };
    } catch (error) {
      return {
        ok: false,
        reachable: error.code === 'EVOGO_LICENSE_REQUIRED',
        error: error.code || error.message
      };
    }
  }
}

module.exports = EvolutionGoProvider;
