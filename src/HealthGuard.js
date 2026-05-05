/**
 * HealthGuard — Agente Autorregulador de Saúde do Sistema
 *
 * Monitora continuamente:
 * 1. Tamanho dos blobs RemoteAuth no Supabase (evita crescimento descontrolado)
 * 2. Uso de memória do processo Node.js (previne OOM)
 * 3. Saúde das conexões PostgreSQL (intervém antes de timeout cascade)
 * 4. Carga durante disparos em massa (pausa saves não-críticos)
 *
 * Ações automáticas (sem intervenção humana):
 * - Limpa blobs RemoteAuth > MAX_BLOB_MB (sessões com cache acumulado)
 * - Força GC quando memória passa de thresholds
 * - Evita saves simultâneos quando muitas sessões estão enviando
 * - Desconecta sessões zombie que travam recursos
 * - Emite alertas via console para diagnóstico remoto
 *
 * Filosofia: "Prevenir é melhor que crashar"
 * - Age ANTES do problema acontecer (thresholds preventivos)
 * - NUNCA lança exceções (logs erros e continua)
 * - Não depende de serviços externos (monitora localmente)
 */
class HealthGuard {
  constructor({ sessionManager, database, pgStore }) {
    this.sessionManager = sessionManager;
    this.db = database;
    this.pgStore = pgStore;

    // ═══════════════════════════════════════════════════════════════
    // CONFIGURAÇÃO — Thresholds ajustáveis via variáveis de ambiente
    // ═══════════════════════════════════════════════════════════════
    this.MAX_BLOB_MB = parseInt(process.env.HG_MAX_BLOB_MB) || 10;           // Blobs > 10MB são limpos (normal: 2-5MB)
    this.MAX_TOTAL_AUTH_MB = parseInt(process.env.HG_MAX_TOTAL_AUTH_MB) || 80; // Total de auth > 80MB → limpeza agressiva
    this.RSS_WARN_MB = parseInt(process.env.HG_RSS_WARN_MB) || 1400;         // Alerta de memória
    this.RSS_CRITICAL_MB = parseInt(process.env.HG_RSS_CRITICAL_MB) || 1700;  // Ação de emergência
    this.CHECK_INTERVAL_MS = parseInt(process.env.HG_CHECK_INTERVAL_MS) || 5 * 60 * 1000; // Verifica a cada 5 min
    this.BLOB_CHECK_INTERVAL_MS = parseInt(process.env.HG_BLOB_CHECK_MS) || 30 * 60 * 1000; // Verifica blobs a cada 30 min
    this.DB_HEALTH_INTERVAL_MS = parseInt(process.env.HG_DB_HEALTH_MS) || 2 * 60 * 1000;    // Verifica DB a cada 2 min

    // Estado interno
    this._lastBlobCheck = 0;
    this._lastDbCheck = 0;
    this._consecutiveDbFailures = 0;
    this._dispatchActive = false;        // Flag: disparos em massa em andamento
    this._dispatchStartTime = 0;
    this._savesBlockedUntil = 0;         // Timestamp até quando saves extras são bloqueados
    this._emergencyCleanupDone = false;  // Evita limpeza de emergência em loop
    this._stats = {
      blobsCleaned: 0,
      gcForced: 0,
      dbRecoveries: 0,
      emergencyCleanups: 0,
      sessionsEvicted: 0,
      startTime: Date.now()
    };

    console.log('🛡️ HealthGuard inicializado:');
    console.log(`   Max blob: ${this.MAX_BLOB_MB}MB | Max total auth: ${this.MAX_TOTAL_AUTH_MB}MB`);
    console.log(`   RSS warn: ${this.RSS_WARN_MB}MB | RSS critical: ${this.RSS_CRITICAL_MB}MB`);
    console.log(`   Check interval: ${this.CHECK_INTERVAL_MS / 1000}s | Blob check: ${this.BLOB_CHECK_INTERVAL_MS / 1000}s`);
  }

