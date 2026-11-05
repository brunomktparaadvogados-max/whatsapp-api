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
    this.qrInflight = new Map();
    this.forceQrAt = new Map();
    this.connectStartedAt = new Map();
    this.nextQrProbeAt = new Map();
    this.qrCacheTtlMs = Number(process.env.EVOGO_QR_CACHE_TTL_MS || 30000);
    this.connectCooldownMs = Number(process.env.EVOGO_CONNECT_COOLDOWN_MS || 120000);
    this.connectSettleMs = Number(process.env.EVOGO_CONNECT_SETTLE_MS || 4000);
    this.connectRetryBackoffMs = Number(process.env.EVOGO_CONNECT_RETRY_BACKOFF_MS || 10000);
    this.qrProbeIntervalMs = Number(process.env.EVOGO_QR_PROBE_INTERVAL_MS || 5000);
    this.qrFailureBackoffMs = Number(process.env.EVOGO_QR_FAILURE_BACKOFF_MS || 15000);
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
    const explicitLoggedIn = raw?.LoggedIn === true || raw?.data?.LoggedIn === true ||
      raw?.loggedIn === true || raw?.data?.loggedIn === true;

    // Evolution GO reports Connected=true while its websocket is alive even
    // when the WhatsApp device was logged out, and it can retain a stale JID.
    // Only the explicit authenticated flag is safe evidence that sends work.
    const connected = explicitLoggedIn;
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

  cacheState(sessionId, view) {
    this.stateCache.set(sessionId, { ...view, cachedAt: Date.now() });
    return view;
  }

  getFreshCachedQr(sessionId) {
    const cached = this.stateCache.get(sessionId);
    if (!cached || cached.status !== 'qr_code' || !cached.qrCode) return null;
    if (Date.now() - (cached.cachedAt || 0) > this.qrCacheTtlMs) return null;
    return cached;
  }

  async getState(sessionId) {
    const { token } = this.instanceMeta(sessionId);
    try {
      const raw = await this.request('GET', '/instance/status', { apikey: token });
      const view = await this.sessionView(sessionId, raw);
      return this.cacheState(sessionId, view);
    } catch (error) {
      if (error.code === 'EVOGO_LICENSE_REQUIRED') throw error;
      return await this.sessionView(sessionId, null, 'disconnected');
    }
  }

  async getQr(sessionId, { waitMs = 8000, forceQr = false } = {}) {
    if (this.qrInflight.has(sessionId)) return await this.qrInflight.get(sessionId);

    if (!forceQr) {
      const cachedQr = this.getFreshCachedQr(sessionId);
      if (cachedQr) return cachedQr;
    }

    const promise = (async () => {
      if (forceQr) {
        const current = await this.resetUnpairedInstanceForQr(sessionId);
        if (current) return current;
      }
      return await this.fetchQr(sessionId, waitMs);
    })().finally(() => {
      this.qrInflight.delete(sessionId);
    });
    this.qrInflight.set(sessionId, promise);
    return await promise;
  }

  async resetUnpairedInstanceForQr(sessionId) {
    const now = Date.now();
    const lastResetAt = this.forceQrAt.get(sessionId) || 0;
    if (now - lastResetAt < 60000) return null;

    const meta = this.instanceMeta(sessionId);
    const rawInstances = await this.request('GET', '/instance/all', { apikey: this.globalKey });
    const instances = Array.isArray(rawInstances?.data) ? rawInstances.data
      : Array.isArray(rawInstances) ? rawInstances : [];
    const instance = instances.find(item => String(item?.name || item?.instanceName || '') === meta.name);

    // A missing GO instance has nothing to delete; let ensureInstance create it.
    if (!instance) {
      this.forceQrAt.set(sessionId, now);
      this.stateCache.delete(sessionId);
      this.ensuredInstances.delete(sessionId);
      this.connectStartedAt.delete(sessionId);
      this.nextQrProbeAt.delete(sessionId);
      return null;
    }

    // Do not turn a failed status request into authorization to delete data.
    const rawStatus = await this.request('GET', '/instance/status', { apikey: meta.token });
    const current = await this.sessionView(sessionId, rawStatus);
    if (current.status === 'connected') return current;

    // The GO instance row keeps the JID for previously paired accounts. A
    // disconnected runtime after a VPS restart is not proof that auth is gone;
    // preserve that store and let fetchQr reconnect the existing instance.
    const savedJid = String(instance.jid || instance.Jid || '').trim();
    if (savedJid) {
      this.forceQrAt.set(sessionId, now);
      this.stateCache.delete(sessionId);
      this.connectStartedAt.delete(sessionId);
      this.nextQrProbeAt.delete(sessionId);
      return null;
    }

    // A GO instance id is a UUID. Deleting by the display name returns an
    // error, which the old adapter swallowed, leaving the stale client alive.
    if (instance.connected === true || instance.Connected === true) {
      return await this.sessionView(sessionId, rawStatus, 'connected');
    }
    if (!instance.id) {
      throw this.httpError(502, 'Evolution GO nao retornou o ID da instancia; QR nao foi reiniciado.', 'EVOGO_INSTANCE_ID_MISSING');
    }
    await this.request('DELETE', `/instance/delete/${encodeURIComponent(instance.id)}`, { apikey: this.globalKey });

    this.forceQrAt.set(sessionId, now);
    this.stateCache.delete(sessionId);
    this.ensuredInstances.delete(sessionId);
    this.ensureInflight.delete(sessionId);
    this.connectStartedAt.delete(sessionId);
    this.nextQrProbeAt.delete(sessionId);
    return null;
  }

  async fetchQr(sessionId, waitMs) {
    const { token } = await this.ensureInstance(sessionId);
    const lastConnectAt = this.connectStartedAt.get(sessionId) || 0;
    let startedClient = false;
    let startupError = null;
    if (Date.now() - lastConnectAt >= this.connectCooldownMs) {
      // Evolution GO creates database resources on /instance/connect. Calling
      // it on every frontend poll exhausts PostgreSQL, so start at most one QR
      // cycle per session during the provider's QR lifetime.
      this.connectStartedAt.set(sessionId, Date.now());
      try {
        await this.request('POST', '/instance/connect', {
          apikey: token,
          body: { subscribe: ['MESSAGE', 'CONNECTION', 'QRCODE'] }
        });
        startedClient = true;
      } catch (error) {
        startupError = error;
        // A transient startup failure must be retried soon, but never on every
        // frontend poll. Keep a short backoff instead of the full cooldown.
        this.connectStartedAt.set(
          sessionId,
          Date.now() - this.connectCooldownMs + this.connectRetryBackoffMs
        );
      }
    }

    if (startedClient && this.connectSettleMs > 0) {
      // /instance/connect starts the GO client asynchronously. Calling
      // /instance/qr before it enters the runtime makes GO start a second
      // client for the same instance. The orphan QR timer can then log out a
      // successfully paired device when QRCODE_MAX_COUNT is reached.
      await new Promise(resolve => setTimeout(resolve, this.connectSettleMs));
    }
    const started = Date.now();
    while (Date.now() - started <= waitMs) {
      const rawState = await this.request('GET', '/instance/status', { apikey: token }).catch(() => null);
      if (rawState) {
        const state = await this.sessionView(sessionId, rawState);
        this.cacheState(sessionId, state);
        if (state.status === 'connected' || state.qrCode) return state;
      }
      const nextQrProbeAt = this.nextQrProbeAt.get(sessionId) || 0;
      if (Date.now() >= nextQrProbeAt) {
        try {
          const rawQr = await this.request('GET', '/instance/qr', { apikey: token });
          this.nextQrProbeAt.set(sessionId, Date.now() + this.qrProbeIntervalMs);
          const view = await this.sessionView(sessionId, rawQr);
          this.cacheState(sessionId, view);
          if (view.qrCode || view.status === 'connected') return view;
        } catch (error) {
          startupError = error;
          // GET /instance/qr starts a runtime client when one does not exist.
          // Backing off here prevents a failed database startup from spawning
          // a new SQL pool on every 700 ms status poll.
          this.nextQrProbeAt.set(sessionId, Date.now() + this.qrFailureBackoffMs);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 700));
    }
    const initializing = await this.sessionView(sessionId, null, 'initializing');
    if (startupError) {
      initializing.raw = {
        initializing: true,
        retryAfterMs: this.connectRetryBackoffMs,
        errorCode: startupError.code || 'EVOGO_STARTUP_PENDING',
        diagnostic: String(startupError.message || 'Evolution GO ainda nao disponibilizou o QR').slice(0, 240)
      };
    }
    return initializing;
  }

  async sendText(sessionId, to, text, { delay = 0 } = {}) {
    const { token } = await this.ensureInstance(sessionId);
    const state = await this.getState(sessionId);
    if (!state.canSend) {
      throw this.httpError(409, 'Evolution GO nao conectado. Escaneie o QR deste canal antes do disparo.', 'EVOGO_SESSION_NOT_CONNECTED', state);
    }

    const number = String(to).includes('@') ? String(to) : this.normalizePhone(to);
    if (!number) throw this.httpError(400, 'Numero de WhatsApp invalido.', 'INVALID_PHONE');

    let raw;
    try {
      raw = await this.request('POST', '/send/text', {
        apikey: token,
        // Preserve the Brazilian ninth digit for the first WhatsApp lookup.
        // Evolution GO will try its legacy JID normalization only as fallback.
        body: { number, text: String(text || ''), delay: Number(delay) || 0, formatJid: false }
      });
    } catch (error) {
      const detailText = `${error?.message || ''} ${JSON.stringify(error?.details || {})}`;
      if (/device jid|not logged|logged out|not connected/i.test(detailText)) {
        this.stateCache.delete(sessionId);
        throw this.httpError(
          409,
          'Sessao do WhatsApp desconectada. Gere um novo QR e conecte o aparelho antes de disparar.',
          'SESSION_STALE_CONNECTION',
          error?.details || null
        );
      }
      throw error;
    }
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
    this.stateCache.delete(sessionId);
    this.connectStartedAt.delete(sessionId);
    this.nextQrProbeAt.delete(sessionId);
    return { success: true };
  }

  async deleteInstance(sessionId) {
    const meta = this.instanceMeta(sessionId);
    const rawInstances = await this.request('GET', '/instance/all', { apikey: this.globalKey });
    const instances = Array.isArray(rawInstances?.data) ? rawInstances.data
      : Array.isArray(rawInstances) ? rawInstances : [];
    const instance = instances.find(item => String(item?.name || item?.instanceName || '') === meta.name);
    if (instance && !instance.id) {
      throw this.httpError(502, 'Evolution GO nao retornou o ID da instancia; ela nao foi removida.', 'EVOGO_INSTANCE_ID_MISSING');
    }
    if (instance) {
      await this.request('DELETE', `/instance/delete/${encodeURIComponent(instance.id)}`, { apikey: this.globalKey });
    }
    this.stateCache.delete(sessionId);
    this.ensuredInstances.delete(sessionId);
    this.ensureInflight.delete(sessionId);
    this.qrInflight.delete(sessionId);
    this.connectStartedAt.delete(sessionId);
    this.nextQrProbeAt.delete(sessionId);
    this.forceQrAt.delete(sessionId);
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
