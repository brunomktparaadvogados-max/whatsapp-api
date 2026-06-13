const { Client, RemoteAuth } = require('whatsapp-web.js');
const PostgresStore = require('./PostgresStore');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

// ═══════════════════════════════════════════════════════════════════
// SESSÃO PERSISTENTE — PostgreSQL (Supabase) via PostgresStore
// Elimina MongoDB: sem DNS SRV, sem IP whitelist, sem serviço extra
// ═══════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// LIMITES DE MEMÓRIA — Sessões sob demanda para 20+ usuários
// ═══════════════════════════════════════════════════════════════════
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 30; // Capacidade maxima de sessoes ativas; inicializacao continua sequencial para nao derrubar Chromium
const MAX_RSS_MB = parseInt(process.env.MAX_RSS_MB) || 1400;                         // Alinhado ao HealthGuard; 650MB derrubava sessoes com poucos Chromiums
const QR_CODE_TIMEOUT_MS = parseInt(process.env.QR_CODE_TIMEOUT_MS) || 30 * 60 * 1000; // 30 minutos para escanear QR por padrao
const MAX_ACTIVE_QR_SESSIONS = Math.max(
  1,
  Math.min(MAX_CONCURRENT_SESSIONS, parseInt(process.env.MAX_ACTIVE_QR_SESSIONS ?? '3', 10) || 3)
);
const QR_NO_AUTH_MIN_KEEPALIVE_MS = Math.max(
  QR_CODE_TIMEOUT_MS,
  parseInt(process.env.QR_NO_AUTH_MIN_KEEPALIVE_MS ?? String(45 * 60 * 1000), 10) || 0
);
// Keep sessions alive only when explicitly requested. By default, idle Chromium
// processes hibernate while RemoteAuth stays preserved in PostgreSQL.
const KEEP_SESSIONS_ALIVE = process.env.KEEP_SESSIONS_ALIVE === 'true';
const DEFAULT_IDLE_DISCONNECT_MS = 90 * 60 * 1000;
const IDLE_DISCONNECT_MS = KEEP_SESSIONS_ALIVE
  ? 0
  : Math.max(0, parseInt(process.env.IDLE_DISCONNECT_MS ?? String(DEFAULT_IDLE_DISCONNECT_MS), 10) || 0);
const EVICT_IDLE_AFTER_MS = parseInt(process.env.EVICT_IDLE_AFTER_MS) || 20 * 60 * 1000; // não expulsar sessão usada recentemente
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;        // verifica a cada 2 minutos (economiza queries)
const SESSION_INIT_TIMEOUT_MS = 240000;           // 4 minutos para Chromium iniciar em Koyeb sob carga
const MESSAGE_SEND_TIMEOUT_MS = 30000;            // 30 segundos timeout por mensagem (reduzido de 60s para feedback rápido)
const MESSAGE_ACK_TIMEOUT_MS = parseInt(process.env.MESSAGE_ACK_TIMEOUT_MS) || 30000;
const RAW_MESSAGE_CONFIRM_ACK = parseInt(process.env.MESSAGE_CONFIRM_ACK, 10);
const MESSAGE_CONFIRM_ACK = process.env.ALLOW_SERVER_ACK_AS_SENT === 'true'
  ? Math.max(1, RAW_MESSAGE_CONFIRM_ACK || 2)
  : Math.max(2, RAW_MESSAGE_CONFIRM_ACK || 2); // 2 = delivered; 1 only means WhatsApp server accepted it.