  /**
   * Inicia o monitoramento contínuo
   */
  start() {
    console.log('🛡️ HealthGuard: monitoramento contínuo ATIVO');

    // Loop principal — verifica memória e estado geral
    this._mainInterval = setInterval(() => this._mainCheck(), this.CHECK_INTERVAL_MS);

    // Primeira verificação imediata (após 30s para dar tempo de inicializar)
    setTimeout(() => this._mainCheck(), 30000);

    // Verificação de blobs em intervalo separado (menos frequente)
    this._blobInterval = setInterval(() => this._blobCheck(), this.BLOB_CHECK_INTERVAL_MS);

    // Primeira verificação de blobs após 2 minutos
    setTimeout(() => this._blobCheck(), 2 * 60 * 1000);

    // Verificação rápida de saúde do DB
    this._dbInterval = setInterval(() => this._dbHealthCheck(), this.DB_HEALTH_INTERVAL_MS);
  }

  /**
   * Para o monitoramento (para testes)
   */
  stop() {
    if (this._mainInterval) clearInterval(this._mainInterval);
    if (this._blobInterval) clearInterval(this._blobInterval);
    if (this._dbInterval) clearInterval(this._dbInterval);
    console.log('🛡️ HealthGuard: monitoramento PARADO');
  }

  // ═══════════════════════════════════════════════════════════════
  // CHECK PRINCIPAL — Memória + Estado geral
  // ═══════════════════════════════════════════════════════════════
  async _mainCheck() {
    try {
      const mem = process.memoryUsage();
      const rssMB = Math.round(mem.rss / 1024 / 1024);
      const heapMB = Math.round(mem.heapUsed / 1024 / 1024);
      const activeChromiums = this.sessionManager.getActiveChromiumCount();
      const totalSessions = this.sessionManager.sessions.size;

      // Log de status periódico (sempre útil para diagnóstico remoto)
      console.log(`🛡️ [HealthGuard] RSS: ${rssMB}MB | Heap: ${heapMB}MB | Chromium: ${activeChromiums} | Sessions: ${totalSessions} | DB errors: ${this._consecutiveDbFailures}`);

      // NÍVEL 1: Alerta (>1400MB RSS)
      if (rssMB > this.RSS_WARN_MB) {
        console.warn(`🟡 [HealthGuard] ALERTA memória: RSS ${rssMB}MB > ${this.RSS_WARN_MB}MB`);

        // Força GC se disponível
        if (global.gc) {
          global.gc();
          this._stats.gcForced++;
          const afterGC = Math.round(process.memoryUsage().rss / 1024 / 1024);
          console.log(`🔃 [HealthGuard] GC forçado: ${rssMB}MB → ${afterGC}MB`);
        }

        // Limpa mensagens em memória antigas
        this._cleanInMemoryMessages();
      }

      // NÍVEL 2: Crítico (>1700MB RSS) — Ação de emergência
      if (rssMB > this.RSS_CRITICAL_MB && !this._emergencyCleanupDone) {
        console.error(`🔴 [HealthGuard] CRÍTICO memória: RSS ${rssMB}MB > ${this.RSS_CRITICAL_MB}MB — EMERGÊNCIA`);
        await this._emergencyMemoryCleanup();
        this._emergencyCleanupDone = true;
        this._stats.emergencyCleanups++;

        // Reset flag após 10 minutos (permite nova emergência se necessário)
        setTimeout(() => { this._emergencyCleanupDone = false; }, 10 * 60 * 1000);
      }

      // Reset flag se memória voltou ao normal
      if (rssMB < this.RSS_WARN_MB) {
        this._emergencyCleanupDone = false;
      }

      // Detecta sessões zombie (em memória mas sem client ativo)
      await this._cleanZombieSessions();

    } catch (err) {
      // HealthGuard NUNCA crasha — apenas loga
      console.error(`❌ [HealthGuard] Erro no check principal:`, err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // VERIFICAÇÃO DE BLOBS — Controla tamanho do RemoteAuth
  // ═══════════════════════════════════════════════════════════════
  async _blobCheck() {
    if (!this.pgStore) return;

    try {
      const sessions = await this.pgStore.listSessions();
      if (!sessions || sessions.length === 0) return;

      let totalSizeMB = 0;
      const oversized = [];

      for (const s of sessions) {
        const sizeMB = s.data_size / 1024 / 1024;
        totalSizeMB += sizeMB;

        if (sizeMB > this.MAX_BLOB_MB) {
          oversized.push({ id: s.session_id, sizeMB: sizeMB.toFixed(2), updated: s.updated_at });
        }
      }

      console.log(`🛡️ [HealthGuard] RemoteAuth: ${sessions.length} sessões, ${totalSizeMB.toFixed(1)}MB total`);

      // Limpa blobs individuais > MAX_BLOB_MB
      if (oversized.length > 0) {
        console.warn(`⚠️ [HealthGuard] ${oversized.length} blob(s) oversized detectado(s):`);
        for (const blob of oversized) {
          console.warn(`   - ${blob.id}: ${blob.sizeMB}MB (max: ${this.MAX_BLOB_MB}MB)`);
          await this._cleanOversizedBlob(blob.id, parseFloat(blob.sizeMB));
        }
      }

      // Se total > MAX_TOTAL_AUTH_MB, limpa os maiores até ficar abaixo
      if (totalSizeMB > this.MAX_TOTAL_AUTH_MB) {
        console.warn(`🔴 [HealthGuard] Total auth ${totalSizeMB.toFixed(1)}MB > ${this.MAX_TOTAL_AUTH_MB}MB — limpeza agressiva`);
        await this._aggressiveBlobCleanup(sessions, totalSizeMB);
      }

      this._lastBlobCheck = Date.now();
    } catch (err) {
      console.error(`❌ [HealthGuard] Erro no blob check:`, err.message);
    }
  }

  /**
   * Remove blob oversized do banco.
   * O usuário precisará escanear QR novamente, mas o banco fica protegido.
   */
  async _cleanOversizedBlob(sessionId, sizeMB) {
    try {
      // Verifica se essa sessão está conectada agora
      const shortId = sessionId.replace('RemoteAuth-', '');
      const session = this.sessionManager.sessions.get(shortId);
      const isConnected = session && (session.status === 'connected' || session.status === 'authenticated');

      if (isConnected) {
        // ═══════════════════════════════════════════════════════════════
        // SESSÃO CONECTADA — NUNCA DELETAR BLOB!
        // ═══════════════════════════════════════════════════════════════
        // Se deletarmos e o servidor crashar antes do RemoteAuth recriar,
        // a sessão é perdida para sempre. Apenas logamos o alerta.
        // O limite de 15MB no PostgresStore.save() já impede que fique pior.
        // Quando a sessão desconectar limpa e reconectar, o blob será menor.
        console.warn(`⚠️ [HealthGuard] ${sessionId} (${sizeMB}MB) oversized MAS CONECTADA — NÃO deletar (proteção anti-perda)`);
        console.warn(`   → O limite de 15MB no save() impede crescimento. Blob será renovado no próximo ciclo limpo.`);
        // NÃO incrementa blobsCleaned — blob foi preservado intencionalmente
        return;
      } else {
        // Sessão desconectada — deleta blob (usuário fará novo QR)
        await this.db.pool.query(
          'DELETE FROM whatsapp_auth_sessions WHERE session_id = $1',
          [sessionId]
        );
        console.log(`🗑️ [HealthGuard] Blob oversized ${sessionId} (${sizeMB}MB) deletado (sessão desconectada — novo QR será necessário)`);
        this._stats.blobsCleaned++;
      }
    } catch (err) {
      console.error(`❌ [HealthGuard] Erro ao limpar blob ${sessionId}:`, err.message);
    }
  }

  /**
   * Limpeza agressiva: remove os maiores blobs até o total ficar abaixo do limite
   */
  async _aggressiveBlobCleanup(sessions, totalSizeMB) {
    // Ordena por tamanho decrescente
    const sorted = [...sessions].sort((a, b) => b.data_size - a.data_size);
    let currentTotal = totalSizeMB;

    for (const s of sorted) {
      if (currentTotal <= this.MAX_TOTAL_AUTH_MB * 0.7) break; // Target: 70% do limite

      const sizeMB = s.data_size / 1024 / 1024;
      if (sizeMB < 3) break; // Não mexe em blobs < 3MB (são normais)

      await this._cleanOversizedBlob(s.session_id, sizeMB);
      currentTotal -= sizeMB;
    }

    console.log(`🛡️ [HealthGuard] Limpeza agressiva concluída: ${totalSizeMB.toFixed(1)}MB → ~${currentTotal.toFixed(1)}MB`);
  }

  // ═══════════════════════════════════════════════════════════════
  // SAÚDE DO BANCO — Verifica conexões PostgreSQL
  // ═══════════════════════════════════════════════════════════════
  async _dbHealthCheck() {
    try {
      const start = Date.now();
      await this.db.pool.query('SELECT 1');
      const latency = Date.now() - start;

      if (this._consecutiveDbFailures > 0) {
        console.log(`🛡️ [HealthGuard] DB recuperado após ${this._consecutiveDbFailures} falhas (latência: ${latency}ms)`);
      }
      this._consecutiveDbFailures = 0;

      // Alerta se latência alta (Supabase sobrecarregado)
      if (latency > 5000) {
        console.warn(`🟡 [HealthGuard] DB latência ALTA: ${latency}ms — Supabase pode estar sobrecarregado`);

        // Se latência > 10s, pausa saves do RemoteAuth por 5 minutos
        if (latency > 10000) {
          this._savesBlockedUntil = Date.now() + 5 * 60 * 1000;
          console.warn(`🔴 [HealthGuard] Saves do RemoteAuth PAUSADOS por 5 minutos (latência ${latency}ms)`);
        }
      }

      this._lastDbCheck = Date.now();
    } catch (err) {
      this._consecutiveDbFailures++;
      console.error(`❌ [HealthGuard] DB health check falhou (${this._consecutiveDbFailures}x): ${err.message}`);

      // Se 5+ falhas consecutivas, tenta recovery do pool
      if (this._consecutiveDbFailures >= 5) {
        console.error(`🔴 [HealthGuard] ${this._consecutiveDbFailures} falhas DB consecutivas — forçando recovery`);
        this._stats.dbRecoveries++;

        // Pausa saves por 10 minutos durante recovery
        this._savesBlockedUntil = Date.now() + 10 * 60 * 1000;

        // O DatabaseManager já tem _recoverPool() que será triggerado
        // pela próxima query que falhar
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // CONTROLE DE DISPAROS — Protege banco durante envio em massa
  // ═══════════════════════════════════════════════════════════════

  /**
   * Chamado quando um envio em massa começa.
   * Aumenta intervalos de save e reduz carga no banco.
   */
  notifyDispatchStart() {
    this._dispatchActive = true;
    this._dispatchStartTime = Date.now();
    console.log(`🛡️ [HealthGuard] Disparo em massa DETECTADO — protegendo banco`);

    // Bloqueia saves extras do RemoteAuth por 10 minutos
    // (o RemoteAuth salva a cada 30 min, mas se muitos salvam juntos sobrecarrega)
    this._savesBlockedUntil = Date.now() + 10 * 60 * 1000;
  }

  /**
   * Chamado quando um envio em massa termina.
   */
  notifyDispatchEnd() {
    const duration = Date.now() - this._dispatchStartTime;
    this._dispatchActive = false;
    console.log(`🛡️ [HealthGuard] Disparo finalizado após ${Math.round(duration / 1000)}s`);

    // Libera saves após 2 minutos (tempo para o banco respirar)
    this._savesBlockedUntil = Date.now() + 2 * 60 * 1000;
  }

  /**
   * Verifica se saves do RemoteAuth devem ser pausados.
   * Chamado pelo PostgresStore antes de cada save.
   */
  shouldBlockSave() {
    if (Date.now() < this._savesBlockedUntil) {
      return true;
    }
    return false;
  }

  // ═══════════════════════════════════════════════════════════════
  // LIMPEZA DE EMERGÊNCIA — Memória crítica
  // ═══════════════════════════════════════════════════════════════
  async _emergencyMemoryCleanup() {
    console.error('🚨 [HealthGuard] === LIMPEZA DE EMERGÊNCIA ===');

    // 1. Força GC
    if (global.gc) {
      global.gc();
      this._stats.gcForced++;
    }

    // 2. Limpa todas as mensagens em memória
    const msgCount = this.sessionManager.inMemoryMessages.size;
    this.sessionManager.inMemoryMessages.clear();
    console.log(`🗑️ [HealthGuard] ${msgCount} conversas em memória limpas`);

    // 3. Desconecta a sessão mais ociosa para liberar ~80MB de RAM
    const evicted = await this.sessionManager.evictOldestIdleSession();
    if (evicted) {
      this._stats.sessionsEvicted++;
      console.log(`🔌 [HealthGuard] Sessão mais ociosa desconectada para liberar memória`);
    }

    // 4. Limpa erros recentes acumulados
    if (this.sessionManager.recentErrors) {
      this.sessionManager.recentErrors = [];
    }

    // 5. Força GC novamente após limpeza
    if (global.gc) {
      setTimeout(() => {
        global.gc();
        const afterMB = Math.round(process.memoryUsage().rss / 1024 / 1024);
        console.log(`🔃 [HealthGuard] GC pós-emergência: RSS agora ${afterMB}MB`);
      }, 5000);
    }

    console.error('🚨 [HealthGuard] === FIM DA LIMPEZA DE EMERGÊNCIA ===');
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Limpa mensagens em memória mais antigas (mantém últimas 20 por conversa)
   */
  _cleanInMemoryMessages() {
    let cleaned = 0;
    for (const [key, messages] of this.sessionManager.inMemoryMessages.entries()) {
      if (messages.length > 20) {
        const excess = messages.length - 20;
        messages.splice(0, excess);
        cleaned += excess;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 [HealthGuard] ${cleaned} mensagens antigas removidas da memória`);
    }
  }

  /**
   * Limpa sessões zombie — estão no Map mas sem client ativo
   */
  async _cleanZombieSessions() {
    const zombies = [];
    for (const [sid, session] of this.sessionManager.sessions.entries()) {
      // Sessão marcada como connected/authenticated mas sem client = zombie
      if ((session.status === 'connected' || session.status === 'authenticated') && !session.client) {
        zombies.push(sid);
      }
      // Sessão com client mas status morto há mais de 5 minutos
      if (session.client && ['failed', 'auth_failure'].includes(session.status)) {
        const lastActivity = this.sessionManager.sessionLastActivity.get(sid) || 0;
        if (Date.now() - lastActivity > 5 * 60 * 1000) {
          zombies.push(sid);
        }
      }
    }

    for (const sid of zombies) {
      console.warn(`🧟 [HealthGuard] Sessão zombie detectada: ${sid} — limpando`);
      try {
        await this.sessionManager.cleanupSession(sid);
        await this.db.updateSessionStatus(sid, 'disconnected');
      } catch (e) {
        console.error(`❌ [HealthGuard] Erro ao limpar zombie ${sid}:`, e.message);
      }
    }
  }

  /**
   * Retorna estatísticas do HealthGuard para o endpoint /health
   */
  getStats() {
    const uptimeMin = Math.round((Date.now() - this._stats.startTime) / 60000);
    return {
      uptime: `${uptimeMin}min`,
      blobsCleaned: this._stats.blobsCleaned,
      gcForced: this._stats.gcForced,
      dbRecoveries: this._stats.dbRecoveries,
      emergencyCleanups: this._stats.emergencyCleanups,
      sessionsEvicted: this._stats.sessionsEvicted,
      dispatchActive: this._dispatchActive,
      savesBlocked: Date.now() < this._savesBlockedUntil,
      consecutiveDbFailures: this._consecutiveDbFailures
    };
  }
}

module.exports = HealthGuard;
