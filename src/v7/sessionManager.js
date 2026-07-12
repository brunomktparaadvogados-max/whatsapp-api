// sessionManager.js — Motor de sessões Baileys (v7)
// -----------------------------------------------------------------------------
// Corrige, na raiz, os sintomas vistos em produção:
//   • "RemoteAuth salvo existe, mas o WhatsApp Web pediu QR" (reidratação falha)
//     -> Baileys reconecta da credencial JSON por WebSocket, sem Chromium.
//   • "Carregando sessão..." travado / precisar acionar manual
//     -> ensureSession idempotente e auto-curável carrega SOB DEMANDA.
//   • "Falha na autenticação"
//     -> só apaga credencial em loggedOut(401) confirmado pelas 3 camadas.
//   • "enviado mas não chega"
//     -> só reporta entregue com DELIVERY_ACK real; ambíguo = pending.
//
// Reaproveita os princípios validados: Golden Rule, HealthGuard 3 camadas,
// auto-reconnect, e persiste em users/sessions/messages via database.js.
// -----------------------------------------------------------------------------

const makeWASocket = require('@whiskeysockets/baileys').default;
const {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  isJidUser,
  jidNormalizedUser,
} = require('@whiskeysockets/baileys');
const QRCode = require('qrcode');
const { usePostgresAuthState } = require('./authState');
const { makeLogger } = require('./logger');

const STATUS = {
  INITIALIZING: 'initializing',
  QR: 'qr_code',
  CONNECTED: 'connected',
  FAILED: 'failed',
};

const QR_ZOMBIE_MS = 25_000; // sem QR e sem conectar por 25s => socket-zumbi, recria.
const DELIVERY_ACK = 3; // proto: PENDING1 SERVER_ACK2 DELIVERY_ACK3 READ4 PLAYED5
const DELIVERED_GUARD_MS = 10 * 60 * 1000; // janela p/ considerar duplicata já entregue.

// ── Política de disponibilidade de QR e hibernação ──────────────────────────
// Requisito do produto:
//  • Sessão que perdeu conexão e precisa de QR NÃO hiberna enquanto o QR não for
//    escaneado — o QR fica SEMPRE disponível (regenera sozinho quando expira).
//  • Só hiberna (para poupar recurso) após HORAS sem atividade OU sob sobrecarga.
const IDLE_HIBERNATE_MS = 3 * 60 * 60 * 1000; // sessão CONECTADA e ociosa >3h -> hiberna (reconecta sob demanda, sem QR).
const QR_KEEPALIVE_MAX_MS = 6 * 60 * 60 * 1000; // mantém o QR vivo por até 6h sem scan; depois hiberna.
const QR_REFRESH_BACKOFF_MS = 3_000; // pequeno backoff ao regenerar QR expirado (evita loop apertado).
const MAX_ACTIVE_SOCKETS = 60; // teto de sockets simultâneos (Baileys ~10-30MB cada).
const MAX_QR_PENDING = 30; // teto de sessões aguardando scan ao mesmo tempo.
const SWEEP_INTERVAL_MS = 60_000; // varredura de hibernação a cada 60s.

class SessionManagerV7 {
  /**
   * @param {object} deps
   * @param {any} deps.db  DatabaseManager (com query/run/get/all + helpers)
   * @param {import('socket.io').Server} deps.io
   * @param {(sessionId:string, msg:any)=>Promise<void>} deps.forwardIncoming
   */
  constructor({ db, io, forwardIncoming }) {
    this.db = db;
    this.io = io;
    this.forwardIncoming = forwardIncoming;
    this.log = makeLogger('[v7]');
    this.sessions = new Map(); // sessionId -> entry
    this.locks = new Map(); // sessionId -> Promise (um socket por sessão)
    this.pending = new Map(); // messageId -> { resolve, timer }
    this.msgStore = new Map(); // messageId -> message (getMessage p/ retry)
    this.lastActivity = new Map(); // sessionId -> ts (último disparo/uso)
    this.knownUsers = new Map(); // sessionId -> userId (p/ reacender hibernada sob demanda)
    this.sweepTimer = null;
  }