const RECENT_ACTIVITY_PRESERVE_MS = Math.max(
  5 * 60 * 1000,
  parseInt(process.env.RECENT_ACTIVITY_PRESERVE_MS ?? String(10 * 60 * 1000), 10) || 0
);
const STALE_SESSION_HEALTHCHECK_MS = parseInt(process.env.STALE_SESSION_HEALTHCHECK_MS) || 2 * 60 * 1000;
const MIN_MESSAGE_INTERVAL_MS = 1500;             // 1.5 segundos entre mensagens (anti-rate-limit)
const MAX_SEND_RETRIES = 0;                       // SEM retries — evita mensagens duplicadas
const AUTO_RECONNECT_TIMEOUT_MS = 420000;         // 7 min máx para auto-reconexão no envio
const AUTHENTICATED_READY_TIMEOUT_MS = parseInt(process.env.AUTHENTICATED_READY_TIMEOUT_MS) || 360000;
const STARTUP_RESTORE_LIMIT = parseInt(process.env.STARTUP_RESTORE_LIMIT || '0', 10);
const SESSION_INIT_MAX_ATTEMPTS = parseInt(process.env.SESSION_INIT_MAX_ATTEMPTS) || 2;
const SESSION_INIT_CONCURRENCY = parseInt(process.env.SESSION_INIT_CONCURRENCY) || 1;
const SESSION_INIT_STAGGER_MS = parseInt(process.env.SESSION_INIT_STAGGER_MS) || 15000;
const REMOTE_AUTH_INIT_RETRIES = parseInt(process.env.REMOTE_AUTH_INIT_RETRIES) || 6;
const REMOTE_AUTH_INIT_RETRY_DELAY_MS = parseInt(process.env.REMOTE_AUTH_INIT_RETRY_DELAY_MS) || 5000;
const REQUIRE_REMOTE_AUTH = process.env.REQUIRE_REMOTE_AUTH !== 'false';

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
    this.sessionSendLock = new Map();       // Evita envio simultâneo na mesma sessão
    this.lastMessageTime = new Map();       // Controle de rate-limit por sessão
    this.recentErrors = [];                 // Log de erros recentes para diagnóstico
    this.pgStore = null;                    // PostgresStore para RemoteAuth (persistência de sessão)
    this.useRemoteAuth = false;             // Flag: RemoteAuth disponivel
    this.remoteAuthInitError = null;
    this.poolListenerRegistered = false;
    this.reconnectingSet = new Set();       // Sessões em processo de auto-reconexão
    this.reconnectPromises = new Map();     // Promises de reconexão em andamento
    this.reconnectCancelled = new Set();   // Sessões que tiveram reconnect cancelado
    this.sessionStartPromises = new Map(); // Evita duas inicializações concorrentes da mesma sessão
    this.activeSessionInitializations = 0;
    this.sessionInitQueue = [];
    this.sessionInitFailures = new Map();
    this.remoteAuthSaveInFlight = new Set(); // Evita backups RemoteAuth simultaneos da mesma sessao
    this.remoteAuthBackupTimers = new Map(); // Evita rajadas de backups forçados na mesma sessao
    this.remoteAuthLastForcedSave = new Map(); // Cooldown real para nao zipar o mesmo perfil em rajada
    this.messageAckWaiters = new Map();
    this.messageAckCache = new Map();
    this.intentionalShutdowns = new Set();    // Destroy controlado nao deve disparar auto-reconnect
    this._contactCache = new Map();          // Cache de contatos: "session_phone" → timestamp (evita upsert repetido)
    this._contactCacheTTL = 10 * 60 * 1000; // 10 min TTL — mesmo contato não faz upsert de novo por 10 min

    this.init();
  }

  getRecentInitFailure(sessionId, maxAgeMs = 10 * 60 * 1000) {
    const failure = this.sessionInitFailures.get(sessionId);
    if (!failure) return null;

    if (Date.now() - failure.timestamp > maxAgeMs) {
      this.sessionInitFailures.delete(sessionId);
      return null;
    }

    return failure;
  }

  touchSession(sessionId) {
    const now = Date.now();
    const session = this.sessions.get(sessionId);
    if (session) session.lastSeen = now;
    this.sessionLastActivity.set(sessionId, now);
  }

  isSessionBusy(sessionId) {
    return this.sessionSendLock.has(sessionId) ||
      this.reconnectPromises.has(sessionId) ||
      this.sessionStartPromises.has(sessionId) ||
      this.reconnectingSet.has(sessionId);
  }

  shouldPreserveLiveSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    if (this.isSessionBusy(sessionId)) return true;
    if (this.healthGuard && this.healthGuard._dispatchActive) return true;
    const lastActivity = this.sessionLastActivity.get(sessionId) || session.lastSeen || session.createdAt || 0;
    if (lastActivity && Date.now() - lastActivity < RECENT_ACTIVITY_PRESERVE_MS) return true;
    return ['initializing', 'qr_code', 'authenticated'].includes(session.status);
  }

  async initializePostgresStore(attempts = REMOTE_AUTH_INIT_RETRIES) {
    let lastError = null;

    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        if (!this.pgStore) {
          this.pgStore = new PostgresStore({ pool: this.db.pool });
        } else {
          this.pgStore.pool = this.db.pool;
        }

        await this.pgStore.init();
        this.useRemoteAuth = true;
        this.remoteAuthInitError = null;

        if (!this.poolListenerRegistered) {
          this.db.onPoolChange((newPool) => {
            console.log('Atualizando pool do PostgresStore apos recuperacao...');
            if (this.pgStore) this.pgStore.pool = newPool;
            console.log('PostgresStore agora usa o novo pool');
          });
          this.poolListenerRegistered = true;
        }

        return true;
      } catch (error) {
        lastError = error;
        this.remoteAuthInitError = error;
        this.useRemoteAuth = false;
        console.warn(`PostgresStore indisponivel (tentativa ${attempt}/${attempts}): ${error.message}`);

        if (attempt < attempts) {
          await new Promise(resolve => setTimeout(resolve, REMOTE_AUTH_INIT_RETRY_DELAY_MS * attempt));
        }
      }
    }

    throw lastError;
  }

  async init() {
    // ═══════════════════════════════════════════════════════════════
    // PERSISTÊNCIA DE SESSÃO — PostgreSQL (Supabase) via PostgresStore
    // Usa o mesmo banco PostgreSQL que já funciona, sem MongoDB
    // ═══════════════════════════════════════════════════════════════
    try {
      this.pgStore = new PostgresStore({ pool: this.db.pool });
      await this.pgStore.init();
      this.useRemoteAuth = true;
      console.log('✅ PostgresStore conectado — sessões WhatsApp persistidas no Supabase!');
      console.log('🔒 RemoteAuth ativo: QR code só precisa ser escaneado 1 vez');

      // Registra listener para atualizar referência do pool no PostgresStore
      // quando o DatabaseManager recriar o pool após erros consecutivos
      this.db.onPoolChange((newPool) => {
        console.log('🔄 Atualizando pool do PostgresStore após recuperação...');
        this.pgStore.pool = newPool;
        console.log('✅ PostgresStore agora usa o novo pool');
      });

      // Limpa sessões antigas que podem ter sido salvas com path completo (bug anterior)
      try {
        const savedSessions = await this.pgStore.listSessions();
        console.log(`📦 Sessões RemoteAuth no PostgreSQL: ${savedSessions.length}`);
        for (const s of savedSessions) {
          console.log(`   - ${s.session_id} (${(s.data_size / 1024 / 1024).toFixed(2)}MB, atualizado: ${s.updated_at})`);
          // Remove entradas com path completo (bug: save usava path, sessionExists usava nome)
          if (s.session_id.includes('/')) {
            const correctId = path.basename(s.session_id);
            console.log(`   🔧 Migrando session_id com path: "${s.session_id}" → "${correctId}"`);
            await this.db.pool.query(
              `UPDATE whatsapp_auth_sessions SET session_id = $1, updated_at = NOW() WHERE session_id = $2 AND NOT EXISTS (SELECT 1 FROM whatsapp_auth_sessions WHERE session_id = $1)`,
              [correctId, s.session_id]
            );
            // Se já existia com o nome correto, deleta a duplicata com path
            await this.db.pool.query(
              `DELETE FROM whatsapp_auth_sessions WHERE session_id = $1`,
              [s.session_id]
            );
          }
        }
      } catch (listErr) {
        console.warn('⚠️ Erro ao listar sessões RemoteAuth:', listErr.message);
      }
    } catch (pgStoreError) {
      console.error('⚠️ Falha ao inicializar PostgresStore. LocalAuth bloqueado para preservar RemoteAuth:', pgStoreError.message);
      this.useRemoteAuth = false;
      this.remoteAuthInitError = pgStoreError;

      try {
        await this.initializePostgresStore();
        console.log('PostgresStore recuperado apos retry; RemoteAuth ativo novamente.');
      } catch (retryError) {
        console.error('RemoteAuth indisponivel apos retries. Mantendo sessoes preservadas e bloqueando QR local:', retryError.message);
      }
    }

    console.log('✅ Banco de dados principal: PostgreSQL (Supabase)');
    console.log(`📊 Limite de sessões simultâneas: ${MAX_CONCURRENT_SESSIONS}`);

    if (this.useRemoteAuth) {
      // Com RemoteAuth, tenta restaurar sessões automaticamente
      console.log('🔄 Restaurando sessões salvas do PostgreSQL...');
      await this.restoreSavedSessions();
    } else {
      // Nunca cai para LocalAuth em producao: isso geraria QR novo e poderia sobrescrever sessoes salvas.
      console.warn('RemoteAuth indisponivel no startup. Status das sessoes preservados; reconexao tentara novamente sob demanda.');
    }

    // Inicia limpeza automática inteligente
    this.startAutoCleanup();
  }

  async restoreSavedSessions() {
    // ═══════════════════════════════════════════════════════════════════
    // RESTAURAÇÃO REAL COM RemoteAuth:
    // 1. Limpa sessões inválidas do banco
    // 2. Identifica quais sessões têm RemoteAuth salvo no PostgreSQL
    // 3. Restaura até MAX_CONCURRENT_SESSIONS sessões automaticamente
    // 4. Sessões excedentes ficam como 'disconnected' mas COM RemoteAuth
    //    → quando ProspectFlow tentar enviar, autoReconnectForSend restaura
    // ═══════════════════════════════════════════════════════════════════
    try {
      const dbSessions = await this.db.getAllSessionsFromDB();
      console.log(`📊 Total de sessões no banco: ${dbSessions.length}`);

      // Limpa sessões inválidas
      const validSessions = [];
      for (const session of dbSessions) {
        const sid = session.id;
        if (!sid || !sid.startsWith('user_') || sid === 'T' || sid === 'test' || sid === 'default') {
          console.log(`🗑️ Removendo sessão inválida: ${sid}`);
          await this.db.deleteSession(sid);
          continue;
        }
        validSessions.push(session);
      }

      // Identifica sessões com RemoteAuth salvo
      let authSessionsById = new Map();
      try {
        const savedAuthSessions = await this.pgStore.listSessions();
        authSessionsById = new Map(savedAuthSessions.map(s => [String(s.session_id).replace('RemoteAuth-', ''), s]));
      } catch (listErr) {
        console.warn(`Erro ao listar RemoteAuth para priorizacao: ${listErr.message}`);
      }

      const sessionsWithAuth = [];
      for (const session of validSessions) {
        try {
          const authId = `RemoteAuth-${session.id}`;
          const hasAuth = await this.pgStore.sessionExists({ session: authId });
          if (hasAuth) {
            sessionsWithAuth.push(session);
          } else {
            // Sem RemoteAuth — marca como disconnected, vai precisar de QR
            await this.db.updateSessionStatus(session.id, 'disconnected');
          }
        } catch (e) {
          await this.db.updateSessionStatus(session.id, 'disconnected');
        }
      }

      console.log(`🔑 ${sessionsWithAuth.length} sessões com RemoteAuth encontradas`);

      sessionsWithAuth.sort((a, b) => {
        const authA = authSessionsById.get(a.id);
        const authB = authSessionsById.get(b.id);
        const sessionTimeA = new Date(a.updated_at || 0).getTime();
        const sessionTimeB = new Date(b.updated_at || 0).getTime();
        const authTimeA = authA?.updated_at ? new Date(authA.updated_at).getTime() : 0;
        const authTimeB = authB?.updated_at ? new Date(authB.updated_at).getTime() : 0;
        const statusBoostA = ['connected', 'authenticated'].includes(a.status) ? 24 * 60 * 60 * 1000 : 0;
        const statusBoostB = ['connected', 'authenticated'].includes(b.status) ? 24 * 60 * 60 * 1000 : 0;
        const timeA = Math.max(sessionTimeA, authTimeA) + statusBoostA;
        const timeB = Math.max(sessionTimeB, authTimeB) + statusBoostB;
        return timeB - timeA;
      });

      if (sessionsWithAuth.length === 0) {
        console.log(`💡 Nenhuma sessão para restaurar. Usuários precisarão escanear QR.`);
        return;
      }

      // Restaura um lote pequeno no boot, sequencialmente.
      // As demais preservam RemoteAuth e reconectam sob demanda para evitar pico de CPU/RAM.
      const restoreLimit = Math.max(0, Math.min(STARTUP_RESTORE_LIMIT, MAX_CONCURRENT_SESSIONS));
      const toRestore = sessionsWithAuth.slice(0, restoreLimit);
      const remaining = sessionsWithAuth.slice(restoreLimit);

      // Sessões que excedem o limite ficam hibernadas (auto-reconexão sob demanda)
      for (const s of remaining) {
        await this.db.updateSessionStatus(s.id, 'saved_auth');
        console.log(`⏸️ ${s.id}: RemoteAuth salvo mas slot cheio — reconexão sob demanda`);
      }

      console.log(`🚀 Restaurando ${toRestore.length} sessões sequencialmente...`);

      let restored = 0;
      for (const session of toRestore) {
        try {
          console.log(`🔄 [${restored + 1}/${toRestore.length}] Restaurando ${session.id}...`);
          await this.db.updateSessionStatus(session.id, 'initializing');

          const sessionData = {
            id: session.id,
            userId: session.user_id,
            qrCode: null,
            status: 'initializing',
            client: null,
            info: null,
            lastSeen: Date.now(),
            createdAt: Date.now()
          };

          const client = await this.createWhatsAppClient(session.id);
          this.setupClientEvents(client, sessionData);
          sessionData.client = client;
          this.sessions.set(session.id, sessionData);
          this.sessionLastActivity.set(session.id, Date.now());

          // Inicializa com timeout — NÃO bloqueia as próximas sessões
          this.initializeClientInBackground(client, sessionData);
          restored++;

          // Intervalo entre restaurações para não sobrecarregar CPU
          // 8s entre cada uma — com 11 sessões e CPU limitado, 3s era insuficiente
          // e o CPU ficava 100% sem tempo para as sessões atingirem 'ready'
          if (restored < toRestore.length) {
            await new Promise(r => setTimeout(r, 8000));
          }
        } catch (error) {
          console.error(`❌ Erro ao restaurar ${session.id}: ${error.message}`);
          await this.db.updateSessionStatus(session.id, 'disconnected');
        }
      }

      console.log(`✅ ${restored} sessões enviadas para restauração via RemoteAuth`);
      console.log(`💡 Sessões aparecerão como "connected" em 30-120s sem precisar de QR`);
    } catch (error) {
      console.error('❌ Erro ao restaurar sessões:', error.message);
      // Nao marca tudo como desconectado: RemoteAuth salvo deve ser preservado e reconectado sob demanda.
      console.warn('Restauracao interrompida; sessoes salvas permanecem preservadas.');
    }
  }

  async hasSavedRemoteAuth(sessionId) {
    if (!this.pgStore) {
      try {
        await this.initializePostgresStore(2);
      } catch (error) {
        console.warn(`RemoteAuth indisponivel ao verificar ${sessionId}: ${error.message}`);
        return false;
      }
    } else if (!this.useRemoteAuth) {
      try {
        await this.initializePostgresStore(2);
      } catch (error) {
        console.warn(`RemoteAuth ainda indisponivel ao verificar ${sessionId}: ${error.message}`);
      }
    }
    try {
      return await this.pgStore.sessionExists({ session: `RemoteAuth-${sessionId}` });
    } catch (error) {
      console.warn(`Erro ao verificar RemoteAuth de ${sessionId}: ${error.message}`);
      return false;
    }
  }

  scheduleRemoteAuthBackup(sessionData, delayMs, reason) {
    if (!this.useRemoteAuth || !sessionData?.client?.authStrategy?.storeRemoteSession) return;
    const key = `${sessionData.id}:${reason}`;
    if (this.remoteAuthBackupTimers.has(key)) return;
    setTimeout(() => {
      this.remoteAuthBackupTimers.delete(key);
      this.forceRemoteAuthBackup(sessionData.id, reason).catch(error => {
        console.warn(`[${sessionData.id}] Backup RemoteAuth (${reason}) falhou: ${error.message}`);
      });
    }, delayMs).unref?.();
    this.remoteAuthBackupTimers.set(key, true);
  }

  scheduleInitialRemoteAuthBackups(sessionData, reason) {
    const prefix = `${sessionData.id}:initial_backup_scheduled`;
    if (this.remoteAuthBackupTimers.has(prefix)) return;
    this.remoteAuthBackupTimers.set(prefix, true);
    setTimeout(() => this.remoteAuthBackupTimers.delete(prefix), 5 * 60 * 1000).unref?.();

    for (const delayMs of [15000, 60000, 180000]) {
      this.scheduleRemoteAuthBackup(sessionData, delayMs, `${reason}_${delayMs / 1000}s`);
    }
  }

  async forceRemoteAuthBackup(sessionId, reason = 'manual') {
    if (!this.pgStore || !this.useRemoteAuth) return false;

    const session = this.sessions.get(sessionId);
    if (!session?.client?.authStrategy?.storeRemoteSession) return false;
    if (this.remoteAuthSaveInFlight.has(sessionId)) return false;

    const lastForcedSave = this.remoteAuthLastForcedSave.get(sessionId) || 0;
    if (Date.now() - lastForcedSave < 45 * 1000) {
      return await this.hasSavedRemoteAuth(sessionId);
    }

    this.remoteAuthSaveInFlight.add(sessionId);
    try {
      this.remoteAuthLastForcedSave.set(sessionId, Date.now());
      this.pgStore.forceNextSave(`RemoteAuth-${sessionId}`);
      console.log(`[${sessionId}] Forcando backup RemoteAuth (${reason})`);
      await session.client.authStrategy.storeRemoteSession({ emit: true });
      return await this.hasSavedRemoteAuth(sessionId);
    } finally {
      this.remoteAuthSaveInFlight.delete(sessionId);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // DESCONEXÃO POR INATIVIDADE: Destrói sessão completamente
  // Usuário precisa criar nova sessão e escanear QR novamente
  // ═══════════════════════════════════════════════════════════════════
  async disconnectIdleSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      console.log(`⚠️ [${sessionId}] Não encontrada na memória para desconectar`);
      return false;
    }

    if (this.shouldPreserveLiveSession(sessionId)) {
      this.touchSession(sessionId);
      console.log(`[${sessionId}] Hibernacao ignorada: sessao ocupada ou em recuperacao.`);
      return false;
    }

    if (session.status !== 'connected' && session.status !== 'authenticated') {
      console.log(`⚠️ [${sessionId}] Status ${session.status} — não precisa desconectar`);
      return false;
    }

    console.log(`[${sessionId}] Hibernando sessao por inatividade...`);

    let hasRemoteAuth = await this.hasSavedRemoteAuth(sessionId);
    if (!hasRemoteAuth && session.client?.authStrategy?.storeRemoteSession) {
      try {
        hasRemoteAuth = await this.forceRemoteAuthBackup(sessionId, 'idle_hibernate');
      } catch (e) {
        console.warn(`[${sessionId}] Backup antes de hibernar falhou: ${e.message}`);
      }
    }

    // Destrói o processo Chromium
    if (session.client) {
      try {
        await session.client.destroy();
        console.log(`✅ [${sessionId}] Chromium destruído`);
      } catch (e) {
        console.warn(`⚠️ [${sessionId}] Erro ao destruir Chromium: ${e.message}`);
      }
    }

    // Remove da memória completamente
    this.sessions.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
    this.qrGeneratedAt.delete(sessionId);
    this.lastMessageTime.delete(sessionId);
    this.sessionSendLock.delete(sessionId);

    const nextStatus = hasRemoteAuth ? 'saved_auth' : 'disconnected';

    await this.db.updateSessionStatus(sessionId, nextStatus);

    // Limpa arquivos do disco
    this.cleanupSessionFiles(sessionId);

    // Notifica frontend
    this.io.to(`user_${session.userId}`).emit('session_disconnected', {
      sessionId: sessionId,
      info: session.info,
      status: nextStatus,
      hasRemoteAuth,
      recoverable: hasRemoteAuth,
      hibernated: hasRemoteAuth,
      message: hasRemoteAuth
        ? 'Sessao hibernada por inatividade. A autenticacao foi preservada; reative para restaurar sem QR.'
        : 'Sessao desconectada por inatividade. Gere um novo QR Code para conectar.'
    });

    console.log(`[${sessionId}] Hibernada. Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);
    return true;
  }

  // Encontra e desconecta a sessão connected mais ociosa (exceto excludeId)
  async evictOldestIdleSession(excludeId = null) {
    let oldestId = null;
    let oldestTime = Infinity;

    for (const [sid, lastTs] of this.sessionLastActivity.entries()) {
      if (sid === excludeId) continue;
      const sess = this.sessions.get(sid);
      if (!sess || !sess.client) continue;
      if (sess.status !== 'connected' && sess.status !== 'authenticated') continue;
      if (this.shouldPreserveLiveSession(sid)) continue;
      if ((Date.now() - lastTs) < EVICT_IDLE_AFTER_MS) continue;

      if (lastTs < oldestTime) {
        oldestTime = lastTs;
        oldestId = sid;
      }
    }

    if (oldestId) {
      console.log(`🔄 Evicting sessão mais ociosa: ${oldestId} (idle por ${Math.round((Date.now() - oldestTime) / 1000)}s)`);
      await this.disconnectIdleSession(oldestId);
      return true;
    }

    return false;
  }

  isQrWithoutSavedAuth(session) {
    return !!(
      session &&
      session.status === 'qr_code' &&
      !session.hasRemoteAuth &&
      session.qrFromRejectedAuth !== true
    );
  }

  getActiveQrWithoutSavedAuthCount(excludeId = null) {
    let count = 0;
    for (const [sid, sess] of this.sessions.entries()) {
      if (sid === excludeId) continue;
      if (sess.client && this.isQrWithoutSavedAuth(sess)) count++;
    }
    return count;
  }

  async evictOldestQrWithoutSavedAuth(excludeId = null, minAgeMs = QR_NO_AUTH_MIN_KEEPALIVE_MS) {
    let oldestId = null;
    let oldestQrTs = Infinity;
    const now = Date.now();

    for (const [sid, sess] of this.sessions.entries()) {
      if (sid === excludeId) continue;
      if (!sess.client || !this.isQrWithoutSavedAuth(sess)) continue;
      if (this.isSessionBusy(sid)) continue;

      const qrTs = this.qrGeneratedAt.get(sid) || sess.qrGeneratedAt || sess.lastSeen || sess.createdAt || now;
      if ((now - qrTs) < minAgeMs) continue;

      if (qrTs < oldestQrTs) {
        oldestQrTs = qrTs;
        oldestId = sid;
      }
    }

    if (!oldestId) return false;

    console.log(`Evicting QR sem RemoteAuth mais antigo: ${oldestId} (idade ${Math.round((now - oldestQrTs) / 1000)}s)`);
    await this.cleanupSession(oldestId);
    await this.db.updateSessionStatus(oldestId, 'disconnected');
    return true;
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
        if (session.status === 'connected' || session.status === 'authenticated' || session.status === 'saved_auth') {
          await this.db.updateSessionStatus(sessionId, await this.hasSavedRemoteAuth(sessionId) ? 'saved_auth' : 'disconnected');
          console.log(`📴 Sessão ${sessionId}: ${session.status} → saved_auth/disconnected`);
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

  async createSession(sessionId, userId, options = {}) {
    const existingStart = this.sessionStartPromises.get(sessionId);
    if (existingStart) {
      console.log(`[${sessionId}] Inicializacao ja em andamento; reutilizando a mesma promessa.`);
      return existingStart;
    }

    const startPromise = this._createSession(sessionId, userId, options);
    this.sessionStartPromises.set(sessionId, startPromise);
    try {
      return await startPromise;
    } finally {
      if (this.sessionStartPromises.get(sessionId) === startPromise) {
        this.sessionStartPromises.delete(sessionId);
      }
    }
  }

  async _createSession(sessionId, userId, options = {}) {
    console.log(`🆕 Criando nova sessão: ${sessionId}`);

    // CANCELA qualquer reconnect pendente para esta sessão (evita race condition)
    this.cancelReconnect(sessionId);
    this.sessionInitFailures.delete(sessionId);

    // Se a sessão já existe na memória E tem cliente ativo, retorna ela
    if (this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId);
      const now = Date.now();
      const existingAgeMs = now - (existing.lastSeen || existing.createdAt || now);
      const existingQrAgeMs = now - (this.qrGeneratedAt.get(sessionId) || existing.qrGeneratedAt || existing.lastSeen || existing.createdAt || now);
      const freshQr = existing.status === 'qr_code' && existingQrAgeMs <= QR_CODE_TIMEOUT_MS;
      const freshBoot = (existing.status === 'authenticated' || existing.status === 'initializing') &&
        existingAgeMs <= AUTHENTICATED_READY_TIMEOUT_MS;
      if (existing.client && existing.status === 'qr_code' && existingQrAgeMs > QR_CODE_TIMEOUT_MS) {
        console.log(`QR expirado para ${sessionId}; limpando para gerar QR novo`);
        await this.cleanupSession(sessionId);
      } else if (existing.client && (existing.status === 'connected' || freshQr || freshBoot)) {
        console.log(`⚠️ Sessão ${sessionId} já existe na memória com status ${existing.status}`);
        return existing;
      }
      // Se está em estado morto, limpa primeiro
      console.log(`🧹 Sessão ${sessionId} existe na memória mas está morta (${existing.status}), limpando...`);
      await this.cleanupSession(sessionId);
    }

    // Se existe no banco, ATUALIZA o status (NÃO deleta — preserva contatos/mensagens/auto_replies)
    const existingDbSession = await this.db.getSession(sessionId);
    if (existingDbSession) {
      console.log(`🔄 Sessão ${sessionId} existe no banco com status '${existingDbSession.status}', reutilizando registro...`);
      await this.db.updateSessionStatus(sessionId, 'initializing');
    }

    if ((options.forceFreshAuth || options.forceQrFallback) && this.pgStore) {
      const authSessionId = `RemoteAuth-${sessionId}`;
      let hasExistingRemoteAuth = false;
      try {
        hasExistingRemoteAuth = await this.pgStore.sessionExists({ session: authSessionId });
      } catch (error) {
        console.warn(`Erro ao validar RemoteAuth antes de forceFreshAuth ${sessionId}: ${error.message}`);
      }

      if (options.forceQrFallback) {
        this.pgStore.suppressExistingAuth({ session: authSessionId });
        console.warn(`[${sessionId}] forceQrFallback ativo: ignorando RemoteAuth antigo nesta inicializacao para liberar QR sem apagar memoria.`);
      } else if (hasExistingRemoteAuth) {
        console.warn(`[${sessionId}] forceFreshAuth solicitado, mas RemoteAuth existe. Preservando memoria e tentando recuperacao antes de QR.`);
      } else {
        this.pgStore.suppressExistingAuth({ session: authSessionId });
      }
    }

    // RemoteAuth: NÃO deleta dados de auth — permite reconexão sem QR code
    // Dados só são deletados em: deleteSession (explícito) ou auth_failure
    const authClientId = options.forceQrFallback
      ? `${sessionId}-qr-${Date.now()}-${uuidv4().slice(0, 8)}`
      : sessionId;

    if (options.forceQrFallback && this.pgStore) {
      this.pgStore.aliasSession({
        fromSession: authClientId,
        toSession: sessionId,
        suppressSource: true
      });
      this.pgStore.forceNextSave(`RemoteAuth-${sessionId}`);
    }

    let hasRemoteAuth = false;
    if (this.pgStore) {
      try {
        const authSessionId = `RemoteAuth-${sessionId}`;
        hasRemoteAuth = await this.pgStore.sessionExists({ session: authSessionId });
        if (hasRemoteAuth) {
          console.log(`🔑 [${sessionId}] RemoteAuth encontrado no PostgreSQL — reconexão sem QR!`);
        } else {
          console.log(`📱 [${sessionId}] Sem RemoteAuth — QR code será necessário`);
        }
      } catch (e) {
        console.warn(`⚠️ Erro ao verificar auth: ${e.message}`);
      }
    }

    // Guard de memória: recusa novas sessões se RSS exceder limite
    const memUsage = process.memoryUsage();
    const rssMB = Math.round(memUsage.rss / 1024 / 1024);
    if (rssMB > MAX_RSS_MB) {
      console.error(`🚫 Memória RSS (${rssMB}MB) excede limite (${MAX_RSS_MB}MB) — forçando GC e limpeza`);
      if (global.gc) global.gc();
      await this.forceCleanupDeadSessions();
      const newRss = Math.round(process.memoryUsage().rss / 1024 / 1024);
      if (newRss > MAX_RSS_MB) {
        throw new Error(`Servidor com memória crítica (${newRss}MB). Aguarde alguns minutos e tente novamente.`);
      }
    }

    if (!hasRemoteAuth) {
      const activeQrWithoutAuth = this.getActiveQrWithoutSavedAuthCount(sessionId);
      if (activeQrWithoutAuth >= MAX_ACTIVE_QR_SESSIONS) {
        const evictedQr = await this.evictOldestQrWithoutSavedAuth(sessionId);
        if (!evictedQr) {
          throw new Error(`Limite de QR Codes aguardando leitura atingido (${MAX_ACTIVE_QR_SESSIONS}). Aguarde um usuario escanear ou tente novamente em alguns minutos.`);
        }
      }
    }

    // Verifica limite de Chromium simultâneos
    const activeCount = this.getActiveChromiumCount();
    if (activeCount >= MAX_CONCURRENT_SESSIONS) {
      console.warn(`⚠️ Limite de ${MAX_CONCURRENT_SESSIONS} sessões Chromium atingido (${activeCount} ativas)`);

      // 1. Tenta desconectar a sessão connected mais ociosa para liberar slot
      const evicted = await this.evictOldestIdleSession(sessionId);
      if (!evicted) {
        // 2. Tenta limpar sessões mortas (failed, disconnected, etc)
        await this.forceCleanupDeadSessions();
      }

      // 3. Se ainda cheio, limpa apenas estados mortos. Nunca mata QR/init/authenticated para liberar slot.
      let newCount = this.getActiveChromiumCount();
      if (newCount >= MAX_CONCURRENT_SESSIONS) {
        for (const [sid, sess] of this.sessions.entries()) {
          if (sid === sessionId) continue;
          if (['failed', 'disconnected', 'auth_failure'].includes(sess.status)) {
            console.log(`🔄 Forçando cleanup de sessão morta ${sid} (status: ${sess.status}) para liberar slot`);
            await this.cleanupSession(sid);
            await this.db.updateSessionStatus(sid, sess.status === 'auth_failure' ? 'auth_failure' : 'disconnected');
            break;
          }
        }
      }

      newCount = this.getActiveChromiumCount();
      if (newCount >= MAX_CONCURRENT_SESSIONS) {
        await this.evictOldestQrWithoutSavedAuth(sessionId);
      }

      newCount = this.getActiveChromiumCount();
      if (newCount >= MAX_CONCURRENT_SESSIONS) {
        throw new Error(`Limite de sessões simultâneas atingido (${MAX_CONCURRENT_SESSIONS}). Tente novamente em alguns minutos.`);
      }
    }

    // Cria registro no banco apenas se não existia
    if (!existingDbSession) {
      console.log(`💾 Criando sessão ${sessionId} no banco de dados...`);
      await this.db.createSession(sessionId, userId);
    }

    const sessionData = {
      id: sessionId,
      userId,
      qrCode: null,
      status: 'initializing',
      client: null,
      authClientId,
      info: null,
      hasRemoteAuth,
      allowQrFallback: options.forceFreshAuth === true || options.forceQrFallback === true,
      qrFromRejectedAuth: options.forceQrFallback === true,
      qrGeneratedAt: null,
      lastSeen: Date.now(),
      createdAt: Date.now()
    };

    // FIX QR: Limpa arquivos de auth ANTES de criar novo cliente
        // Dados stale do LocalAuth causam "tente novamente mais tarde" no app WhatsApp.
        // Limpar aqui garante que o novo QR Code seja gerado sem conflitos.
        console.log(`Limpando dados de auth anteriores para sessão ${sessionId}...`);
        this.cleanupSessionFiles(sessionId);
        if (authClientId !== sessionId) {
          this.cleanupSessionFiles(authClientId);
        }
    
    console.log(`🤖 Inicializando cliente WhatsApp para sessão ${sessionId}...`);
    const client = await this.createWhatsAppClient(authClientId);
    this.setupClientEvents(client, sessionData);

    sessionData.client = client;
    this.sessions.set(sessionId, sessionData);
    this.sessionLastActivity.set(sessionId, Date.now());

    console.log(`⏳ Iniciando cliente ${sessionId} em background...`);
    console.log(`📊 Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);

    // Inicializa em background sem bloquear
    this.initializeClientInBackground(client, sessionData, {
      priority: options.priority === true
    });

    return sessionData;
  }

  isTransientInitError(error) {
    const message = this.getErrorMessage(error).toLowerCase();
    return message.includes('execution context was destroyed') ||
      message.includes('runtime.callfunctionon') ||
      message.includes('target closed') ||
      message.includes('protocol error') ||
      message.includes('context was destroyed') ||
      message.includes('navigating frame was detached') ||
      message.includes('attempted to use detached frame') ||
      message.includes('session closed') ||
      message.includes('page has been closed') ||
      message.includes('timeout');
  }

  getErrorMessage(error) {
    if (error?.message) {
      return error.message;
    }

    if (typeof error === 'string') {
      return error;
    }

    try {
      return JSON.stringify(error);
    } catch (_jsonError) {
      return String(error || 'unknown error');
    }
  }

  async initializeClientInBackground(client, sessionData, optionsOrAttempt = {}, maybeAttempt = 1) {
    const options = typeof optionsOrAttempt === 'number' ? {} : optionsOrAttempt;
    const attempt = typeof optionsOrAttempt === 'number' ? optionsOrAttempt : maybeAttempt;
    return this.withSessionInitLimit(
      () => this._initializeClientInBackground(client, sessionData, attempt),
      sessionData.id,
      options
    );
  }

  withSessionInitLimit(fn, sessionId, options = {}) {
    return new Promise((resolve, reject) => {
      const item = { fn, sessionId, resolve, reject };
      if (options.priority === true) {
        this.sessionInitQueue.unshift(item);
      } else {
        this.sessionInitQueue.push(item);
      }
      console.log(`[INIT QUEUE] ${sessionId} enfileirada. Fila: ${this.sessionInitQueue.length} | Ativas: ${this.activeSessionInitializations}/${SESSION_INIT_CONCURRENCY}`);
      this.runNextSessionInitialization();
    });
  }

  runNextSessionInitialization() {
    while (this.activeSessionInitializations < SESSION_INIT_CONCURRENCY && this.sessionInitQueue.length > 0) {
      const item = this.sessionInitQueue.shift();
      this.activeSessionInitializations++;

      (async () => {
        try {
          if (SESSION_INIT_STAGGER_MS > 0) {
            await new Promise(resolve => setTimeout(resolve, SESSION_INIT_STAGGER_MS));
          }
          const result = await item.fn();
          item.resolve(result);
        } catch (error) {
          item.reject(error);
        } finally {
          this.activeSessionInitializations--;
          this.runNextSessionInitialization();
        }
      })();
    }
  }

  async _initializeClientInBackground(client, sessionData, attempt = 1) {
    try {
      console.log(`🚀 Inicializando cliente ${sessionData.id} em background... tentativa ${attempt}/${SESSION_INIT_MAX_ATTEMPTS}`);
      console.log(`⏱️ Timeout configurado: ${SESSION_INIT_TIMEOUT_MS / 1000} segundos`);

      const initPromise = client.initialize();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout: Chromium não inicializou em ${SESSION_INIT_TIMEOUT_MS / 1000} segundos`)), SESSION_INIT_TIMEOUT_MS)
      );

      await Promise.race([initPromise, timeoutPromise]);

      console.log(`✅ Cliente ${sessionData.id} inicializado com sucesso`);
      this.reconnectAttempts.delete(sessionData.id);
      this.sessionInitFailures.delete(sessionData.id);
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      console.error(`❌ Erro ao inicializar cliente ${sessionData.id} (tentativa ${attempt}/${SESSION_INIT_MAX_ATTEMPTS}):`, errorMessage);
      this.logRecentError(sessionData.id, new Error(`init attempt ${attempt}/${SESSION_INIT_MAX_ATTEMPTS}: ${errorMessage}`));

      // Timeout NÃO deleta RemoteAuth — é condição temporária (CPU sobrecarregada),
      // NÃO corrupção de dados. Deletar forçaria todos a escanear QR de novo.
      // RemoteAuth só é deletado em: auth_failure (credenciais inválidas) ou deleteSession (explícito).
      if (errorMessage.includes('Timeout')) {
        console.warn(`⚠️ [${sessionData.id}] Timeout na inicialização — RemoteAuth PRESERVADO para próxima tentativa`);
      }

      const hasRemoteAuth = await this.hasSavedRemoteAuth(sessionData.id);
      const isTransientError = this.isTransientInitError(error);
      const qrRejectedSavedAuth = sessionData.qrFromRejectedAuth === true || sessionData.status === 'auth_failure';
      if (isTransientError && attempt < SESSION_INIT_MAX_ATTEMPTS && !qrRejectedSavedAuth) {
        const retryMode = hasRemoteAuth ? 'sem perder RemoteAuth' : 'para liberar QR de nova sessão';
        console.warn(`[${sessionData.id}] Falha transiente do Chromium/WhatsApp Web. Recriando cliente ${retryMode}...`);

        try {
          await client.destroy();
        } catch (destroyError) {
          console.warn(`[${sessionData.id}] Erro ao destruir cliente instavel: ${destroyError.message}`);
        }

        this.sessions.delete(sessionData.id);
        this.sessionLastActivity.delete(sessionData.id);
        this.qrGeneratedAt.delete(sessionData.id);
        this.cleanupSessionFiles(sessionData.id);
        await new Promise(r => setTimeout(r, 10000 * attempt));

        const retryClient = await this.createWhatsAppClient(sessionData.id);
        this.setupClientEvents(retryClient, sessionData);
        sessionData.client = retryClient;
        sessionData.status = 'initializing';
        sessionData.lastSeen = Date.now();
        this.sessions.set(sessionData.id, sessionData);
        this.sessionLastActivity.set(sessionData.id, Date.now());
        await this.db.updateSessionStatus(sessionData.id, 'initializing');

        return this._initializeClientInBackground(retryClient, sessionData, attempt + 1);
      }

      // A primeira falha transiente recebe uma tentativa isolada acima. Se o
      // RemoteAuth ainda nao inicializar, preserva o pacote e interrompe o
      // ciclo automatico. A proxima ativacao deve tentar reidratar novamente.
      let latestDbStatus = null;
      try {
        latestDbStatus = (await this.db.getSession(sessionData.id))?.status || null;
      } catch (_dbStatusError) {
        latestDbStatus = null;
      }
      const savedAuthWasRejected = qrRejectedSavedAuth === true;
      const failedStatus = savedAuthWasRejected ? 'auth_failure' : (hasRemoteAuth ? 'saved_auth' : 'failed');
      this.sessionInitFailures.set(sessionData.id, {
        message: errorMessage,
        timestamp: Date.now()
      });
      await this.cleanupSession(sessionData.id);
      await this.db.updateSessionStatus(sessionData.id, failedStatus);

      console.log(`💾 Sessão ${sessionData.id} preservada no banco como '${failedStatus}'`);

      // Notifica frontend que a inicialização falhou (evita "Inicializando..." eterno)
      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionData.id,
        error: hasRemoteAuth
          ? 'A sessão salva não concluiu a reativação. A credencial anterior foi preservada; gere um novo QR Code.'
          : 'Falha ao inicializar sessão. Tente criar novamente.',
        status: failedStatus,
        recoverable: true,
        action: savedAuthWasRejected ? 'scan_qr' : (hasRemoteAuth ? 'reactivate_saved_auth' : 'retry'),
        recentFailure: true
      });
    }
  }

  // Limpa sessão da memória e destrói Chromium, sem tocar no banco
  async cleanupSession(sessionId) {
    const session = this.sessions.get(sessionId);
    this.intentionalShutdowns.add(sessionId);
    this.sessions.delete(sessionId);
    this.sessionLastActivity.delete(sessionId);
    this.qrGeneratedAt.delete(sessionId);
    this.reconnectAttempts.delete(sessionId);
    this.reconnectPromises.delete(sessionId);
    this.reconnectingSet.delete(sessionId);

    if (session && session.client) {
      try {
        await session.client.destroy();
        console.log(`✅ Cliente Chromium destruído: ${sessionId}`);
      } catch (e) {
        console.error(`⚠️ Erro ao destruir cliente ${sessionId}:`, e.message);
      }
    }
    setTimeout(() => this.intentionalShutdowns.delete(sessionId), 5000);

    // Limpa arquivos do disco para liberar espaço
    this.cleanupSessionFiles(sessionId);
    if (session?.authClientId && session.authClientId !== sessionId) {
      this.cleanupSessionFiles(session.authClientId);
    }
  }

  cleanupSessionFiles(sessionId) {
    const paths = [
      path.join(__dirname, '..', '.wwebjs_auth', `session-${sessionId}`),
      path.join(__dirname, '..', '.wwebjs_cache', `session-${sessionId}`),
      path.join(__dirname, '..', '.wwebjs_auth', `RemoteAuth-${sessionId}`),
      path.join(__dirname, '..', '.wwebjs_auth', `RemoteAuth-${sessionId}.zip`),
      path.join('/app', '.wwebjs_auth', `session-${sessionId}`),
      path.join('/app', '.wwebjs_cache', `session-${sessionId}`),
      path.join('/app', '.wwebjs_auth', `RemoteAuth-${sessionId}`),
      path.join('/app', '.wwebjs_auth', `RemoteAuth-${sessionId}.zip`),
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

  // ═══════════════════════════════════════════════════════════════
  // CACHE DE CONTATOS — Reduz queries durante disparos em massa
  // Mesmo contato não faz upsert repetido por _contactCacheTTL (10min)
  // Reduz de ~2000 queries para ~200 durante disparo de 10 usuários
  // ═══════════════════════════════════════════════════════════════
  async cachedUpsertContact(sessionId, phone, name = null) {
    const cacheKey = `${sessionId}_${phone}`;
    const lastUpsert = this._contactCache.get(cacheKey);
    const now = Date.now();

    // Se já fez upsert recentemente, pula
    if (lastUpsert && (now - lastUpsert) < this._contactCacheTTL) {
      return; // Cache hit — economiza 1 query no banco
    }

    // Cache miss — faz upsert e atualiza cache
    try {
      await this.db.upsertContact(sessionId, phone, name);
      this._contactCache.set(cacheKey, now);

      // Limpa cache antigo periodicamente (evita memory leak)
      if (this._contactCache.size > 5000) {
        const cutoff = now - this._contactCacheTTL;
        for (const [k, ts] of this._contactCache.entries()) {
          if (ts < cutoff) this._contactCache.delete(k);
        }
      }
    } catch (err) {
      // Falha no upsert NÃO deve bloquear envio de mensagem
      console.warn(`⚠️ upsertContact falhou para ${phone}: ${err.message}`);
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
    if ((!this.useRemoteAuth || !this.pgStore) && REQUIRE_REMOTE_AUTH) {
      try {
        await this.initializePostgresStore(3);
      } catch (error) {
        throw new Error(`RemoteAuth/PostgresStore indisponivel temporariamente; sessao ${sessionId} preservada sem gerar QR local. Tente novamente em instantes. Detalhe: ${error.message}`);
      }
    }

    const useRemoteAuthForClient = this.useRemoteAuth && this.pgStore;
    if (!useRemoteAuthForClient) {
      throw new Error(`RemoteAuth/PostgresStore indisponivel; LocalAuth bloqueado para preservar sessoes salvas (${sessionId}).`);
    }

    const clientConfig = {
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--disable-extensions',
          '--disable-default-apps',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-default-browser-check',
          '--disable-features=TranslateUI',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--js-flags=--max-old-space-size=256',
          '--autoplay-policy=user-gesture-required',
          '--disable-domain-reliability',
          '--window-size=1280,720'
        ],
        executablePath: actualExecPath,
        timeout: SESSION_INIT_TIMEOUT_MS,
        protocolTimeout: Math.max(SESSION_INIT_TIMEOUT_MS, 300000)
      },
      authStrategy: new RemoteAuth({
        clientId: sessionId,
        store: this.pgStore,
        backupSyncIntervalMs: 60 * 1000 // Salva frequentemente para proteger novos scans contra deploy/restart
      }),
      markOnlineAvailable: false,
      syncFullHistory: false,
      disableAutoSeen: true,
      webVersionCache: {
        type: 'local',
        strict: false
      }
    };

    return new Client(clientConfig);
  }

  setupClientEvents(client, sessionData) {
    client.on('error', async (error) => {
      // Erros ignoráveis do WhatsApp Web (não afetam funcionalidade)
      if (this.isIgnorableWhatsAppError(error)) {
        return; // Silenciosamente ignora — são erros internos do WA Web
      }

      console.error(`❌ [${sessionData.id}] Erro no cliente:`, error.message);
      this.logRecentError(sessionData.id, error);

      // Se é um erro fatal que indica que o Chromium morreu
      if (this.isFatalSessionError(error)) {
        console.error(`💀 [${sessionData.id}] Erro FATAL detectado no event handler. Iniciando reconexão...`);
        const nextStatus = await this.hasSavedRemoteAuth(sessionData.id) ? 'saved_auth' : 'disconnected';
        sessionData.status = nextStatus;
        await this.db.updateSessionStatus(sessionData.id, nextStatus);

        this.io.to(`user_${sessionData.userId}`).emit('session_disconnected', {
          sessionId: sessionData.id,
          reason: 'CHROMIUM_CRASH'
        });

        // Reconectar automaticamente
        this.attemptFullReconnect(sessionData);
      }
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
      let hadSavedAuth = false;
      try {
        hadSavedAuth = await this.hasSavedRemoteAuth(sessionData.id);
        if (hadSavedAuth && !sessionData.allowQrFallback) {
          this.logRecentError(
            sessionData.id,
            new Error('RemoteAuth salvo existe, mas o WhatsApp Web pediu QR durante reidratacao. QR liberado preservando memoria.')
          );
          console.warn(`[${sessionData.id}] RemoteAuth salvo foi rejeitado pelo WhatsApp Web. Preservando blob e liberando QR imediatamente.`);
          sessionData.qrFromRejectedAuth = true;
          this.sessionInitFailures.delete(sessionData.id);
        } else if (hadSavedAuth) {
          this.logRecentError(
            sessionData.id,
            new Error('RemoteAuth salvo existe, mas o WhatsApp Web pediu QR. A sessao salva nao foi aceita para reativacao.')
          );
          console.warn(`[${sessionData.id}] RemoteAuth salvo existe, mas WhatsApp Web pediu QR; manter dados salvos e exigir novo scan.`);
        }
      } catch (authCheckError) {
        console.warn(`[${sessionData.id}] Nao foi possivel verificar RemoteAuth durante QR: ${authCheckError.message}`);
      }
      const qrGeneratedAt = Date.now();
      sessionData.qrCode = await QRCode.toDataURL(qr);
      sessionData.status = 'qr_code';
      sessionData.qrFromRejectedAuth = sessionData.qrFromRejectedAuth || hadSavedAuth;
      sessionData.qrGeneratedAt = qrGeneratedAt;
      sessionData.lastSeen = qrGeneratedAt;
      this.qrGeneratedAt.set(sessionData.id, qrGeneratedAt);
      this.sessionInitFailures.delete(sessionData.id);
      // NÃO atualizar sessionLastActivity aqui — cada QR gerado renovava o timer
      // e o timeout de 5 minutos nunca disparava, causando loop infinito de QR

      // Enquanto o QR esta vivo, o banco precisa refletir isso para a interface
      // mostrar o QR imediatamente. Se ele expirar sem scan, o cleanup marca
      // auth_failure quando a origem foi uma credencial salva rejeitada.
      await this.db.updateSessionStatus(sessionData.id, 'qr_code');

      this.io.to(`user_${sessionData.userId}`).emit('qr_code', {
        sessionId: sessionData.id,
        qrCode: sessionData.qrCode
      });

      if (sessionData.qrFromRejectedAuth) {
        this.io.to(`user_${sessionData.userId}`).emit('session_error', {
          sessionId: sessionData.id,
          status: 'qr_code',
          recoverable: true,
          action: 'scan_qr',
          error: 'A sessao salva foi preservada, mas o WhatsApp exigiu um novo QR Code. O QR ja esta disponivel para reativar sem excluir o usuario.'
        });
      }
    });

    client.on('authenticated', async () => {
      console.log(`✅ Autenticado: ${sessionData.id}`);
      sessionData.status = 'authenticated';
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());

      await this.db.updateSessionStatus(sessionData.id, 'authenticated');
      this.scheduleInitialRemoteAuthBackups(sessionData, 'authenticated');

      this.io.to(`user_${sessionData.userId}`).emit('session_authenticated', {
        sessionId: sessionData.id,
        info: sessionData.info
      });

      // Safety net: se 'ready' não disparar em 180s após autenticação,
      // marca como failed para o frontend não ficar preso em "Autenticado"
      // Give WhatsApp Web time to finish navigating under load before recovery.
      setTimeout(async () => {
        const currentSession = this.sessions.get(sessionData.id);
        // A timer from an older Chromium must never tear down its replacement.
        if (currentSession && currentSession === sessionData && currentSession.status === 'authenticated') {
          console.warn(`[${sessionData.id}] Sessao autenticada sem ready. Verificando RemoteAuth antes de limpar.`);
          let hasAuth = await this.hasSavedRemoteAuth(sessionData.id);

          if (!hasAuth) {
            console.warn(`[${sessionData.id}] Sem RemoteAuth salvo. Tentando backup imediato e preservando Chromium para nao perder scan novo.`);
            await this.forceRemoteAuthBackup(sessionData.id, 'authenticated_timeout_protect');
            hasAuth = await this.hasSavedRemoteAuth(sessionData.id);
          }

          if (!hasAuth) {
            currentSession.lastSeen = Date.now();
            this.sessionLastActivity.set(sessionData.id, Date.now());
            await this.db.updateSessionStatus(sessionData.id, 'authenticated');
            this.scheduleInitialRemoteAuthBackups(currentSession, 'authenticated_timeout_retry');
            this.io.to(`user_${sessionData.userId}`).emit('session_reconnecting', {
              sessionId: sessionData.id,
              error: 'WhatsApp autenticou. Protegendo a sessao antes de reiniciar a conexao.',
              status: 'authenticated'
            });
            return;
          }

          this.sessionInitFailures.set(sessionData.id, {
            message: 'authenticated_timeout_without_ready',
            timestamp: Date.now()
          });

          currentSession.status = 'saved_auth';
          await this.cleanupSession(sessionData.id);
          await this.db.updateSessionStatus(sessionData.id, 'saved_auth');
          this.io.to(`user_${sessionData.userId}`).emit('session_error', {
            sessionId: sessionData.id,
            error: 'WhatsApp autenticou, mas nao ficou pronto. A memoria foi preservada; tente reativar novamente.',
            status: 'saved_auth',
            recoverable: true,
            action: 'reactivate_saved_auth',
            recentFailure: true
          });
        }
      }, AUTHENTICATED_READY_TIMEOUT_MS);
    });

    // RemoteAuth: sessão salva no PostgreSQL com sucesso
    // (evento só dispara na PRIMEIRA vez; backups periódicos são silenciosos)
    client.on('remote_session_saved', () => {
      console.log(`💾 [${sessionData.id}] Sessão salva no PostgreSQL — sobrevive a deploys!`);
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());
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

      let authProtected = await this.hasSavedRemoteAuth(sessionData.id);
      if (!authProtected) {
        console.warn(`[${sessionData.id}] Ready sem RemoteAuth validado. Forcando backup antes de liberar como recuperavel.`);
        authProtected = await this.forceRemoteAuthBackup(sessionData.id, 'ready_protect_scan');
      }

      if (!authProtected) {
        this.logRecentError(
          sessionData.id,
          new Error('Sessao conectou, mas RemoteAuth ainda nao foi confirmado no PostgreSQL. Backups agendados continuam tentando.')
        );
        this.io.to(`user_${sessionData.userId}`).emit('session_warning', {
          sessionId: sessionData.id,
          warning: 'WhatsApp conectado, mas a persistencia da sessao ainda esta sendo confirmada. Evite reiniciar a API nos proximos minutos.'
        });
      }

      this.scheduleInitialRemoteAuthBackups(sessionData, 'ready');

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

      // Auth falhou: preserva o registro e exige novo QR sem deletar dados automaticamente.
      if (this.pgStore) {
        try {
          const authSessionId = `RemoteAuth-${sessionData.id}`;
          // Preserva RemoteAuth; remocao so deve ocorrer em logout explicito.
          console.warn(`[${sessionData.id}] Auth failure detectado, mas RemoteAuth foi preservado: ${authSessionId}`);
        } catch (e) {
          console.warn(`⚠️ Erro ao limpar RemoteAuth corrompido: ${e.message}`);
        }
      }

      // Limpa recursos de Chromium mas mantém registro no banco
      await this.cleanupSession(sessionData.id);

      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionData.id,
        error: 'Falha na autenticação. Gere um novo QR Code para reativar este usuário.',
        status: 'auth_failure'
      });
    });

    client.on('disconnected', async (reason) => {
      console.log(`🔴 Desconectado: ${sessionData.id} - Motivo: ${reason}`);
      sessionData.lastSeen = Date.now();

      if (this.intentionalShutdowns.has(sessionData.id)) {
        console.log(`[${sessionData.id}] Disconnected esperado durante cleanup/hibernacao; sem auto-reconnect.`);
        return;
      }

      const hasRemoteAuth = await this.hasSavedRemoteAuth(sessionData.id);
      const shouldReconnect = reason !== 'LOGOUT' && reason !== 'CONFLICT' && hasRemoteAuth;
      const nextStatus = shouldReconnect ? 'authenticated' : 'disconnected';
      sessionData.status = nextStatus;

      await this.db.updateSessionStatus(sessionData.id, nextStatus);

      this.io.to(`user_${sessionData.userId}`).emit('session_disconnected', {
        sessionId: sessionData.id,
        reason,
        status: nextStatus,
        hasRemoteAuth,
        recoverable: shouldReconnect
      });

      // Tenta reconectar apenas se o motivo não for logout manual
      if (shouldReconnect) {
        await this.attemptReconnect(sessionData);
      } else {
        // Limpa recursos de Chromium
        await this.cleanupSession(sessionData.id);
      }
    });

    // (remote_session_saved já registrado acima — não duplicar)

    client.on('message', async (message) => {
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());

      // ═══════════════════════════════════════════════════════════════
      // FILTROS: Ignora mensagens que não devem criar contatos/webhooks
      // ═══════════════════════════════════════════════════════════════
      // 1. Status broadcasts
      if (message.from.includes('status@broadcast')) return;
      // 2. Grupos
      if (message.from.includes('@g.us')) return;
      // 3. Mensagens do próprio sistema (fromMe)
      if (message.fromMe) return; // message_create cuida das enviadas

      // Resolver telefone: suporta @c.us e @lid (Linked ID do WhatsApp)
      let contactPhone = message.from.replace('@c.us', '').replace('@lid', '');
      let whatsappLid = null;

      if (message.from.includes('@lid')) {
        whatsappLid = message.from;
        try {
          const contact = await message.getContact();
          if (contact && contact.number) {
            contactPhone = contact.number;
            console.log(`🔗 LID resolvido: ${message.from} → ${contactPhone}`);
          } else {
            // LID NÃO resolvido — NÃO salva como contato (número fantasma)
            console.log(`👻 LID sem número real: ${message.from} — IGNORANDO (não cria contato)`);
            return;
          }
        } catch (lidError) {
          console.warn(`⚠️ Erro ao resolver LID ${message.from}: ${lidError.message} — IGNORANDO`);
          return;
        }
      }

      // 4. Valida se é telefone real (10-13 dígitos brasileiros)
      if (!this.isValidPhoneNumber(contactPhone)) {
        console.log(`👻 Telefone inválido ignorado: ${contactPhone} (${contactPhone.length} dígitos)`);
        return;
      }

      // 5. Ignora mensagem do próprio número (evita auto-contato)
      if (this.isSelfNumber(sessionData.id, contactPhone)) {
        console.log(`🔄 Auto-mensagem ignorada: ${contactPhone} é o próprio número conectado`);
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
        fromMe: false,
        timestamp: message.timestamp,
        status: 'received'
      };

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

      // UPDATE ONLY — NÃO cria contato novo para mensagens recebidas
      // Apenas atualiza last_message_at se o contato JÁ existir no sistema
      // Isso evita que contatos pessoais do WhatsApp apareçam como leads
      let contactExists = false;
      try {
        const updateResult = await this.db.updateContactIfExists(sessionData.id, contactPhone, message._data.notifyName);
        contactExists = updateResult && updateResult.changes > 0;
      } catch (err) {
        // Falha no update não deve bloquear processamento da mensagem
      }

      this.io.to(`user_${sessionData.userId}`).emit('new_message', {
        sessionId: sessionData.id,
        message: messageData
      });

      // Webhook — SÓ envia se o contato EXISTE no banco (é um lead cadastrado)
      // Contatos pessoais do WhatsApp (que não são leads) NÃO disparam webhook,
      // impedindo que o Edge Function crie leads falsos.
      // Antes dependíamos do flag doNotCreateLead, mas o Edge Function no projeto
      // tnpklervxwlexgaanxlw pode não ter essa verificação.
      if (contactExists) {
        const webhookUrl = await this.db.getSessionWebhook(sessionData.id);
        if (webhookUrl) {
          try {
            const webhookPayload = {
              phone: contactPhone,
              message: messageData.body || '',
              fromMe: false,
              timestamp: messageData.timestamp,
              messageId: messageData.id,
              sessionId: sessionData.id,
              userId: sessionData.userId,
              messageType: messageData.messageType,
              notifyName: message._data?.notifyName || message._data?.pushname || null,
              // Flag para Edge Function: NÃO criar lead novo, apenas atualizar existente
              // (redundância de segurança — já filtramos acima por contactExists)
              doNotCreateLead: true
            };

            const webhookController = new AbortController();
            const webhookTimeout = setTimeout(() => webhookController.abort(), 5000);
            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
              signal: webhookController.signal
            });
            clearTimeout(webhookTimeout);
          } catch (error) {
            console.error(`❌ Erro webhook:`, error.message);
          }
        }
      } else {
        console.log(`👤 [${sessionData.id}] Msg de contato pessoal ${contactPhone} — webhook NÃO enviado (não é lead)`);
      }

      await this.processAutoReplies(sessionData.id, message);
    });

    client.on('message_create', async (message) => {
      if (!message.fromMe) return; // Só processa mensagens enviadas

      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());

      // Ignora grupos e broadcasts
      if (message.to.includes('@g.us') || message.to.includes('status@broadcast')) return;

      // Resolver telefone
      let contactPhone = message.to.replace('@c.us', '').replace('@lid', '');

      if (message.to.includes('@lid')) {
        try {
          const contact = await message.getContact();
          if (contact && contact.number) {
            contactPhone = contact.number;
          } else {
            // LID não resolvido — ignora (não cria contato fantasma)
            return;
          }
        } catch (e) {
          return; // Erro ao resolver — ignora silenciosamente
        }
      }

      // Valida telefone
      if (!this.isValidPhoneNumber(contactPhone)) return;
      // Ignora auto-mensagem
      if (this.isSelfNumber(sessionData.id, contactPhone)) return;

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
        status: 'pending'
      };

      // NÃO faz upsertContact aqui — o sendMessage (disparo via API) já cria o contato.
      // Fazer upsert aqui criaria leads falsos para contatos pessoais do WhatsApp,
      // já que message_create dispara para TODA mensagem enviada (pessoal ou campanha).

      this.io.to(`user_${sessionData.userId}`).emit('message_pending', {
        sessionId: sessionData.id,
        message: messageData
      });

      // NÃO envia webhook para message_create — o sendMessage já
      // retorna sucesso via HTTP para o ProspectFlow. Enviar webhook
      // aqui causaria contagem dupla de mensagens enviadas.
    });

    client.on('message_ack', async (message, ack) => {
      const messageId = message?.id?._serialized;
      if (!messageId) return;

      const ackNumber = Number(ack);
      const status = this.getAckStatus(ackNumber);
      const ackData = {
        ack: ackNumber,
        status,
        timestamp: Date.now()
      };
      this.messageAckCache.set(messageId, ackData);

      const waiter = this.messageAckWaiters.get(messageId);
      if (waiter && (ackNumber >= waiter.minAck || ackNumber === -1)) {
        clearTimeout(waiter.timeout);
        this.messageAckWaiters.delete(messageId);
        waiter.resolve({
          confirmed: ackNumber >= waiter.minAck,
          ack: ackNumber,
          status,
          timedOut: false
        });
      }

      try {
        await this.db.updateMessageStatus(messageId, status);
      } catch (error) {
        console.warn(`[${sessionData.id}] Falha ao atualizar ACK ${messageId}: ${error.message}`);
      }

      this.io.to(`user_${sessionData.userId}`).emit('message_status', {
        sessionId: sessionData.id,
        messageId,
        ack: ackNumber,
        status
      });
    });
  }

  // Cancela qualquer reconnect pendente para uma sessão
  cancelReconnect(sessionId) {
    if (this.reconnectAttempts.has(sessionId)) {
      console.log(`🚫 [${sessionId}] Cancelando reconnect pendente (createSession chamado)`);
      this.reconnectCancelled.add(sessionId);
      this.reconnectAttempts.delete(sessionId);
    }
  }

  async attemptReconnect(sessionData) {
    // Redireciona para o novo método robusto
    await this.attemptFullReconnect(sessionData);
  }

  // ═══════════════════════════════════════════════════════════════════
  // RECONEXÃO COMPLETA: Destrói o cliente antigo e cria um novo
  // Isso é necessário porque quando Chromium crasha, o cliente antigo
  // não pode ser reutilizado — precisa criar um novo processo
  // ═══════════════════════════════════════════════════════════════════
  async attemptFullReconnect(sessionData) {
    const sessionId = sessionData.id;
    const attempts = this.reconnectAttempts.get(sessionId) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      console.log(`❌ [${sessionId}] Máximo de ${this.maxReconnectAttempts} reconexões atingido. Sessão precisa ser recriada manualmente.`);
      await this.cleanupSession(sessionId);
      const preservedStatus = await this.hasSavedRemoteAuth(sessionId) ? 'saved_auth' : 'failed';
      await this.db.updateSessionStatus(sessionId, preservedStatus);

      // Notifica frontend que todas as tentativas falharam
      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionId,
        error: 'Reconexão falhou após várias tentativas. Delete e crie a sessão novamente.',
        status: preservedStatus
      });
      return;
    }

    this.reconnectAttempts.set(sessionId, attempts + 1);
    const delay = Math.min(2000 * Math.pow(2, attempts), 30000); // 2s, 4s, 8s... max 30s

    console.log(`🔄 [${sessionId}] Reconexão completa ${attempts + 1}/${this.maxReconnectAttempts} em ${delay / 1000}s...`);

    setTimeout(async () => {
      // VERIFICA SE O RECONNECT FOI CANCELADO (por createSession manual)
      if (this.reconnectCancelled.has(sessionId)) {
        console.log(`🚫 [${sessionId}] Reconnect cancelado — createSession já está tratando`);
        this.reconnectCancelled.delete(sessionId);
        return;
      }

      // Verifica se a sessão atual na memória é a MESMA que estamos tentando reconectar
      // Se createSession criou uma nova sessão, o objeto sessionData não é mais o atual
      const currentSession = this.sessions.get(sessionId);
      if (currentSession && currentSession !== sessionData && currentSession.status !== 'disconnected') {
        console.log(`🚫 [${sessionId}] Sessão já foi recriada (status: ${currentSession.status}), abortando reconnect antigo`);
        return;
      }

      try {
        // 1. Destrói o cliente antigo completamente
        if (sessionData.client) {
          try {
            await sessionData.client.destroy();
          } catch (e) {
            console.warn(`⚠️ [${sessionId}] Erro ao destruir cliente antigo: ${e.message}`);
          }
        }

        // 2. Verifica se ainda temos espaço para Chromium
        const activeCount = this.getActiveChromiumCount();
        if (activeCount >= MAX_CONCURRENT_SESSIONS) {
          console.warn(`⚠️ [${sessionId}] Sem espaço para reconexão (${activeCount}/${MAX_CONCURRENT_SESSIONS})`);
          await this.forceCleanupDeadSessions();
        }

        // 3. Cria um novo cliente WhatsApp
        console.log(`🤖 [${sessionId}] Criando novo cliente WhatsApp...`);
        const newClient = await this.createWhatsAppClient(sessionId);
        this.setupClientEvents(newClient, sessionData);

        sessionData.client = newClient;
        sessionData.status = 'initializing';
        sessionData.lastSeen = Date.now();
        this.sessions.set(sessionId, sessionData);
        this.sessionLastActivity.set(sessionId, Date.now());

        // 4. Inicializa em background
        this.initializeClientInBackground(newClient, sessionData);

        console.log(`✅ [${sessionId}] Reconexão iniciada com sucesso`);
      } catch (error) {
        console.error(`❌ [${sessionId}] Falha na reconexão completa:`, error.message);
        this.logRecentError(sessionId, error);
        // Tenta novamente (se não foi cancelado)
        if (!this.reconnectCancelled.has(sessionId)) {
          await this.attemptFullReconnect(sessionData);
        }
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

    // Limpa dados de auth do RemoteAuth no PostgreSQL
    if (this.pgStore) {
      try {
        const authSessionId = `RemoteAuth-${sessionId}`;
        await this.pgStore.delete({ session: authSessionId });
        console.log(`🗑️ Auth data removido do PostgreSQL: ${authSessionId}`);
      } catch (e) {
        console.warn(`⚠️ Erro ao limpar auth do PostgreSQL: ${e.message}`);
      }
    }

    // Limpa mensagens em memória dessa sessão
    for (const key of this.inMemoryMessages.keys()) {
      if (key.startsWith(`${sessionId}_`)) {
        this.inMemoryMessages.delete(key);
      }
    }

    console.log(`✅ Sessão ${sessionId} deletada completamente`);
  }

  // ═══════════════════════════════════════════════════════════════════
  // VALIDAÇÃO DE TELEFONE — Filtra LIDs, números inválidos e fantasmas
  // Telefone brasileiro válido: 55 + DDD(2) + número(8-9) = 12 ou 13 dígitos
  // ═══════════════════════════════════════════════════════════════════
  isValidPhoneNumber(phone) {
    if (!phone) return false;
    const digits = phone.replace(/\D/g, '');
    // Telefone brasileiro com 55: 12-13 dígitos
    // Sem 55: 10-11 dígitos
    if (digits.startsWith('55')) {
      return digits.length >= 12 && digits.length <= 13;
    }
    return digits.length >= 10 && digits.length <= 11;
  }

  // Verifica se o telefone é do próprio usuário conectado (evita auto-mensagem)
  isSelfNumber(sessionId, phone) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.info || !session.info.wid) return false;
    const selfNumber = session.info.wid.user || session.info.wid._serialized?.replace('@c.us', '');
    if (!selfNumber) return false;
    const cleanPhone = phone.replace(/\D/g, '');
    return cleanPhone.includes(selfNumber) || selfNumber.includes(cleanPhone);
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

  getPhoneVariants(phoneNumber) {
    const normalized = this.normalizePhoneNumber(phoneNumber);
    const variants = [normalized];

    // Brazilian mobile contacts may resolve in WhatsApp with or without the ninth digit.
    if (normalized.startsWith('55') && normalized.length === 13 && normalized[4] === '9') {
      variants.push(`${normalized.slice(0, 4)}${normalized.slice(5)}`);
    } else if (normalized.startsWith('55') && normalized.length === 12) {
      variants.push(`${normalized.slice(0, 4)}9${normalized.slice(4)}`);
    }

    return [...new Set(variants)];
  }

  emitMessageSent(session, messageData) {
    if (!session || !this.io) return;
    const room = `user_${session.userId}`;
    const payload = {
      sessionId: session.id,
      ...messageData,
      message: {
        ...messageData,
        to: messageData.to || messageData.contactPhone,
        phone: messageData.phone || messageData.contactPhone,
        contactPhone: messageData.contactPhone,
        status: messageData.status || 'sent',
        fromMe: true,
        isFromMe: true
      }
    };

    this.io.to(room).emit('message_sent', payload);
  }

  // ═══════════════════════════════════════════════════════════════════
  // VERIFICAÇÃO DE SAÚDE DA SESSÃO — Testa se Chromium ainda responde
  // ═══════════════════════════════════════════════════════════════════
  async isSessionAlive(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.client) return false;

    // Se o status local já diz que está conectado/autenticado, confia nele
    // em vez de chamar getState() que pode falhar com erros ignoráveis
    if (session.status === 'connected' || session.status === 'authenticated') {
      try {
        // Teste leve: apenas verifica se o Puppeteer ainda responde
        const statePromise = session.client.getState();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('health_check_timeout')), 8000)
        );
        const state = await Promise.race([statePromise, timeoutPromise]);
        // Aceita CONNECTED ou qualquer resposta (se respondeu, Chromium está vivo)
        return state !== null && state !== undefined;
      } catch (error) {
        // Se o erro é ignorável do WA Web, a sessão está viva
        if (this.isIgnorableWhatsAppError(error)) {
          return true;
        }
        console.warn(`⚠️ [${sessionId}] Health check falhou: ${error.message}`);
        return false;
      }
    }

    return false;
  }

  // Verifica se é um erro IGNORÁVEL do WhatsApp Web (não afeta envio)
  isIgnorableWhatsAppError(error) {
    const msg = (error.message || '');
    const ignorablePatterns = [
      'markedUnread',
      'getModelsArray',
      'getLabelModel',
      'sendSeen',
      'markSeen',
      'getProfilePicUrl',
      'presenceAvailable',
      'archiveChat',
      'muteChat',
      'pinChat',
      'starMessage',
      'getStatus',
      'No LID for user',
      "Cannot read properties of undefined (reading 'isBot')",
      'reading \'isBot\'',
      'getIsMyContact',
      'detached Frame',                // Puppeteer frame bug (não fatal com --disable-site-isolation)
      'Attempted to use detached',     // Variação do mesmo bug
      'invalid wid',                   // Número inválido — NÃO é erro do Chromium
      'wid error',                     // Variação do mesmo
      'invalid number',                // Número inválido
      'not registered',                // Número não registrado no WhatsApp
    ];
    return ignorablePatterns.some(p => msg.includes(p));
  }

  // Detecta se um erro indica que o Chromium/sessão REALMENTE morreu
  // IMPORTANTE: "Evaluation failed" sozinho NÃO é fatal — WhatsApp Web
  // gera muitos "Evaluation failed" internos que são inofensivos.
  // Só é fatal quando indica que o processo Chromium/browser morreu.
  isFatalSessionError(error) {
    const msg = (error.message || '').toLowerCase();

    // Primeiro: se é um erro ignorável do WhatsApp Web, NUNCA é fatal
    if (this.isIgnorableWhatsAppError(error)) {
      return false;
    }

    // Erros que REALMENTE indicam que o Chromium morreu
    // NOTA: "frame was detached" removido — com --disable-site-isolation-trials
    // é prevenido, e quando ocorre não é necessariamente fatal
    const fatalPatterns = [
      'session closed',
      'target closed',
      'page crashed',
      'browser disconnected',
      'cannot find context',
      'websocket is not open',
      'econnrefused',
      'epipe',
      'browser has disconnected',
      'connection closed',
      'execution context was destroyed',
      'protocol error',
      'chromium morto',
    ];
    return fatalPatterns.some(p => msg.includes(p));
  }

  // Registra erros recentes para diagnóstico
  logRecentError(sessionId, error) {
    this.recentErrors.push({
      sessionId,
      message: error.message,
      timestamp: Date.now(),
      stack: (error.stack || '').split('\n').slice(0, 3).join(' | ')
    });
    // Mantém apenas os últimos 50 erros
    if (this.recentErrors.length > 50) {
      this.recentErrors = this.recentErrors.slice(-50);
    }
  }

  // Controle de rate-limit: espera intervalo mínimo entre mensagens
  async waitForRateLimit(sessionId) {
    const lastTime = this.lastMessageTime.get(sessionId) || 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < MIN_MESSAGE_INTERVAL_MS) {
      const waitTime = MIN_MESSAGE_INTERVAL_MS - elapsed;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    this.lastMessageTime.set(sessionId, Date.now());
  }

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-RECONEXÃO PARA ENVIO: Reconecta sessão usando RemoteAuth
  // Se RemoteAuth existe, reconecta sem QR. Se não, retorna null.
  // Garante que só 1 reconexão por sessão aconteça ao mesmo tempo.
  // ═══════════════════════════════════════════════════════════════════
  async autoReconnectForSend(sessionId) {
    const existingReconnect = this.reconnectPromises.get(sessionId);
    if (existingReconnect) {
      console.log(`⏳ [${sessionId}] Reconexão já em andamento, aguardando promise existente...`);
      return await existingReconnect;
    }

    const reconnectPromise = this._autoReconnectForSend(sessionId);
    this.reconnectPromises.set(sessionId, reconnectPromise);

    try {
      return await reconnectPromise;
    } finally {
      if (this.reconnectPromises.get(sessionId) === reconnectPromise) {
        this.reconnectPromises.delete(sessionId);
      }
    }
  }

  async _autoReconnectForSend(sessionId) {
    // Se já está reconectando, espera a reconexão existente
    if (this.reconnectingSet.has(sessionId)) {
      console.log(`⏳ [${sessionId}] Reconexão já em andamento, aguardando...`);
      return await this.waitForSessionReady(sessionId, AUTO_RECONNECT_TIMEOUT_MS);
    }

    // Verificar se sessão existe no banco
    const dbSession = await this.db.getSession(sessionId);
    if (!dbSession) {
      console.log(`❌ [${sessionId}] Sessão não existe no banco`);
      return null;
    }

    // Verificar se RemoteAuth tem dados salvos
    if (!this.pgStore || !this.useRemoteAuth) {
      console.log(`❌ [${sessionId}] RemoteAuth não disponível — QR necessário`);
      return null;
    }

    const authSessionId = `RemoteAuth-${sessionId}`;
    let hasAuth = false;
    try {
      hasAuth = await this.pgStore.sessionExists({ session: authSessionId });
    } catch (e) {
      console.warn(`⚠️ Erro ao verificar RemoteAuth: ${e.message}`);
    }

    if (!hasAuth) {
      console.log(`❌ [${sessionId}] Sem RemoteAuth salvo — QR necessário`);
      return null;
    }

    // Marcar como reconectando (evita múltiplas reconexões paralelas)
    if (dbSession.status === 'auth_failure') {
      console.log(`[${sessionId}] Retestando RemoteAuth valido mesmo apos auth_failure anterior.`);
      await this.db.updateSessionStatus(sessionId, 'authenticated');
    }

    this.reconnectingSet.add(sessionId);
    console.log(`🔄 [${sessionId}] Iniciando auto-reconexão via RemoteAuth...`);

    try {
      // Verificar espaço para Chromium
      let activeCount = this.getActiveChromiumCount();
      if (activeCount >= MAX_CONCURRENT_SESSIONS) {
        console.log(`⚠️ [${sessionId}] Limite atingido (${activeCount}/${MAX_CONCURRENT_SESSIONS}). Evicting sessão ociosa...`);
        const evicted = await this.evictOldestIdleSession(sessionId);
        if (!evicted) {
          await this.forceCleanupDeadSessions();
        }
        activeCount = this.getActiveChromiumCount();
        if (activeCount >= MAX_CONCURRENT_SESSIONS) {
          console.error(`❌ [${sessionId}] Sem espaço para reconexão`);
          return null;
        }
      }

      // Criar sessão (RemoteAuth vai restaurar sem QR)
      await this.createSession(sessionId, dbSession.user_id);

      // Aguardar sessão ficar pronta (max 90s)
      const readySession = await this.waitForSessionReady(sessionId, AUTO_RECONNECT_TIMEOUT_MS);

      if (readySession) {
        console.log(`✅ [${sessionId}] Auto-reconexão bem-sucedida! Sessão pronta para enviar.`);
      } else {
        console.error(`❌ [${sessionId}] Auto-reconexão falhou — timeout ou erro`);
      }

      return readySession;
    } catch (error) {
      console.error(`❌ [${sessionId}] Erro na auto-reconexão: ${error.message}`);
      return null;
    } finally {
      this.reconnectingSet.delete(sessionId);
    }
  }

  // Espera uma sessão ficar pronta (connected = evento 'ready' disparou) ou falhar
  // IMPORTANTE: NÃO retornar em 'authenticated' — nesse estado o client WhatsApp
  // ainda está carregando e NÃO tem getChat/sendMessage disponíveis.
  // Retornar em 'authenticated' causa "Cannot read properties of undefined (reading 'getChat')"
  async waitForSessionReady(sessionId, maxWaitMs) {
    const startTime = Date.now();
    const pollInterval = 2000; // checa a cada 2s

    while (Date.now() - startTime < maxWaitMs) {
      const session = this.sessions.get(sessionId);
      if (session) {
        // SÓ retorna quando 'connected' (evento 'ready' disparou)
        // 'authenticated' NÃO é suficiente — client ainda carregando
        if (session.status === 'connected') {
          return session;
        }
        // Estados terminais — não vai recuperar
        if (session.status === 'failed' || session.status === 'auth_failure' || session.status === 'qr_code') {
          return null;
        }
        // 'authenticated' = progredindo, continua aguardando 'ready'
      }
      const initFailure = this.sessionInitFailures.get(sessionId);
      if (initFailure) {
        if (Date.now() - initFailure.timestamp < maxWaitMs) {
          console.warn(`[${sessionId}] Falha de inicializacao detectada durante espera: ${initFailure.message}`);
          return null;
        }
        this.sessionInitFailures.delete(sessionId);
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.warn(`⏰ [${sessionId}] Timeout aguardando sessão ficar pronta (${maxWaitMs / 1000}s)`);
    return null;
  }

  getAckStatus(ack) {
    const statusMap = {
      [-1]: 'failed',
      0: 'pending',
      1: 'sent',
      2: 'delivered',
      3: 'read',
      4: 'played'
    };
    return statusMap[ack] || 'unknown';
  }

  waitForMessageAck(messageId, timeoutMs = MESSAGE_ACK_TIMEOUT_MS, minAck = MESSAGE_CONFIRM_ACK) {
    if (!messageId) {
      return Promise.resolve({
        confirmed: false,
        ack: null,
        status: 'unknown',
        timedOut: true
      });
    }

    const cached = this.messageAckCache.get(messageId);
    if (cached && (cached.ack >= minAck || cached.ack === -1)) {
      return Promise.resolve({
        confirmed: cached.ack >= minAck,
        ack: cached.ack,
        status: cached.status,
        timedOut: false
      });
    }

    const now = Date.now();
    for (const [cachedId, data] of this.messageAckCache.entries()) {
      if (now - data.timestamp > 5 * 60 * 1000) {
        this.messageAckCache.delete(cachedId);
      }
    }

    return new Promise(resolve => {
      const timeout = setTimeout(() => {
        this.messageAckWaiters.delete(messageId);
        const latest = this.messageAckCache.get(messageId);
        resolve({
          confirmed: false,
          ack: latest?.ack ?? null,
          status: latest?.status || 'pending',
          timedOut: true
        });
      }, timeoutMs);

      this.messageAckWaiters.set(messageId, {
        minAck,
        timeout,
        resolve
      });
    });
  }

  // Envia uma mensagem com timeout
  async sendMessageWithTimeout(client, chatId, message, mediaUrl, timeoutMs = MESSAGE_SEND_TIMEOUT_MS) {
    const sendPromise = (async () => {
      if (mediaUrl) {
        const { MessageMedia } = require('whatsapp-web.js');
        const media = await MessageMedia.fromUrl(mediaUrl);
        return await client.sendMessage(chatId, media, { caption: message });
      } else {
        return await client.sendMessage(chatId, message);
      }
    })();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout: mensagem não enviada em ' + (timeoutMs / 1000) + 's')), timeoutMs)
    );

    return await Promise.race([sendPromise, timeoutPromise]);
  }

  async sendMessage(sessionId, phoneNumber, message, mediaUrl = null) {
    const previousSend = this.sessionSendLock.get(sessionId) || Promise.resolve();
    const currentSend = previousSend
      .catch(() => {})
      .then(() => this._sendMessageUnlocked(sessionId, phoneNumber, message, mediaUrl));

    this.sessionSendLock.set(sessionId, currentSend);

    try {
      return await currentSend;
    } finally {
      if (this.sessionSendLock.get(sessionId) === currentSend) {
        this.sessionSendLock.delete(sessionId);
      }
    }
  }

  async _sendMessageUnlocked(sessionId, phoneNumber, message, mediaUrl = null) {
    this.touchSession(sessionId);
    let session = this.sessions.get(sessionId);

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-RECONEXÃO: Se sessão desconectada, tenta reconectar via RemoteAuth
    // Isso permite que ProspectFlow envie sem o usuário ter que escanear QR
    // ═══════════════════════════════════════════════════════════════════
    // AUTO-RECONEXÃO: 'connected' = evento 'ready' disparou, client totalmente funcional
    // 'authenticated' NÃO é suficiente — client carregando, getChat/sendMessage não existem
    const needsReconnect = !session ||
                           !session.client ||
                           session.status !== 'connected';

    if (needsReconnect) {
      console.log(`🔄 [${sessionId}] Sessão não está pronta (status: ${session?.status || 'não na memória'}). Tentando auto-reconexão...`);
      session = await this.autoReconnectForSend(sessionId);
      if (!session) {
        throw new Error('Sessão desconectada e reconexão automática falhou. Escaneie o QR code novamente.');
      }
    }

    this.touchSession(sessionId);
    let client = session.client;

    // ═══════════════════════════════════════════════════════════════════
    // VERIFICAÇÃO LEVE: Exige status 'connected' (evento 'ready' disparou)
    // NÃO aceita 'authenticated' — client ainda carregando, getChat undefined
    // ═══════════════════════════════════════════════════════════════════
    if (session.status !== 'connected') {
      console.error(`❌ [${sessionId}] Status em memória: ${session.status} — não pode enviar (precisa de 'connected')`);
      throw new Error(`Sessão não está conectada. Status: ${session.status}. Reconecte o WhatsApp.`);
    }

    const staleForMs = Date.now() - (session.lastSeen || 0);
    if (staleForMs > STALE_SESSION_HEALTHCHECK_MS) {
      const alive = await this.isSessionAlive(sessionId);
      if (!alive) {
        console.warn(`⚠️ [${sessionId}] Sessão marcada como connected, mas Chromium não respondeu. Reconectando antes do envio...`);
        await this.cleanupSession(sessionId);
        await this.db.updateSessionStatus(sessionId, await this.hasSavedRemoteAuth(sessionId) ? 'saved_auth' : 'disconnected');
        session = await this.autoReconnectForSend(sessionId);
        if (!session || !session.client || session.status !== 'connected') {
          throw new Error('Sessão conectada no banco, mas o Chromium não respondeu e a reconexão falhou. Tente novamente em 1 minuto.');
        }
        this.touchSession(sessionId);
        client = session.client;
      }
    }

    const phoneVariants = this.getPhoneVariants(phoneNumber);
    let normalizedPhone = phoneVariants[0];
    let chatId = normalizedPhone.includes('@c.us') ? normalizedPhone : `${normalizedPhone}@c.us`;
    let numberWasVerifiedBeforeSend = false;

    try {
      let numberId = null;
      for (const candidatePhone of phoneVariants) {
        numberId = await client.getNumberId(candidatePhone);
        if (numberId) {
          normalizedPhone = candidatePhone;
          chatId = numberId._serialized || (normalizedPhone.includes('@c.us') ? normalizedPhone : `${normalizedPhone}@c.us`);
          numberWasVerifiedBeforeSend = true;
          break;
        }
      }

      if (!numberId) {
        console.warn(`ðŸ“µ [${sessionId}] NÃºmero ${phoneVariants[0]} nÃ£o registrado no WhatsApp antes do envio`);
        return {
          success: false,
          confirmed: false,
          invalidNumber: true,
          skipped: true,
          status: 'invalid_number',
          error: `NÃºmero ${phoneVariants[0]} nÃ£o estÃ¡ registrado no WhatsApp.`,
          sessionId: sessionId,
          contactPhone: phoneVariants[0],
          body: message,
          fromMe: true,
          timestamp: Math.floor(Date.now() / 1000)
        };
      }
    } catch (validationErr) {
      console.warn(`âš ï¸ [${sessionId}] NÃ£o foi possÃ­vel validar ${normalizedPhone} antes do envio: ${validationErr.message}`);
    }

    // HealthGuard: detecta disparos em massa (>5 msgs em 30s = disparo)
    if (this.healthGuard) {
      if (!this._dispatchCounter) this._dispatchCounter = { count: 0, windowStart: Date.now() };
      this._dispatchCounter.count++;
      const elapsed = Date.now() - this._dispatchCounter.windowStart;
      if (elapsed > 30000) {
        if (this._dispatchCounter.count > 5 && !this.healthGuard._dispatchActive) {
          this.healthGuard.notifyDispatchStart();
        }
        this._dispatchCounter = { count: 0, windowStart: Date.now() };
      } else if (this._dispatchCounter.count > 5 && !this.healthGuard._dispatchActive) {
        this.healthGuard.notifyDispatchStart();
      }
      // Auto-reset: se disparo ativo e 5 min sem mensagem, finaliza
      if (this._dispatchEndTimer) clearTimeout(this._dispatchEndTimer);
      this._dispatchEndTimer = setTimeout(() => {
        if (this.healthGuard && this.healthGuard._dispatchActive) {
          this.healthGuard.notifyDispatchEnd();
        }
      }, 5 * 60 * 1000);
    }

    // Rate limiting: espera intervalo mínimo entre mensagens
    await this.waitForRateLimit(sessionId);

    console.log(`📞 [${sessionId}] Enviando para: ${phoneNumber} → ${normalizedPhone}`);

    // ═══════════════════════════════════════════════════════════════════
    // ENVIO RESILIENTE — 1 tentativa + auto-reconexão + retry se fatal
    // Se o Chromium crash durante envio, reconecta automaticamente e
    // retenta UMA vez. Isso evita que o ProspectFlow mostre erros
    // "amadores" ao usuário quando a sessão tem um glitch temporário.
    // ═══════════════════════════════════════════════════════════════════
    const attemptSend = async (currentClient, isRetry = false, isLidRetry = false) => {
      try {
        const sentMessage = await this.sendMessageWithTimeout(currentClient, chatId, message, mediaUrl);
        const sentMessageId = sentMessage?.id?._serialized;
        console.log(`[${sessionId}] WhatsApp Web criou mensagem${isRetry ? ' (após reconexão)' : isLidRetry ? ' (após retry LID)' : ''}. Aguardando ACK do WhatsApp... ID: ${sentMessageId || 'N/A'}`);

        const ackResult = await this.waitForMessageAck(sentMessageId);
        if (!ackResult.confirmed) {
          console.warn(`[${sessionId}] Envio para ${normalizedPhone} sem ACK confirmado (${ackResult.status}, ack=${ackResult.ack ?? 'none'}). Mantendo pendente para evitar falso enviado.`);

          await this.cachedUpsertContact(sessionId, normalizedPhone);
          session.lastSeen = Date.now();
          this.sessionLastActivity.set(sessionId, Date.now());

          return {
            id: sentMessageId,
            messageId: sentMessageId,
            attemptId: sentMessageId || `unconfirmed_${sessionId}_${normalizedPhone}_${Date.now()}`,
            success: false,
            confirmed: false,
            invalidNumber: false,
            unconfirmed: true,
            ack: ackResult.ack,
            ackStatus: ackResult.status,
            ackTimedOut: ackResult.timedOut,
            sessionId: sessionId,
            contactPhone: normalizedPhone,
            to: normalizedPhone,
            phone: normalizedPhone,
            messageType: sentMessage?.type || (mediaUrl ? 'media' : 'chat'),
            body: message,
            mediaUrl: mediaUrl,
            mediaMimetype: null,
            fromMe: true,
            timestamp: sentMessage?.timestamp || Math.floor(Date.now() / 1000),
            status: 'pending',
            note: 'WhatsApp Web criou a mensagem, mas o WhatsApp nao confirmou o envio via ACK. Mantido pendente para evitar falso enviado.'
          };
        }

        console.log(`[${sessionId}] ACK confirmado para ${normalizedPhone}: ${ackResult.status} (ack=${ackResult.ack})`);

        const messageData = {
          id: sentMessageId,
          messageId: sentMessageId,
          success: true,
          confirmed: true,
          invalidNumber: false,
          unconfirmed: false,
          ack: ackResult.ack,
          ackStatus: ackResult.status,
          sessionId: sessionId,
          contactPhone: normalizedPhone,
          to: normalizedPhone,
          phone: normalizedPhone,
          messageType: sentMessage.type,
          body: message,
          mediaUrl: mediaUrl,
          mediaMimetype: null,
          fromMe: true,
          timestamp: sentMessage.timestamp,
          status: 'sent'
        };

        await this.cachedUpsertContact(sessionId, normalizedPhone);
        session.lastSeen = Date.now();
        this.sessionLastActivity.set(sessionId, Date.now());
        this.emitMessageSent(session, messageData);

        return messageData;
      } catch (error) {
        const errMsg = error.message || '';
        if (numberWasVerifiedBeforeSend && this.isFatalSessionError(error) && !isRetry) {
          console.warn(`[${sessionId}] Erro fatal apos tentativa para numero ja validado (${normalizedPhone}); sem reenvio para evitar duplicidade`);
          setImmediate(async () => {
            try {
              await this.cleanupSession(sessionId);
              await this.db.updateSessionStatus(sessionId, await this.hasSavedRemoteAuth(sessionId) ? 'saved_auth' : 'disconnected');
              await this.autoReconnectForSend(sessionId);
            } catch (reconnectErr) {
              console.error(`Erro no reconnect em background apos envio ambiguo ${sessionId}: ${reconnectErr.message}`);
            }
          });

          await this.cachedUpsertContact(sessionId, normalizedPhone);
          session.lastSeen = Date.now();
          this.sessionLastActivity.set(sessionId, Date.now());

          const messageData = {
            attemptId: `unconfirmed_${sessionId}_${normalizedPhone}_${Date.now()}`,
            success: false,
            confirmed: false,
            invalidNumber: false,
            unconfirmed: true,
            sessionId: sessionId,
            contactPhone: normalizedPhone,
            to: normalizedPhone,
            phone: normalizedPhone,
            messageType: mediaUrl ? 'media' : 'chat',
            body: message,
            mediaUrl: mediaUrl,
            mediaMimetype: null,
            fromMe: true,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'pending',
            note: 'Numero validado antes do envio, mas o WhatsApp nao confirmou entrega. Mantido pendente para evitar falso enviado e evitar duplicidade.'
          };

          return messageData;
        }
        if (!this.isIgnorableWhatsAppError(error)) {
          this.logRecentError(sessionId, error);
        }
        console.error(`❌ [${sessionId}] Erro envio para ${normalizedPhone}${isRetry ? ' (retry)' : isLidRetry ? ' (retry LID)' : ''}:`, errMsg);

        // ═══════════════════════════════════════════════════════════════
        // TRATAMENTO "No LID for user" — Bug conhecido do whatsapp-web.js
        // O WhatsApp Web às vezes não resolve o LID interno de um contato.
        // É transiente na maioria dos casos. Solução:
        // 1. Validar número com getNumberId() (confirma que existe no WhatsApp)
        // 2. Nao reenviar: a primeira tentativa pode ja ter sido entregue
        //    mesmo quando o WhatsApp Web retorna erro de confirmacao.
        // Se getNumberId() retorna null → número não existe no WhatsApp
        // ═══════════════════════════════════════════════════════════════
        if ((errMsg.includes('No LID for user') || errMsg.includes("reading 'isBot'")) && !isLidRetry) {
          let hadRegisteredVariant = false;
          console.warn(`🔄 [${sessionId}] Erro de resolução WhatsApp para ${normalizedPhone} — validando número sem reenviar...`);
          try {
            // Valida se o número realmente existe no WhatsApp
            let numberId = null;
            let resolvedPhone = normalizedPhone;
            for (const candidatePhone of phoneVariants) {
              numberId = await currentClient.getNumberId(candidatePhone);
              if (numberId) {
                resolvedPhone = candidatePhone;
                break;
              }
            }
            hadRegisteredVariant = !!numberId;
            if (!numberId) {
              console.warn(`📵 [${sessionId}] Número ${normalizedPhone} NÃO existe no WhatsApp (getNumberId=null)`);
              throw new Error(`Número ${normalizedPhone} não está registrado no WhatsApp.`);
            }
            // Se chegou aqui, a primeira tentativa pode ja ter sido entregue.
            // Nao reenviar: isso gerava mensagens duplicadas quando o WA Web
            // retornava erro de confirmacao apos entregar a mensagem.
            console.warn(`[${sessionId}] Numero ${resolvedPhone} confirmado (${numberId._serialized}); sem confirmacao de envio, mantendo pendente`);

            const messageData = {
              attemptId: `unconfirmed_${sessionId}_${resolvedPhone}_${Date.now()}`,
              success: false,
              confirmed: false,
              invalidNumber: false,
              unconfirmed: true,
              sessionId: sessionId,
              contactPhone: resolvedPhone,
              to: resolvedPhone,
              phone: resolvedPhone,
              messageType: mediaUrl ? 'media' : 'chat',
              body: message,
              mediaUrl: mediaUrl,
              mediaMimetype: null,
              fromMe: true,
              timestamp: Math.floor(Date.now() / 1000),
              status: 'pending',
              note: 'WhatsApp confirmou que o numero existe, mas nao confirmou o envio. Mantido pendente sem reenvio imediato.'
            };

            await this.cachedUpsertContact(sessionId, resolvedPhone);
            session.lastSeen = Date.now();
            this.sessionLastActivity.set(sessionId, Date.now());
            return messageData;
          } catch (lidRetryErr) {
            console.error(`❌ [${sessionId}] Retry LID falhou para ${normalizedPhone}: ${lidRetryErr.message}`);
            // NÃO fazer throw direto aqui! Isso bypassaria toda a lógica de proteção
            // (invalid number, timeout, fatal error handling) abaixo.
            // Em vez disso, tratamos como erro de número — pula o contato sem derrubar sessão.
            const lidErrMsg = (lidRetryErr.message || '').toLowerCase();
            if (lidErrMsg.includes('target closed') || lidErrMsg.includes('session closed') ||
                lidErrMsg.includes('protocol error') || lidErrMsg.includes('context was destroyed')) {
              // Chromium morreu durante o LID retry — NÃO propagar diretamente.
              // Deixar cair no handler fatal abaixo para reconexão limpa.
              console.error(`💀 [${sessionId}] Chromium morreu durante LID retry — delegando para handler fatal`);
              // Atualiza errMsg para que o handler fatal abaixo funcione corretamente
              error = lidRetryErr;
            } else {
              if (hadRegisteredVariant) {
                console.warn(`[${sessionId}] LID retry falhou para numero confirmado ${normalizedPhone}; mantendo contato sem marcar como invalido`);
                const messageData = {
                  attemptId: `unconfirmed_${sessionId}_${normalizedPhone}_${Date.now()}`,
                  success: false,
                  confirmed: false,
                  invalidNumber: false,
                  unconfirmed: true,
                  status: 'pending',
                  note: `WhatsApp confirmou que ${normalizedPhone} existe, mas nao retornou confirmacao final do envio. Mantido pendente para evitar falso enviado.`,
                  sessionId: sessionId,
                  contactPhone: normalizedPhone,
                  to: normalizedPhone,
                  phone: normalizedPhone,
                  body: message,
                  fromMe: true,
                  timestamp: Math.floor(Date.now() / 1000)
                };
                return messageData;
              }
              // Erro ambiguo: nao marcar como invalido quando a validacao
              // nao foi conclusiva. O frontend deve manter pendente/retry.
              console.warn(`[${sessionId}] LID retry sem confirmacao para ${normalizedPhone}; mantendo pendente para evitar falso invalido`);
              throw new Error(`Envio nao confirmado pelo WhatsApp para ${normalizedPhone}. Manter pendente e tentar novamente mais tarde.`);
            }
          }
        }

        // Recalcular errMsg caso tenha sido atualizado pelo LID retry handler
        const currentErrMsg = error.message || '';

        // ═══════════════════════════════════════════════════════════════
        // TRATAMENTO DE NÚMERO INVÁLIDO — NUNCA derrubar sessão por isso
        // Erros de número inválido são do número, NÃO do Chromium.
        // Devem ser propagados como erro simples sem reconexão.
        // ═══════════════════════════════════════════════════════════════
        const errLower = currentErrMsg.toLowerCase();
        const isInvalidNumberError = [
          'invalid wid',
          'wid error',
          'invalid number',
          'não está registrado',
          'not registered',
          'invalid phone',
          'invalid chatid',
        ].some(p => errLower.includes(p));

        if (isInvalidNumberError) {
          console.warn(`📵 [${sessionId}] Número inválido/inexistente ${normalizedPhone}: ${errMsg.substring(0, 100)} — NÃO é erro do Chromium`);
          return {
            success: false,
            confirmed: false,
            invalidNumber: true,
            skipped: true,
            status: 'invalid_number',
            error: currentErrMsg,
            sessionId: sessionId,
            contactPhone: normalizedPhone,
            body: message,
            fromMe: true,
            timestamp: Math.floor(Date.now() / 1000)
          };
        }

        // ═══════════════════════════════════════════════════════════════
        // TRATAMENTO DE TIMEOUT — Chromium pode estar morto
        // Quando client.sendMessage() trava e dá timeout, verificamos se
        // o Chromium ainda está vivo. Se morreu, tratamos como fatal.
        // Usa flag chromiumDead para evitar problemas de escopo com error
        // ═══════════════════════════════════════════════════════════════
        let chromiumDead = false;
        if (errLower.includes('timeout') && !isRetry) {
          console.warn(`⏰ [${sessionId}] Timeout no envio — verificando saúde do Chromium...`);
          try {
            const alive = await this.isSessionAlive(sessionId);
            if (!alive) {
              console.error(`🧟 [${sessionId}] Chromium MORTO detectado após timeout! Marcando para reconexão...`);
              chromiumDead = true;
            } else {
              console.log(`✅ [${sessionId}] Chromium vivo — timeout foi do número/rede, não do Chromium`);
              throw error;
            }
          } catch (healthErr) {
            if (healthErr === error) throw healthErr;
            if (healthErr.message && healthErr.message.includes('health_check_timeout')) {
              console.error(`🧟 [${sessionId}] Health check timeout = Chromium morto! Marcando para reconexão...`);
              chromiumDead = true;
            } else {
              console.warn(`⚠️ [${sessionId}] Erro no health check: ${healthErr.message} — mantendo erro original`);
              throw error;
            }
          }
        }

        // ═══════════════════════════════════════════════════════════════
        // ANTES de tratar como fatal, verificar se é erro "inofensivo"
        // que NÃO deve desconectar a sessão (número inválido, permissão, etc.)
        // ═══════════════════════════════════════════════════════════════
        const isNonFatalSendError = [
          'could not send message',
          'message send timeout',
          'media upload failed',
          'not authorized',
          'message too long',
          'blocked',
          'permission denied to send',
        ].some(p => errLower.includes(p));

        if (isNonFatalSendError && !chromiumDead) {
          console.warn(`⚠️ [${sessionId}] Erro de envio não-fatal para ${normalizedPhone}: ${errMsg.substring(0, 100)} — sessão mantida`);
          throw error; // Propaga sem derrubar sessão
        }

        // Se e um erro fatal do Chromium E ainda nao tentamos reconectar
        if ((this.isFatalSessionError(error) || chromiumDead) && !isRetry) {
          console.warn(`[${sessionId}] Erro fatal/ambíguo durante envio; sem reenvio automatico para evitar duplicidade.`);

          setImmediate(async () => {
            try {
              await this.cleanupSession(sessionId);
              await this.db.updateSessionStatus(sessionId, await this.hasSavedRemoteAuth(sessionId) ? 'saved_auth' : 'disconnected');
              await this.autoReconnectForSend(sessionId);
            } catch (reconErr) {
              console.error(`Erro no reconnect em background apos envio ambiguo ${sessionId}: ${reconErr.message}`);
            }
          });

          this.io.to(`user_${session.userId}`).emit('session_disconnected', {
            sessionId: sessionId,
            reason: 'CHROMIUM_CRASH'
          });

          await this.cachedUpsertContact(sessionId, normalizedPhone);
          session.lastSeen = Date.now();
          this.sessionLastActivity.set(sessionId, Date.now());

          return {
            attemptId: `unconfirmed_${sessionId}_${normalizedPhone}_${Date.now()}`,
            success: false,
            confirmed: false,
            invalidNumber: false,
            unconfirmed: true,
            sessionId: sessionId,
            contactPhone: normalizedPhone,
            to: normalizedPhone,
            phone: normalizedPhone,
            messageType: mediaUrl ? 'media' : 'chat',
            body: message,
            mediaUrl: mediaUrl,
            mediaMimetype: null,
            fromMe: true,
            timestamp: Math.floor(Date.now() / 1000),
            status: 'pending',
            note: 'WhatsApp Web caiu durante a tentativa. Reconnect iniciado em background e mensagem mantida pendente sem reenvio automatico.'
          };
        }

        // Se é retry e falhou de novo, ou erro não-fatal — lança direto
        throw error;
      }
    };

    return await attemptSend(client);
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
          message: 'Sessão desconectada. Clique em "Criar Sessão" para reconectar.',
          info: dbSession.phone_number ? { wid: dbSession.phone_number, pushname: dbSession.phone_name } : null
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

  getRecentErrors(limit = 10) {
    return this.recentErrors.slice(-limit).map(e => ({
      sessionId: e.sessionId,
      message: e.message,
      timestamp: new Date(e.timestamp).toISOString(),
      age: `${Math.round((Date.now() - e.timestamp) / 1000)}s ago`
    }));
  }

  async healthCheck() {
    const memUsage = process.memoryUsage();
    const health = {
      totalSessions: this.sessions.size,
      connectedSessions: 0,
      disconnectedSessions: 0,
      activeChromiums: this.getActiveChromiumCount(),
      authStrategy: this.useRemoteAuth ? 'RemoteAuth (PostgreSQL)' : (REQUIRE_REMOTE_AUTH ? 'RemoteAuth indisponivel (LocalAuth bloqueado)' : 'LocalAuth'),
      remoteAuthError: this.remoteAuthInitError?.message || null,
      maxConcurrent: MAX_CONCURRENT_SESSIONS,
      maxActiveQrSessions: MAX_ACTIVE_QR_SESSIONS,
      activeQrWithoutSavedAuth: this.getActiveQrWithoutSavedAuthCount(),
      qrNoAuthMinKeepaliveMs: QR_NO_AUTH_MIN_KEEPALIVE_MS,
      idleDisconnectMs: IDLE_DISCONNECT_MS,
      recentErrors: this.getRecentErrors(5),
      memory: {
        heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`
      },
      sessions: []
    };

    const sessionPromises = [];
    this.sessions.forEach((session, id) => {
      if (session.status === 'connected') {
        health.connectedSessions++;
      } else {
        health.disconnectedSessions++;
      }

      // Tenta obter o estado REAL do WhatsApp
      const sessionInfo = {
        id: session.id,
        status: session.status,
        lastSeen: session.lastSeen,
        timeSinceLastSeen: Date.now() - session.lastSeen,
        whatsappState: 'unknown'
      };

      // getState() evaluates in Puppeteer. Avoid it while WhatsApp is navigating
      // through initialization or QR flow.
      if (session.client && session.status === 'connected') {
        sessionPromises.push(
          Promise.race([
            session.client.getState(),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
          ])
          .then(state => { sessionInfo.whatsappState = state || 'null'; })
          .catch(e => { sessionInfo.whatsappState = `error: ${e.message.substring(0, 50)}`; })
          .then(() => sessionInfo)
        );
      } else {
        sessionInfo.whatsappState = session.client ? `session_${session.status}` : 'no_client';
        sessionPromises.push(Promise.resolve(sessionInfo));
      }
    });

    const resolvedSessions = await Promise.all(sessionPromises);
    health.sessions = resolvedSessions;

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

    const normalizedPhone = this.normalizePhoneNumber(to);
    const chatId = normalizedPhone.includes('@c.us') ? normalizedPhone : `${normalizedPhone}@c.us`;

    // Usa o mesmo timeout do sendMessage para consistência
    const result = await this.sendMessageWithTimeout(session.client, chatId, caption, mediaUrl);
    const messageId = result?.id?._serialized;
    const ackResult = await this.waitForMessageAck(messageId);

    session.lastSeen = Date.now();
    this.sessionLastActivity.set(sessionId, Date.now());

    return {
      success: ackResult.confirmed,
      confirmed: ackResult.confirmed,
      unconfirmed: !ackResult.confirmed,
      status: ackResult.confirmed ? 'sent' : 'pending',
      ack: ackResult.ack,
      ackStatus: ackResult.status,
      messageId,
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
  // - Sessões connected/authenticated IDLE: DESCONECTA após IDLE_DISCONNECT_MS (5h)
  // ═══════════════════════════════════════════════════════════════════
  startAutoCleanup() {
    console.log(`🔄 Auto-limpeza inteligente iniciada (verifica a cada ${CLEANUP_INTERVAL_MS / 1000}s)`);
    console.log(`   - QR Code timeout: ${QR_CODE_TIMEOUT_MS / 1000}s`);
    console.log(`   - Idle disconnect: ${IDLE_DISCONNECT_MS > 0 ? `${IDLE_DISCONNECT_MS / 1000}s` : 'desabilitado'}`);

    setInterval(async () => {
      const now = Date.now();
      const toDestroy = [];
      const toDisconnect = [];
      const noAuthQrSessions = [];

      for (const [sid, lastTs] of this.sessionLastActivity.entries()) {
        const sess = this.sessions.get(sid);
        if (!sess) {
          this.sessionLastActivity.delete(sid);
          this.qrGeneratedAt.delete(sid);
          continue;
        }

        // Sessões connected/authenticated IDLE → desconecta para liberar Chromium
        if ((sess.status === 'connected' || sess.status === 'authenticated') && sess.client) {
          const idleTime = now - lastTs;
          if (IDLE_DISCONNECT_MS > 0 && idleTime > IDLE_DISCONNECT_MS) {
            if (this.shouldPreserveLiveSession(sid)) {
              this.touchSession(sid);
              console.log(`Auto-hibernate ignorada: "${sid}" esta ocupada/em recuperacao.`);
              continue;
            }
            toDisconnect.push({ sid, idleTime });
          }
          continue;
        }

        // QR sem RemoteAuth precisa ficar vivo para o usuario escanear.
        // A protecao de carga acontece por limite de QRs ativos, nao por timeout simples.
        if (sess.status === 'qr_code') {
          const qrTs = this.qrGeneratedAt.get(sid) || sess.qrGeneratedAt || lastTs;
          const qrAgeMs = now - qrTs;

          if (this.isQrWithoutSavedAuth(sess)) {
            noAuthQrSessions.push({ sid, qrTs, qrAgeMs });
            continue;
          }

          if (qrAgeMs > QR_CODE_TIMEOUT_MS) {
            toDestroy.push({ sid, reason: `QR expirado (${Math.round(qrAgeMs / 1000)}s)` });
          }
          continue;
        }

        // Sessões inicializando: permite até SESSION_INIT_TIMEOUT_MS + margem
        if (sess.status === 'initializing' && (now - lastTs) > (SESSION_INIT_TIMEOUT_MS + 30000)) {
          if (this.isSessionBusy(sid)) {
            this.touchSession(sid);
            continue;
          }
          toDestroy.push({ sid, reason: `Inicialização travada (${Math.round((now - lastTs) / 1000)}s)` });
          continue;
        }

        // Sessões mortas (failed, disconnected, etc): remove após 10 minutos
        if (['failed', 'disconnected', 'auth_failure'].includes(sess.status) && (now - lastTs) > 10 * 60 * 1000) {
          toDestroy.push({ sid, reason: `Inativa ${Math.round((now - lastTs) / 1000)}s (${sess.status})` });
          continue;
        }
      }

      noAuthQrSessions
        .sort((a, b) => a.qrTs - b.qrTs)
        .slice(0, Math.max(0, noAuthQrSessions.length - MAX_ACTIVE_QR_SESSIONS))
        .forEach(({ sid, qrAgeMs }) => {
          if (qrAgeMs >= QR_NO_AUTH_MIN_KEEPALIVE_MS) {
            toDestroy.push({ sid, reason: `limite de QR sem RemoteAuth (${MAX_ACTIVE_QR_SESSIONS})` });
          }
        });

      // Hiberna sessões idle: libera Chromium sem apagar RemoteAuth.
      for (const { sid, idleTime } of toDisconnect) {
        console.log(`Auto-hibernate: "${sid}" — idle por ${Math.round(idleTime / 1000)}s`);
        try {
          await this.disconnectIdleSession(sid);
        } catch (e) {
          console.error(`Erro ao desconectar ${sid}:`, e.message);
        }
      }

      // Limpa sessões mortas
      for (const { sid, reason } of toDestroy) {
        console.log(`🧹 Auto-limpeza: "${sid}" — ${reason}`);
        try {
          const sess = this.sessions.get(sid);
          const hasRemoteAuth = await this.hasSavedRemoteAuth(sid);
          let nextStatus = null;
          if (sess?.status === 'qr_code') {
            nextStatus = sess?.qrFromRejectedAuth
              ? 'auth_failure'
              : (hasRemoteAuth ? 'saved_auth' : 'disconnected');
          } else if (sess?.status === 'initializing' || sess?.status === 'authenticated') {
            nextStatus = hasRemoteAuth ? 'saved_auth' : 'failed';
          } else if (sess?.status === 'auth_failure') {
            nextStatus = 'auth_failure';
          } else if (['failed', 'disconnected'].includes(sess?.status) && hasRemoteAuth) {
            nextStatus = 'saved_auth';
          }
          await this.cleanupSession(sid);
          if (nextStatus) {
            await this.db.updateSessionStatus(sid, nextStatus);
          }
        } catch (e) {
          console.error(`Erro ao auto-limpar ${sid}:`, e.message);
          this.sessions.delete(sid);
          this.sessionLastActivity.delete(sid);
          this.qrGeneratedAt.delete(sid);
        }
      }

      if (toDisconnect.length > 0 || toDestroy.length > 0) {
        console.log(`✅ Auto-cleanup: ${toDisconnect.length} desconectada(s), ${toDestroy.length} removida(s). Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);
      }

      // Monitoramento de memória — GC preventivo e alerta
      const mem = process.memoryUsage();
      const rssMB = Math.round(mem.rss / 1024 / 1024);
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
      if (rssMB > MAX_RSS_MB * 0.8) {
        console.warn(`🟡 Memória — Heap: ${heapMB}MB | RSS: ${rssMB}MB (>${Math.round(MAX_RSS_MB * 0.8)}MB threshold)`);
        if (global.gc) {
          global.gc();
          const afterGC = Math.round(process.memoryUsage().rss / 1024 / 1024);
          console.log(`🔃 GC executado — Heap: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB | RSS: ${afterGC}MB`);
        }
      }
    }, CLEANUP_INTERVAL_MS);
  }
}

module.exports = SessionManager;
