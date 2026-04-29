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
const MAX_CONCURRENT_SESSIONS = parseInt(process.env.MAX_CONCURRENT_SESSIONS) || 10; // 10 Chromiums (~2.5GB RAM — cabe em 8GB)
const QR_CODE_TIMEOUT_MS = 5 * 60 * 1000;       // 5 minutos para escanear QR
const IDLE_DISCONNECT_MS = parseInt(process.env.IDLE_DISCONNECT_MS) || 5 * 60 * 60 * 1000; // 5 horas idle → desconecta sessão
const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;        // verifica a cada 2 minutos (economiza queries)
const SESSION_INIT_TIMEOUT_MS = 120000;           // 2 minutos para Chromium iniciar
const MESSAGE_SEND_TIMEOUT_MS = 60000;            // 60 segundos timeout por mensagem (1 tentativa única)
const MIN_MESSAGE_INTERVAL_MS = 1500;             // 1.5 segundos entre mensagens (anti-rate-limit)
const MAX_SEND_RETRIES = 0;                       // SEM retries — evita mensagens duplicadas
const AUTO_RECONNECT_TIMEOUT_MS = 90000;          // 90s máx para auto-reconexão no envio

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
    this.reconnectingSet = new Set();       // Sessões em processo de auto-reconexão
    this.reconnectPromises = new Map();     // Promises de reconexão em andamento
    this.reconnectCancelled = new Set();   // Sessões que tiveram reconnect cancelado

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

      if (sessionsWithAuth.length === 0) {
        console.log(`💡 Nenhuma sessão para restaurar. Usuários precisarão escanear QR.`);
        return;
      }

      // Restaura até MAX_CONCURRENT_SESSIONS sessões, sequencialmente
      // (sequencial para não estourar CPU/RAM com N Chromiums iniciando ao mesmo tempo)
      const toRestore = sessionsWithAuth.slice(0, MAX_CONCURRENT_SESSIONS);
      const remaining = sessionsWithAuth.slice(MAX_CONCURRENT_SESSIONS);

      // Sessões que excedem o limite ficam disconnected (auto-reconexão sob demanda)
      for (const s of remaining) {
        await this.db.updateSessionStatus(s.id, 'disconnected');
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
          if (restored < toRestore.length) {
            await new Promise(r => setTimeout(r, 3000));
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
      // Fallback: marca tudo como desconectado
      await this.markAllSessionsDisconnected();
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

    // CANCELA qualquer reconnect pendente para esta sessão (evita race condition)
    this.cancelReconnect(sessionId);

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

    // Se existe no banco, ATUALIZA o status (NÃO deleta — preserva contatos/mensagens/auto_replies)
    const existingDbSession = await this.db.getSession(sessionId);
    if (existingDbSession) {
      console.log(`🔄 Sessão ${sessionId} existe no banco com status '${existingDbSession.status}', reutilizando registro...`);
      await this.db.updateSessionStatus(sessionId, 'initializing');
    }

    // RemoteAuth: NÃO deleta dados de auth — permite reconexão sem QR code
    // Dados só são deletados em: deleteSession (explícito) ou auth_failure
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

      // Se timeout com RemoteAuth, auth data pode estar corrompido
      if (error.message.includes('Timeout') && this.pgStore) {
        try {
          const authSessionId = `RemoteAuth-${sessionData.id}`;
          const hasAuth = await this.pgStore.sessionExists({ session: authSessionId });
          if (hasAuth) {
            await this.pgStore.delete({ session: authSessionId });
            console.log(`🗑️ [${sessionData.id}] RemoteAuth deletado após timeout — próximo login pedirá QR`);
          }
        } catch (e) { /* ignora */ }
      }

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
          '--disable-features=TranslateUI,IsolateOrigins,site-per-process',
          '--disable-site-isolation-trials',      // Evita "detached frame" errors
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-component-update',
          '--renderer-process-limit=1',            // 1 renderer por Chromium (economiza RAM)
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
            backupSyncIntervalMs: 10 * 60 * 1000 // Salva sessão no PostgreSQL a cada 10 minutos (reduz carga no Supabase)
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

      // Auth falhou — RemoteAuth data está corrompido, deletar para forçar novo QR
      if (this.pgStore) {
        try {
          const authSessionId = `RemoteAuth-${sessionData.id}`;
          await this.pgStore.delete({ session: authSessionId });
          console.log(`🗑️ [${sessionData.id}] RemoteAuth corrompido deletado — próximo login pedirá QR`);
        } catch (e) {
          console.warn(`⚠️ Erro ao limpar RemoteAuth corrompido: ${e.message}`);
        }
      }

      // Limpa recursos de Chromium mas mantém registro no banco
      await this.cleanupSession(sessionData.id);

      this.io.to(`user_${sessionData.userId}`).emit('session_error', {
        sessionId: sessionData.id,
        error: 'Falha na autenticação. Delete a sessão e crie novamente.',
        status: 'auth_failure'
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

      await this.db.upsertContact(sessionData.id, contactPhone, message._data.notifyName);

      this.io.to(`user_${sessionData.userId}`).emit('new_message', {
        sessionId: sessionData.id,
        message: messageData
      });

      // Webhook — só envia para mensagens RECEBIDAS de números válidos
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
            notifyName: message._data?.notifyName || message._data?.pushname || null
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
        status: 'sent'
      };

      await this.db.upsertContact(sessionData.id, contactPhone);

      this.io.to(`user_${sessionData.userId}`).emit('message_sent', {
        sessionId: sessionData.id,
        message: messageData
      });

      // NÃO envia webhook para message_create — o sendMessage já
      // retorna sucesso via HTTP para o ProspectFlow. Enviar webhook
      // aqui causaria contagem dupla de mensagens enviadas.
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
      'detached Frame',                // Puppeteer frame bug (não fatal com --disable-site-isolation)
      'Attempted to use detached',     // Variação do mesmo bug
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
      'execution context was destroyed',
      'session closed',
      'protocol error',
      'target closed',
      'page crashed',
      'browser disconnected',
      'navigation failed',
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

  // ═══════════════════════════════════════════════════════════════════
  // AUTO-RECONEXÃO PARA ENVIO: Reconecta sessão usando RemoteAuth
  // Se RemoteAuth existe, reconecta sem QR. Se não, retorna null.
  // Garante que só 1 reconexão por sessão aconteça ao mesmo tempo.
  // ═══════════════════════════════════════════════════════════════════
  async autoReconnectForSend(sessionId) {
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

  // Espera uma sessão ficar pronta (connected/authenticated) ou falhar
  async waitForSessionReady(sessionId, maxWaitMs) {
    const startTime = Date.now();
    const pollInterval = 2000; // checa a cada 2s

    while (Date.now() - startTime < maxWaitMs) {
      const session = this.sessions.get(sessionId);
      if (session) {
        if (session.status === 'connected' || session.status === 'authenticated') {
          return session;
        }
        // Estados terminais — não vai recuperar
        if (session.status === 'failed' || session.status === 'auth_failure') {
          return null;
        }
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    console.warn(`⏰ [${sessionId}] Timeout aguardando sessão ficar pronta (${maxWaitMs / 1000}s)`);
    return null;
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

    // ═══════════════════════════════════════════════════════════════════
    // AUTO-RECONEXÃO: Se sessão desconectada, tenta reconectar via RemoteAuth
    // Isso permite que ProspectFlow envie sem o usuário ter que escanear QR
    // ═══════════════════════════════════════════════════════════════════
    const needsReconnect = !session ||
                           !session.client ||
                           (session.status !== 'connected' && session.status !== 'authenticated');

    if (needsReconnect) {
      console.log(`🔄 [${sessionId}] Sessão não está pronta (status: ${session?.status || 'não na memória'}). Tentando auto-reconexão...`);
      session = await this.autoReconnectForSend(sessionId);
      if (!session) {
        throw new Error('Sessão desconectada e reconexão automática falhou. Escaneie o QR code novamente.');
      }
    }

    const client = session.client;

    // ═══════════════════════════════════════════════════════════════════
    // VERIFICAÇÃO LEVE: Confia no status em memória.
    // NÃO chama getState() a cada mensagem — isso sobrecarrega o Chromium
    // durante disparos em lote e causa timeouts que derrubam a sessão.
    // getState() só é chamado pelo zombie checker a cada 15 minutos.
    // ═══════════════════════════════════════════════════════════════════
    if (session.status !== 'connected' && session.status !== 'authenticated') {
      console.error(`❌ [${sessionId}] Status em memória: ${session.status} — não pode enviar`);
      throw new Error(`Sessão não está conectada. Status: ${session.status}. Reconecte o WhatsApp.`);
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

      // Se é um erro fatal do Chromium, marca como desconectado
      // MAS não chama attemptFullReconnect aqui — o próximo envio via
      // autoReconnectForSend cuida disso de forma mais segura
      if (this.isFatalSessionError(error)) {
        console.error(`💀 [${sessionId}] Erro FATAL de Chromium: ${error.message}`);
        session.status = 'disconnected';
        await this.db.updateSessionStatus(sessionId, 'disconnected');

        this.io.to(`user_${session.userId}`).emit('session_disconnected', {
          sessionId: sessionId,
          reason: 'CHROMIUM_CRASH'
        });

        throw new Error('Sessão WhatsApp caiu. Tente novamente em 1 minuto (reconexão automática).');
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
  // - Sessões connected/authenticated IDLE: DESCONECTA após IDLE_DISCONNECT_MS (5h)
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