  // Marca atividade (disparo/uso) — adia a hibernação por ociosidade.
  touchActivity(sessionId) {
    this.lastActivity.set(sessionId, Date.now());
  }

  _countByStatus(status) {
    let n = 0;
    for (const e of this.sessions.values()) if (e.status === status) n++;
    return n;
  }

  _overloaded() {
    return (
      this.sessions.size >= MAX_ACTIVE_SOCKETS ||
      this._countByStatus(STATUS.QR) >= MAX_QR_PENDING
    );
  }

  stats() {
    return {
      total: this.sessions.size,
      connected: this._countByStatus(STATUS.CONNECTED),
      qrPending: this._countByStatus(STATUS.QR),
      maxSockets: MAX_ACTIVE_SOCKETS,
      maxQrPending: MAX_QR_PENDING,
    };
  }

  emit(sessionId, event, payload) {
    this.io.to(sessionId).emit(event, payload);
  }

  getSession(sessionId) {
    return this.sessions.get(sessionId);
  }

  statusOf(sessionId) {
    const s = this.sessions.get(sessionId);
    if (!s) return { status: STATUS.INITIALIZING, qrCode: null, info: null };
    return {
      status: s.status,
      qrCode: s.status === STATUS.QR ? s.qrDataUrl : null,
      info: s.info || null,
    };
  }

