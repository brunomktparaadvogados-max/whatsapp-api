const { Client, LocalAuth, RemoteAuth } = require('whatsapp-web.js');
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
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 6; // Máx 6 Chromiums simultâneos (~1.2GB RAM)
const QR_CODE_TIMEOUT_MS = 5 * 60 * 1000;       // 5 minutos para escanear QR
const IDLE_DISCONNECT_MS = parseInt(process.env.IDLE_DISCONNECT_MS) || 5 * 60 * 60 * 1000; // 5 horas idle → desconecta sessão
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;        // verifica a cada 2 minutos (economiza queries)
const SESSION_INIT_TIMEOUT_MS = 120000;           // 2 minutos para Chromium iniciar
const MESSAGE_SEND_TIMEOUT_MS = 60000;            // 60 segundos timeout por mensagem (1 tentativa única)
const MIN_MESSAGE_INTERVAL_MS = 1500;             // 1.5 segundos entre mensagens (anti-rate-limit)
const MAX_SEND_RETRIES = 0;                       // SEM retries — evita mensagens duplicadas

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
    this.useRemoteAuth = false;             // Flag: usar RemoteAuth ou LocalAuth

    this.init();
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
    } catch (pgStoreError) {
      console.error('⚠️ Falha ao inicializar PostgresStore, usando LocalAuth:', pgStoreError.message);
      this.useRemoteAuth = false;
    }

    console.log('✅ Banco de dados principal: PostgreSQL (Supabase)');
    console.log(`📊 Limite de sessões simultâneas: ${MAX_CONCURRENT_SESSIONS}`);

    if (this.useRemoteAuth) {
      // Com RemoteAuth, tenta restaurar sessões automaticamente
      console.log('🔄 Restaurando sessões salvas do PostgreSQL...');
      await this.restoreSavedSessions();
    } else {
      // Sem RemoteAuth, marca todas como desconectadas
      await this.markAllSessionsDisconnected();
    }

    // Inicia limpeza automática inteligente
    this.startAutoCleanup();
  }

  async restoreSavedSessions() {
    // No startup, marca todas as sessões como desconectadas
    // Não há Chromium rodando, então sessões precisam ser recriadas com QR
    await this.markAllSessionsDisconnected();
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

    if (session.status !== 'connected' && session.status !== 'authenticated') {
      console.log(`⚠️ [${sessionId}] Status ${session.status} — não precisa desconectar`);
      return false;
    }

    console.log(`🔌 [${sessionId}] Desconectando sessão por inatividade...`);

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
    this.lastMessageTime.delete(sessionId);
    this.sessionSendLock.delete(sessionId);

    // Marca como disconnected no banco
    await this.db.updateSessionStatus(sessionId, 'disconnected');

    // Limpa arquivos do disco
    this.cleanupSessionFiles(sessionId);

    // Notifica frontend
    this.io.to(`user_${session.userId}`).emit('session_disconnected', {
      sessionId: sessionId,
      info: session.info,
      message: 'Sessão desconectada por inatividade. Crie uma nova sessão para reconectar.'
    });

    console.log(`🔌 [${sessionId}] Desconectada. Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);
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

    // Limpa dados de auth do RemoteAuth no PostgreSQL para evitar sessão stale
    if (this.pgStore) {
      try {
        const authSessionId = `RemoteAuth-${sessionId}`;
        const exists = await this.pgStore.sessionExists({ session: authSessionId });
        if (exists) {
          console.log(`🗑️ Removendo auth stale do PostgreSQL para ${authSessionId}`);
          await this.pgStore.delete({ session: authSessionId });
        }
      } catch (e) {
        console.warn(`⚠️ Erro ao limpar auth stale: ${e.message}`);
      }
    }

    // Verifica limite de Chromium simultâneos
    const activeCount = this.getActiveChromiumCount();
    if (activeCount >= MAX_CONCURRENT_SESSIONS) {
      console.warn(`⚠️ Limite de ${MAX_CONCURRENT_SESSIONS} sessões Chromium atingido (${activeCount} ativas)`);

      // 1. Tenta desconectar a sessão mais ociosa para liberar slot
      const evicted = await this.evictOldestIdleSession(sessionId);
      if (!evicted) {
        // 2. Tenta limpar sessões mortas
        await this.forceCleanupDeadSessions();
      }

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

    // FIX QR: Limpa arquivos de auth ANTES de criar novo cliente
        // Dados stale do LocalAuth causam "tente novamente mais tarde" no app WhatsApp.
        // Limpar aqui garante que o novo QR Code seja gerado sem conflitos.
        console.log(`Limpando dados de auth anteriores para sessão ${sessionId}...`);
        this.cleanupSessionFiles(sessionId);
    
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

      // Notifica frontend que a inicialização falhou (evita "Inicializando..." eterno)
      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionData.id,
        error: 'Falha ao inicializar sessão. Tente criar novamente.',
        status: 'failed'
      });
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
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-default-apps',
          '--disable-sync',
          '--disable-translate',
          '--hide-scrollbars',
          '--mute-audio',
          '--no-default-browser-check',
          '--disable-software-rasterizer',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-component-update',
          '--js-flags=--max-old-space-size=256',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        ],
        executablePath: actualExecPath,
        timeout: SESSION_INIT_TIMEOUT_MS
      },
      authStrategy: this.useRemoteAuth && this.pgStore
        ? new RemoteAuth({
            clientId: sessionId,
            store: this.pgStore,
            backupSyncIntervalMs: 5 * 60 * 1000 // Salva sessão no PostgreSQL a cada 5 minutos
          })
        : new LocalAuth({
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
        sessionData.status = 'disconnected';
        await this.db.updateSessionStatus(sessionData.id, 'disconnected');

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

      // Safety net: se 'ready' não disparar em 90s após autenticação,
      // marca como failed para o frontend não ficar preso em "Autenticado"
      setTimeout(async () => {
        const currentSession = this.sessions.get(sessionData.id);
        if (currentSession && currentSession.status === 'authenticated') {
          console.warn(`⚠️ [${sessionData.id}] Sessão autenticada há 90s sem ficar 'ready'. Marcando como failed.`);
          currentSession.status = 'failed';
          await this.db.updateSessionStatus(sessionData.id, 'failed');
          this.io.to(`user_${sessionData.userId}`).emit('session_error', {
            sessionId: sessionData.id,
            error: 'WhatsApp autenticou mas não conectou. Delete e crie a sessão novamente.',
            status: 'failed'
          });
          // Limpa o Chromium travado
          await this.cleanupSession(sessionData.id);
        }
      }, 90000);
    });

    // RemoteAuth: sessão salva no PostgreSQL com sucesso
    client.on('remote_session_saved', () => {
      console.log(`💾 [${sessionData.id}] Sessão salva no PostgreSQL — sobrevive a deploys!`);
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
      sessionData.lastSeen = Date.now();
      this.sessionLastActivity.set(sessionData.id, Date.now());

      // Ignorar apenas status@broadcast (atualizações de status)
      if (message.from.includes('status@broadcast')) {
        return;
      }

      // Resolver telefone: suporta @c.us e @lid (Linked ID do WhatsApp)
      let contactPhone = message.from.replace('@c.us', '').replace('@lid', '');
      let whatsappLid = null;

      if (message.from.includes('@lid')) {
        whatsappLid = message.from; // Preserva o LID completo para matching
        try {
          const contact = await message.getContact();
          if (contact && contact.number) {
            contactPhone = contact.number;
            console.log(`🔗 LID resolvido: ${message.from} → ${contactPhone}`);
          } else {
            console.log(`⚠️ LID sem número: ${message.from}, usando ID como fallback`);
          }
        } catch (lidError) {
          console.warn(`⚠️ Erro ao resolver LID ${message.from}: ${lidError.message}`);
        }
      }

      console.log(`📩 Msg recebida - Session: ${sessionData.id}, From: ${contactPhone}${whatsappLid ? ` (LID: ${whatsappLid})` : ''}`);

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
        status: 'received',
        whatsappLid
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
            mediaMimetype: messageData.mediaMimetype,
            whatsappLid: whatsappLid, // Linked ID para matching no wa-webhook
            notifyName: message._data?.notifyName || message._data?.pushname || null
          };

          const webhookController = new AbortController();
          const webhookTimeout = setTimeout(() => webhookController.abort(), 5000);
          const webhookResponse = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(webhookPayload),
            signal: webhookController.signal
          });
          clearTimeout(webhookTimeout);

          const webhookBody = await webhookResponse.text();
          if (!webhookResponse.ok) {
            console.error(`❌ Webhook falhou: ${webhookResponse.status} - ${webhookBody}`);
          } else {
            console.log(`✅ Webhook OK: ${webhookBody.substring(0, 200)}`);
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
        // Suporte a @c.us e @lid
        let contactPhone = message.to.replace('@c.us', '').replace('@lid', '');
        let outLid = null;

        if (message.to.includes('@lid')) {
          outLid = message.to;
          try {
            const contact = await message.getContact();
            if (contact && contact.number) {
              contactPhone = contact.number;
            }
          } catch (e) {
            console.warn(`⚠️ Erro ao resolver LID outgoing: ${e.message}`);
          }
        }

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
          status: 'sent',
          whatsappLid: outLid
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
              userId: sessionData.userId,
              whatsappLid: outLid
            };

            const wc = new AbortController();
            const wt = setTimeout(() => wc.abort(), 5000);
            await fetch(webhookUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(webhookPayload),
              signal: wc.signal
            });
            clearTimeout(wt);
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
      await this.db.updateSessionStatus(sessionId, 'failed');

      // Notifica frontend que todas as tentativas falharam
      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionId,
        error: 'Reconexão falhou após várias tentativas. Delete e crie a sessão novamente.',
        status: 'failed'
      });
      return;
    }

    this.reconnectAttempts.set(sessionId, attempts + 1);
    const delay = Math.min(2000 * Math.pow(2, attempts), 30000); // 2s, 4s, 8s... max 30s

    console.log(`🔄 [${sessionId}] Reconexão completa ${attempts + 1}/${this.maxReconnectAttempts} em ${delay / 1000}s...`);

    setTimeout(async () => {
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
        // Tenta novamente
        await this.attemptFullReconnect(sessionData);
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
      'getIsMyContact',
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
    const fatalPatterns = [
      'execution context was destroyed',
      'session closed',
      'protocol error',
      'target closed',
      'page crashed',
      'browser disconnected',
      'navigation failed',
      'frame was detached',
      'cannot find context',
      'websocket is not open',
      'econnrefused',
      'epipe',
      'browser has disconnected',
      'connection closed',
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
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Sessão não está na memória — precisa criar nova sessão
      throw new Error('Sessão não encontrada. Crie uma nova sessão e escaneie o QR code.');
    }

    // Se sessão existe mas não tem client ativo, precisa reconectar
    if (!session.client) {
      throw new Error('Sessão desconectada. Crie uma nova sessão e escaneie o QR code.');
    }

    if (session.status !== 'connected' && session.status !== 'authenticated') {
      throw new Error(`Sessão não está conectada. Status atual: ${session.status}`);
    }

    if (!session.client) {
      throw new Error('Cliente WhatsApp não disponível. Reconecte a sessão.');
    }

    const client = session.client;

    // ═══════════════════════════════════════════════════════════════════
    // VERIFICAÇÃO REAL: Checa se o WhatsApp Web está REALMENTE conectado
    // O status "authenticated" NÃO garante que mensagens serão entregues.
    // Precisamos que client.getState() retorne "CONNECTED".
    // ═══════════════════════════════════════════════════════════════════
    try {
      const state = await Promise.race([
        client.getState(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('getState_timeout')), 10000))
      ]);
      console.log(`📊 [${sessionId}] Estado real do WhatsApp: ${state}`);

      if (state !== 'CONNECTED') {
        // Se não está CONNECTED, espera até 15s (máximo — preserva timeout para envio)
        console.log(`⏳ [${sessionId}] WhatsApp não está CONNECTED (estado: ${state}). Aguardando...`);
        let waited = 0;
        const waitInterval = 3000;
        const maxWait = 15000;
        while (waited < maxWait) {
          await new Promise(resolve => setTimeout(resolve, waitInterval));
          waited += waitInterval;
          try {
            const newState = await Promise.race([
              client.getState(),
              new Promise((_, rej) => setTimeout(() => rej(new Error('getState_timeout')), 8000))
            ]);
            console.log(`📊 [${sessionId}] Estado após ${waited / 1000}s: ${newState}`);
            if (newState === 'CONNECTED') {
              session.status = 'connected';
              break;
            }
          } catch (e) {
            if (!this.isIgnorableWhatsAppError(e)) {
              console.error(`❌ [${sessionId}] Erro ao verificar estado: ${e.message}`);
              break;
            }
          }
        }

        // Verifica uma última vez
        const finalState = await Promise.race([
          client.getState(),
          new Promise((_, rej) => setTimeout(() => rej(new Error('getState_timeout')), 8000))
        ]).catch(() => null);

        if (finalState !== 'CONNECTED') {
          console.error(`❌ [${sessionId}] WhatsApp NÃO está CONNECTED após espera. Estado: ${finalState}`);
          throw new Error(`WhatsApp não está pronto para enviar. Estado: ${finalState}. Reconecte a sessão.`);
        }
        session.status = 'connected';
      }
    } catch (stateError) {
      if (this.isIgnorableWhatsAppError(stateError)) {
        console.warn(`⚠️ [${sessionId}] Erro ignorável ao verificar estado, prosseguindo...`);
      } else if (stateError.message.includes('não está pronto') || stateError.message.includes('não está CONNECTED')) {
        throw stateError;
      } else {
        console.error(`❌ [${sessionId}] Não foi possível verificar estado do WhatsApp: ${stateError.message}`);
        this.logRecentError(sessionId, stateError);

        // Se getState deu timeout, o Chromium provavelmente morreu.
        // Tenta reconectar automaticamente em background e avisa o frontend.
        if (stateError.message.includes('getState_timeout') || stateError.message.includes('timeout')) {
          console.log(`🔄 [${sessionId}] Chromium morto detectado no envio. Iniciando reconexão automática...`);
          session.status = 'disconnected';
          await this.db.updateSessionStatus(sessionId, 'disconnected');

          // Emite evento para frontend saber que precisa reconectar
          this.io.to(`user_${session.userId}`).emit('session_disconnected', {
            sessionId: sessionId,
            reason: 'CHROMIUM_DEAD'
          });

          // Tenta reconectar em background
          this.attemptFullReconnect(session);

          throw new Error('Sessão WhatsApp perdeu conexão. Reconexão automática em andamento. Aguarde 1 minuto e tente novamente.');
        }

        throw new Error('Sessão WhatsApp instável. Reconecte a sessão.');
      }
    }

    const normalizedPhone = this.normalizePhoneNumber(phoneNumber);
    const chatId = normalizedPhone.includes('@c.us') ? normalizedPhone : `${normalizedPhone}@c.us`;

    // Rate limiting: espera intervalo mínimo entre mensagens
    await this.waitForRateLimit(sessionId);

    console.log(`📞 [${sessionId}] Enviando para: ${phoneNumber} → ${normalizedPhone}`);

    // ═══════════════════════════════════════════════════════════════════
    // ENVIO ÚNICO — SEM RETRIES (evita mensagens duplicadas)
    // Uma única tentativa com timeout de 60s. Se falhar, retorna erro
    // imediatamente para o chamador (ProspectFlow) tratar.
    // ═══════════════════════════════════════════════════════════════════
    try {
      const sentMessage = await this.sendMessageWithTimeout(client, chatId, message, mediaUrl);
      console.log(`✅ [${sessionId}] Mensagem enviada com sucesso! ID: ${sentMessage?.id?._serialized || 'N/A'}`);

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
      this.logRecentError(sessionId, error);
      console.error(`❌ [${sessionId}] Erro envio para ${normalizedPhone}:`, error.message);

      // Se é um erro fatal do Chromium, marca como desconectado e avisa frontend
      if (this.isFatalSessionError(error)) {
        console.error(`💀 [${sessionId}] Erro FATAL de Chromium: ${error.message}`);
        session.status = 'disconnected';
        await this.db.updateSessionStatus(sessionId, 'disconnected');

        this.io.to(`user_${session.userId}`).emit('session_disconnected', {
          sessionId: sessionId,
          reason: 'CHROMIUM_CRASH'
        });

        // Tenta reconectar em background (não bloqueia a resposta HTTP)
        this.attemptFullReconnect(session);

        throw new Error('Sessão WhatsApp caiu. Reconectando automaticamente, tente novamente em 1 minuto.');
      }

      // NÃO faz retry — lança o erro direto para o chamador
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
      authStrategy: this.useRemoteAuth ? 'RemoteAuth (PostgreSQL)' : 'LocalAuth',
      maxConcurrent: MAX_CONCURRENT_SESSIONS,
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
      if (session.status === 'connected' || session.status === 'authenticated') {
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

      if (session.client) {
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
        sessionInfo.whatsappState = 'no_client';
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

    session.lastSeen = Date.now();
    this.sessionLastActivity.set(sessionId, Date.now());

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
  // - Sessões connected/authenticated IDLE: DESCONECTA após IDLE_DISCONNECT_MS (1h)
  // ═══════════════════════════════════════════════════════════════════
  startAutoCleanup() {
    console.log(`🔄 Auto-limpeza inteligente iniciada (verifica a cada ${CLEANUP_INTERVAL_MS / 1000}s)`);
    console.log(`   - QR Code timeout: ${QR_CODE_TIMEOUT_MS / 1000}s`);
    console.log(`   - Idle disconnect: ${IDLE_DISCONNECT_MS / 1000}s`);

    setInterval(async () => {
      const now = Date.now();
      const toDestroy = [];
      const toDisconnect = [];

      for (const [sid, lastTs] of this.sessionLastActivity.entries()) {
        const sess = this.sessions.get(sid);
        if (!sess) {
          this.sessionLastActivity.delete(sid);
          continue;
        }

        // Sessões connected/authenticated IDLE → desconecta para liberar Chromium
        if ((sess.status === 'connected' || sess.status === 'authenticated') && sess.client) {
          const idleTime = now - lastTs;
          if (idleTime > IDLE_DISCONNECT_MS) {
            toDisconnect.push({ sid, idleTime });
          }
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

        // Sessões mortas (failed, disconnected, etc): remove após 10 minutos
        if (['failed', 'disconnected', 'auth_failure'].includes(sess.status) && (now - lastTs) > 10 * 60 * 1000) {
          toDestroy.push({ sid, reason: `Inativa ${Math.round((now - lastTs) / 1000)}s (${sess.status})` });
          continue;
        }
      }

      // Desconecta sessões idle (libera Chromium, usuário precisará escanear QR novamente)
      for (const { sid, idleTime } of toDisconnect) {
        console.log(`🔌 Auto-disconnect: "${sid}" — idle por ${Math.round(idleTime / 1000)}s`);
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
          await this.cleanupSession(sid);
        } catch (e) {
          console.error(`Erro ao auto-limpar ${sid}:`, e.message);
          this.sessions.delete(sid);
          this.sessionLastActivity.delete(sid);
        }
      }

      if (toDisconnect.length > 0 || toDestroy.length > 0) {
        console.log(`✅ Auto-cleanup: ${toDisconnect.length} desconectada(s), ${toDestroy.length} removida(s). Chromium ativos: ${this.getActiveChromiumCount()}/${MAX_CONCURRENT_SESSIONS}`);
      }
    }, CLEANUP_INTERVAL_MS);
  }
}

module.exports = SessionManager;