  // ── Carregamento SOB DEMANDA: idempotente e auto-curável ────────────────────
  async ensureSession(sessionId, userId) {
    if (this.locks.has(sessionId)) {
      await this.locks.get(sessionId).catch(() => {});
    }
    this.lastActivity.set(sessionId, Date.now()); // abrir a tela conta como atividade.
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.status === STATUS.CONNECTED) return this.statusOf(sessionId);
      if (existing.status === STATUS.QR && existing.qrDataUrl) return this.statusOf(sessionId);
      const age = Date.now() - (existing.qrAt || existing.createdAt);
      if (existing.status === STATUS.INITIALIZING && age < QR_ZOMBIE_MS) {
        return this.statusOf(sessionId); // dentro da janela de boot
      }
      this.log.warn(`[${sessionId}] socket-zumbi/stale — recriando`);
      await this._destroy(sessionId, false);
    }

    // Sobrecarga: se estourou o teto de sockets, não cria mais — devolve
    // 'initializing' e deixa a varredura hibernar sessões ociosas primeiro.
    if (this._overloaded()) {
      this.log.warn(`[${sessionId}] sobrecarga (${this.sessions.size} sockets) — adiando criação`);
      return { status: STATUS.INITIALIZING, qrCode: null, info: null, overloaded: true };
    }

    const lock = this._create(sessionId, userId);
    this.locks.set(sessionId, lock);
    try {
      await lock;
    } finally {
      this.locks.delete(sessionId);
    }
    return this.statusOf(sessionId);
  }

  async _create(sessionId, userId) {
    // Garante a linha em sessions (FK de contacts/messages).
    if (userId != null) {
      try {
        await this.db.createSession(sessionId, userId);
      } catch (e) {
        /* já existe */
      }
    }
    const auth = await usePostgresAuthState(sessionId, this.db);
    const { version } = await fetchLatestBaileysVersion(); // evita version drift.

    const sock = makeWASocket({
      version,
      logger: this.log,
      auth: {
        creds: auth.state.creds,
        keys: makeCacheableSignalKeyStore(auth.state.keys, this.log),
      },
      browser: Browsers.appropriate('Chrome'),
      printQRInTerminal: false,
      markOnlineOnConnect: false, // não rouba as notificações do celular do cliente.
      syncFullHistory: false,
      getMessage: async (key) => this.msgStore.get(key.id) || undefined,
    });

    const entry = {
      sock,
      auth,
      userId,
      status: STATUS.INITIALIZING,
      qr: null,
      qrDataUrl: null,
      qrAt: 0,
      info: null,
      createdAt: Date.now(),
      everConnected: false,
      hadSavedCreds: auth.hadSavedCreds, // true = reconexão (tem credencial); false = precisa QR.
      qrFirstAt: 0, // quando começou a aguardar scan (p/ QR_KEEPALIVE_MAX_MS).
    };
    this.sessions.set(sessionId, entry);
    if (userId != null) this.knownUsers.set(sessionId, userId);

    sock.ev.on('creds.update', auth.saveCreds); // Golden Rule (imediato).
    sock.ev.on('connection.update', (u) => this._onConnection(sessionId, u));
    sock.ev.on('messages.update', (up) => this._onMessageUpdate(sessionId, up));
    sock.ev.on('messages.upsert', (m) => this._onUpsert(sessionId, m));
  }

  async _onConnection(sessionId, update) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      entry.qr = qr;
      entry.qrAt = Date.now();
      if (!entry.qrFirstAt) entry.qrFirstAt = Date.now();
      entry.status = STATUS.QR;
      try {
        entry.qrDataUrl = await QRCode.toDataURL(qr); // frontend renderiza como <img>.
      } catch {
        entry.qrDataUrl = null;
      }
      this.emit(sessionId, 'qr_code', { sessionId, qrCode: entry.qrDataUrl });
      await this.db.updateSessionStatus(sessionId, 'qr_code').catch(() => {});
      return;
    }

    if (connection === 'open') {
      entry.status = STATUS.CONNECTED;
      entry.everConnected = true;
      entry.qrFirstAt = 0;
      this.lastActivity.set(sessionId, Date.now());
      entry.qr = null;
      entry.qrDataUrl = null;
      const jid = entry.sock?.user?.id || '';
      const phone = jid.split(':')[0].split('@')[0] || '';
      const name = entry.sock?.user?.name || '';
      entry.info = { phoneNumber: phone, name };
      this.emit(sessionId, 'session_connected', { sessionId, phoneNumber: phone, info: entry.info });
      await this.db.updateSessionStatus(sessionId, 'connected', phone, name).catch(() => {});
      this.log.info(`[${sessionId}] conectado (${phone})`);
      return;
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode;

      if (code === DisconnectReason.restartRequired) {
        this.log.info(`[${sessionId}] restartRequired(515) — reconectando (normal pós-scan)`);
        this._recreate(sessionId, entry.userId, false);
        return;
      }
      if (code === DisconnectReason.loggedOut) {
        await this._handleLoggedOut(sessionId);
        return;
      }

      // Sessão que PRECISA de QR (nunca conectou e não tinha credencial): mantém o
      // QR SEMPRE disponível — regenera até ser escaneado. Só para de regenerar
      // (hiberna) após QR_KEEPALIVE_MAX_MS ou sob sobrecarga. (requisito do produto)
      const needsQr = !entry.everConnected && !entry.hadSavedCreds;
      if (needsQr) {
        const waited = Date.now() - (entry.qrFirstAt || entry.createdAt);
        if (waited > QR_KEEPALIVE_MAX_MS || this._overloaded()) {
          this.log.warn(`[${sessionId}] QR não escaneado há ${Math.round(waited / 60000)}min / sobrecarga — hibernando`);
          await this._destroy(sessionId, false);
          await this.db.updateSessionStatus(sessionId, 'qr_required').catch(() => {});
          return;
        }
        this.log.info(`[${sessionId}] QR expirou sem scan — regenerando (mantendo disponível)`);
        setTimeout(() => this._refreshQr(sessionId, entry.userId), QR_REFRESH_BACKOFF_MS);
        return;
      }

      // Tinha credencial: desconexão transiente -> reconecta (rápido, sem QR).
      this.log.warn(`[${sessionId}] desconexão transiente (code=${code}) — reconectando`);
      await this.db.updateSessionStatus(sessionId, 'disconnected').catch(() => {});
      this._recreate(sessionId, entry.userId, false);
    }
  }

  // Força um QR NOVO agora: descarta a credencial atual e recria o socket.
  // Usado pelo botão "Forçar QR Code" — quebra qualquer socket travado em
  // 'initializing' e garante um QR limpo (re-pareamento).
  async forceQr(sessionId, userId) {
    this.log.warn(`[${sessionId}] forceQr — descartando credencial e gerando QR novo`);
    await this._destroy(sessionId, /*deleteCreds*/ true);
    await this.db.updateSessionStatus(sessionId, 'qr_required').catch(() => {});
    return this.ensureSession(sessionId, userId);
  }

  // Reconecta a sessão SALVA (mantém credencial). Usado pelo botão
  // "Reconectar sessão salva" e para destravar 'initializing' sem re-parear.
  async reactivate(sessionId, userId) {
    this.log.info(`[${sessionId}] reactivate — reconectando da credencial salva`);
    await this._destroy(sessionId, /*deleteCreds*/ false);
    return this.ensureSession(sessionId, userId);
  }

  // Regenera o QR preservando o "relógio" de keep-alive (qrFirstAt).
  async _refreshQr(sessionId, userId) {
    const prev = this.sessions.get(sessionId);
    const qrFirstAt = prev?.qrFirstAt || Date.now();
    await this._destroy(sessionId, false);
    if (this._overloaded()) return; // sobrecarga: não regenera agora.
    await this._create(sessionId, userId).catch((e) => this.log.error(`[${sessionId}] refreshQr`, e.message));
    const cur = this.sessions.get(sessionId);
    if (cur) cur.qrFirstAt = qrFirstAt; // mantém a contagem das 6h.
  }

  // ── HealthGuard 3 camadas antes de apagar credencial ───────────────────────
  async _handleLoggedOut(sessionId) {
    const entry = this.sessions.get(sessionId);
    // Camada 1: sessão viva em memória agora? -> não apaga.
    if (entry?.sock?.user) {
      this.log.warn(`[${sessionId}] loggedOut mas sessão viva — não apaga, reconecta`);
      return this._recreate(sessionId, entry.userId, false);
    }
    // Camada 2: credencial recente (<2h)? pode ser transiente pós-deploy.
    const recent = await this._credsUpdatedWithin(sessionId, 2 * 60 * 60 * 1000);
    if (recent) {
      this.log.warn(`[${sessionId}] loggedOut com credencial recente — não apaga`);
      return this._recreate(sessionId, entry?.userId, false);
    }
    // Camada 3: confere no banco. Erro de query = fail-safe (não apaga).
    let hasCreds = false;
    try {
      const { rows } = await this.db.query(
        `SELECT 1 FROM wa_v7_auth WHERE session_id=$1 AND data_key='creds' LIMIT 1`,
        [sessionId]
      );
      hasCreds = rows.length > 0;
    } catch (e) {
      this.log.error(`[${sessionId}] erro camada 3 HealthGuard — NÃO apaga (fail-safe)`, e.message);
      return this._recreate(sessionId, entry?.userId, false);
    }
    this.log.warn(`[${sessionId}] logout confirmado pelas 3 camadas — apagando credencial`);
    if (entry) await entry.auth.clear().catch(() => {});
    await this._destroy(sessionId, false);
    await this.db.updateSessionStatus(sessionId, 'qr_required').catch(() => {});
    this.emit(sessionId, 'session_disconnected', { sessionId, reason: 'logged_out' });
  }

  async _credsUpdatedWithin(sessionId, ms) {
    try {
      const { rows } = await this.db.query(
        `SELECT updated_at FROM wa_v7_auth WHERE session_id=$1 AND data_key='creds' LIMIT 1`,
        [sessionId]
      );
      if (!rows.length) return false;
      return Date.now() - new Date(rows[0].updated_at).getTime() < ms;
    } catch {
      return true; // fail-safe: na dúvida, não apaga.
    }
  }

  async _recreate(sessionId, userId, deleteCreds) {
    await this._destroy(sessionId, deleteCreds);
    setTimeout(() => this.ensureSession(sessionId, userId).catch(() => {}), 1500);
  }

  async _destroy(sessionId, deleteCreds) {
    const entry = this.sessions.get(sessionId);
    if (!entry) return;
    try {
      entry.sock?.ev?.removeAllListeners?.();
      entry.sock?.end?.(undefined); // logout=false: fecha socket, mantém credencial.
    } catch {
      /* ignore */
    }
    if (deleteCreds) await entry.auth.clear().catch(() => {});
    this.sessions.delete(sessionId);
  }

  // ── Recebimento ─────────────────────────────────────────────────────────────
  async _onUpsert(sessionId, m) {
    if (m.type !== 'notify') return;
    for (const msg of m.messages) {
      if (msg.key.fromMe) continue;
      const jid = msg.key.remoteJid || '';
      if (jid.endsWith('@g.us') || jid === 'status@broadcast') continue; // ignora grupo/status
      this._remember(msg);
      const phone = jid.split('@')[0];
      const body =
        msg.message?.conversation ||
        msg.message?.extendedTextMessage?.text ||
        msg.message?.imageMessage?.caption ||
        '';
      const ts = Number(msg.messageTimestamp) || Math.floor(Date.now() / 1000);
      // Persiste no CRM (mesma tabela messages da v6).
      await this.db
        .saveMessage({
          id: msg.key.id,
          sessionId,
          contactPhone: phone,
          messageType: 'text',
          body,
          mediaUrl: null,
          mediaMimetype: null,
          fromMe: false,
          timestamp: ts,
          status: 'received',
        })
        .catch((e) => this.log.error(`[${sessionId}] saveMessage`, e.message));
      this.emit(sessionId, 'new_message', {
        sessionId,
        from: phone,
        body,
        timestamp: new Date(ts * 1000).toISOString(),
        isFromMe: false,
      });
      try {
        await this.forwardIncoming(sessionId, { phone, body, messageId: msg.key.id, timestamp: ts });
      } catch (e) {
        this.log.error(`[${sessionId}] forward webhook`, e.message);
      }
    }
  }

  // ── Rastreio de entrega (ACK real) ──────────────────────────────────────────
  _onMessageUpdate(sessionId, updates) {
    for (const { key, update } of updates) {
      const status = update?.status;
      if (status == null) continue;
      this.emit(sessionId, 'message_status', {
        messageId: key.id,
        status: this._label(status),
        finalStatus: status >= DELIVERY_ACK ? 'sent' : 'pending',
      });
      this.db
        .query(`UPDATE messages SET status=$1 WHERE id=$2`, [this._label(status), key.id])
        .catch(() => {});
      const p = this.pending.get(key.id);
      if (p && status >= DELIVERY_ACK) {
        clearTimeout(p.timer);
        this.pending.delete(key.id);
        p.resolve({ outcome: 'sent', messageId: key.id, delivered: true });
      }
    }
  }

  _label(status) {
    return { 1: 'pending', 2: 'server_ack', 3: 'delivered', 4: 'read', 5: 'played' }[status] || 'pending';
  }

  // ── Envio unitário: valida número, envia e devolve deliveryPromise ──────────
  // NÃO faz sleep aqui (o delay/serialização fica no sendQueue).
  async rawSend(sessionId, rawNumber, text) {
    this.touchActivity(sessionId); // disparo conta como atividade (adia hibernação).
    const entry = this.sessions.get(sessionId);
    if (!entry || entry.status !== STATUS.CONNECTED) {
      return { outcome: 'pending', messageId: '', error: 'sessão indisponível', deliveryPromise: null };
    }
    const digits = String(rawNumber).replace(/\D/g, '');

    // Guarda de duplicata: já entregamos essa mensagem há pouco? (evita reenvio do dispatcher)
    if (await this._alreadyDelivered(sessionId, digits, text)) {
      return { outcome: 'sent', messageId: '', duplicate: true, deliveryPromise: Promise.resolve({ outcome: 'sent' }) };
    }

    // Validação prévia: número tem WhatsApp? (usa o JID canônico retornado)
    let results;
    try {
      results = await entry.sock.onWhatsApp(digits);
    } catch {
      return { outcome: 'pending', messageId: '', error: 'onWhatsApp falhou', deliveryPromise: null };
    }
    const hit = results?.[0];
    if (!hit || hit.exists === false) {
      return { outcome: 'invalid', messageId: '', error: 'número sem WhatsApp', deliveryPromise: null };
    }
    const jid = hit.jid && isJidUser(hit.jid) ? jidNormalizedUser(hit.jid) : `${digits}@s.whatsapp.net`;

    let sent;
    try {
      sent = await entry.sock.sendMessage(jid, { text });
    } catch (e) {
      return { outcome: 'pending', messageId: '', error: e?.message || 'falha no socket', deliveryPromise: null };
    }
    const messageId = sent?.key?.id;
    this._remember(sent);
    await this.db
      .saveMessage({
        id: messageId,
        sessionId,
        contactPhone: digits,
        messageType: 'text',
        body: text,
        mediaUrl: null,
        mediaMimetype: null,
        fromMe: true,
        timestamp: Math.floor(Date.now() / 1000),
        status: 'server_ack',
      })
      .catch(() => {});

    // deliveryPromise resolve em DELIVERY_ACK; quem aguarda decide o timeout.
    const deliveryPromise = new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(messageId);
        resolve({ outcome: 'pending', messageId, error: 'sem confirmação de entrega no tempo limite' });
      }, 120_000); // teto duro; o servidor usa um bound menor via Promise.race.
      this.pending.set(messageId, { resolve, timer });
    });

    return { outcome: 'queued', messageId, jid, deliveryPromise };
  }

  async _alreadyDelivered(sessionId, digits, text) {
    try {
      const { rows } = await this.db.query(
        `SELECT 1 FROM messages
         WHERE session_id=$1 AND contact_phone=$2 AND from_me=true AND body=$3
           AND status IN ('delivered','read','played')
           AND created_at > now() - interval '${Math.round(DELIVERED_GUARD_MS / 1000)} seconds'
         LIMIT 1`,
        [sessionId, digits, text]
      );
      return rows.length > 0;
    } catch {
      return false;
    }
  }

  _remember(msg) {
    if (!msg?.key?.id) return;
    this.msgStore.set(msg.key.id, msg.message);
    if (this.msgStore.size > 2000) this.msgStore.delete(this.msgStore.keys().next().value);
  }

  // ── Varredura de hibernação ─────────────────────────────────────────────────
  // Regras:
  //  • CONECTADA e ociosa > IDLE_HIBERNATE_MS -> hiberna (reconecta sob demanda,
  //    da credencial, sem QR). Poupa recurso "após horas sem disparo".
  //  • AGUARDANDO QR: NÃO hiberna enquanto não escaneada, exceto se passou de
  //    QR_KEEPALIVE_MAX_MS (6h) ou sob sobrecarga.
  startSweep() {
    if (this.sweepTimer) return;
    this.sweepTimer = setInterval(() => this._sweep().catch(() => {}), SWEEP_INTERVAL_MS);
    if (this.sweepTimer.unref) this.sweepTimer.unref();
  }

  stopSweep() {
    if (this.sweepTimer) clearInterval(this.sweepTimer);
    this.sweepTimer = null;
  }

  async _sweep() {
    const now = Date.now();
    const overloaded = this._overloaded();
    for (const [sessionId, entry] of this.sessions.entries()) {
      const idle = now - (this.lastActivity.get(sessionId) || entry.createdAt);

      if (entry.status === STATUS.CONNECTED) {
        if (idle > IDLE_HIBERNATE_MS) {
          this.log.info(`[${sessionId}] conectada e ociosa há ${Math.round(idle / 3600000)}h — hibernando (reconecta sob demanda)`);
          await this._destroy(sessionId, false);
        }
        continue;
      }

      if (entry.status === STATUS.QR) {
        const waited = now - (entry.qrFirstAt || entry.createdAt);
        // Sobrecarga hiberna as mais antigas aguardando QR; senão, só após 6h.
        if (waited > QR_KEEPALIVE_MAX_MS || (overloaded && idle > IDLE_HIBERNATE_MS)) {
          this.log.warn(`[${sessionId}] aguardando QR há ${Math.round(waited / 60000)}min (sobrecarga=${overloaded}) — hibernando`);
          await this._destroy(sessionId, false);
          await this.db.updateSessionStatus(sessionId, 'qr_required').catch(() => {});
        }
      }
    }
  }

  // ── Shutdown gracioso (SIGTERM do Koyeb) ────────────────────────────────────
  async shutdown() {
    this.stopSweep();
    this.log.info('SIGTERM — flush de credenciais e fechamento gracioso');
    await Promise.all(
      [...this.sessions.values()].map(async (entry) => {
        try {
          await entry.auth.saveCreds();
          entry.sock?.end?.(undefined);
        } catch {
          /* ignore */
        }
      })
    );
  }
}

module.exports = { SessionManagerV7, STATUS };
