const fs = require('fs');
const path = require('path');

/**
 * PostgresStore — substituto do MongoStore para wwebjs RemoteAuth
 *
 * Armazena sessões do WhatsApp Web no PostgreSQL (Supabase) em vez do MongoDB.
 * Implementa a mesma interface que MongoStore (sessionExists, save, extract, delete).
 *
 * IMPORTANTE — Compatibilidade com RemoteAuth do whatsapp-web.js:
 *
 * O RemoteAuth chama os métodos desta store com session_ids INCONSISTENTES:
 *   - save():          path COMPLETO  → "/app/.wwebjs_auth/RemoteAuth-user_xxx"
 *   - sessionExists(): nome curto     → "RemoteAuth-user_xxx"
 *   - extract():       nome curto     → "RemoteAuth-user_xxx"
 *   - delete():        nome curto     → "RemoteAuth-user_xxx"
 *
 * PostgresStore normaliza TODOS os session_ids com path.basename()
 * para garantir que save/exists/extract/delete operem sobre o MESMO registro.
 *
 * IMPORTANTE — Tratamento de erros:
 *
 * O RemoteAuth chama save() dentro de setInterval SEM try/catch.
 * Se save() lançar uma exceção, vira unhandled promise rejection e pode
 * crashar o Node.js. Por isso, save() NUNCA lança exceções — apenas loga erros.
 * extract() PODE lançar exceções (RemoteAuth trata o caso de sessão inexistente).
 */
class PostgresStore {
  constructor({ pool }) {
    if (!pool) throw new Error('A valid pg Pool instance is required for PostgresStore.');
    this.pool = pool;
    this._initialized = false;
    this._lastSaveTime = new Map();  // Throttle: evita saves muito frequentes
    this._minSaveInterval = 30 * 60 * 1000; // Mínimo 30 minutos entre saves (reduz carga no Supabase durante disparos)
    this._maxSaveBytes = 15 * 1024 * 1024;  // Máximo 15MB por sessão — blobs maiores são cache acumulado
  }

  /**
   * Normaliza o session_id: extrai apenas o basename do path.
   * Garante que save() e sessionExists() usem o mesmo ID.
   */
  _normalizeSessionId(session) {
    if (!session) return 'unknown';
    return path.basename(String(session));
  }

  /**
   * Cria a tabela se não existir
   */
  async init() {
    if (this._initialized) return;
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_auth_sessions (
          session_id TEXT PRIMARY KEY,
          data BYTEA NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      this._initialized = true;
      console.log('✅ PostgresStore: tabela whatsapp_auth_sessions pronta');
    } catch (err) {
      console.error('❌ PostgresStore: falha ao criar tabela:', err.message);
      throw err;
    }
  }

  /**
   * Verifica se a sessão existe no banco
   * @param {Object} options - { session: string }
   */
  async sessionExists(options) {
    await this.init();
    const sessionId = this._normalizeSessionId(options.session);
    try {
      const result = await this.pool.query(
        'SELECT 1 FROM whatsapp_auth_sessions WHERE session_id = $1',
        [sessionId]
      );
      const exists = result.rows.length > 0;
      console.log(`🔍 PostgresStore.sessionExists("${sessionId}"): ${exists}`);
      return exists;
    } catch (err) {
      console.error(`❌ PostgresStore.sessionExists error for "${sessionId}":`, err.message);
      return false;
    }
  }

  /**
   * Salva o arquivo zip da sessão no banco.
   *
   * NUNCA lança exceções — o RemoteAuth chama save() dentro de setInterval
   * sem try/catch, e qualquer throw viraria unhandled promise rejection
   * que pode crashar o processo Node.js.
   *
   * @param {Object} options - { session: string }
   */
  async save(options) {
    await this.init();
    // O zip path usa o valor ORIGINAL (path completo) pois é onde o arquivo está no disco
    const zipPath = `${options.session}.zip`;
    // Mas o session_id no banco usa apenas o basename para consistência
    const sessionId = this._normalizeSessionId(options.session);

    try {
      // HEALTHGUARD: Verifica se saves devem ser pausados (banco sobrecarregado / disparos)
      if (global.__healthGuard && global.__healthGuard.shouldBlockSave()) {
        // Silenciosamente pula — HealthGuard detectou que o banco precisa respirar
        return;
      }

      // THROTTLE: Evita saves muito frequentes da mesma sessão
      const lastSave = this._lastSaveTime.get(sessionId);
      const now = Date.now();
      if (lastSave && (now - lastSave) < this._minSaveInterval) {
        // Silenciosamente pula — o próximo ciclo salvará
        return;
      }

      if (!fs.existsSync(zipPath)) {
        console.error(`❌ PostgresStore.save: zip não encontrado em "${zipPath}"`);
        return; // NÃO lançar — setInterval sem try/catch
      }

      const data = fs.readFileSync(zipPath);
      const sizeMB = (data.length / 1024 / 1024).toFixed(2);

      if (data.length === 0) {
        console.error(`❌ PostgresStore.save: zip vazio para "${sessionId}"`);
        return;
      }

      // LIMITE DE TAMANHO: Blobs > 15MB são cache acumulado que sobrecarrega o Supabase.
      // O banco Micro (1GB RAM) não suporta muitos blobs grandes — cada save de 78MB
      // consome RAM do banco e bloqueia conexões. Sessões normais têm 2-5MB.
      if (data.length > this._maxSaveBytes) {
        const maxMB = (this._maxSaveBytes / 1024 / 1024).toFixed(0);
        console.warn(`⚠️ PostgresStore.save: "${sessionId}" tem ${sizeMB}MB (máx ${maxMB}MB) — pulando save para proteger o banco`);
        this._lastSaveTime.set(sessionId, now); // Evita retry imediato
        return;
      }

      await this.pool.query(
        `INSERT INTO whatsapp_auth_sessions (session_id, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (session_id)
         DO UPDATE SET data = $2, updated_at = NOW()`,
        [sessionId, data]
      );

      this._lastSaveTime.set(sessionId, now);
      console.log(`💾 PostgresStore: sessão "${sessionId}" salva (${sizeMB}MB)`);
    } catch (err) {
      // CRÍTICO: NÃO relançar! RemoteAuth chama save() em setInterval sem try/catch.
      // Qualquer throw aqui vira unhandled promise rejection → crash do Node.js.
      // O próximo ciclo do setInterval tentará novamente.
      console.error(`❌ PostgresStore.save FALHOU para "${sessionId}": ${err.message}`);
    }
  }

  /**
   * Extrai o arquivo zip da sessão do banco para o disco.
   * PODE lançar exceções — RemoteAuth trata o caso de sessão inexistente
   * e cria diretório vazio como fallback (novo QR será necessário).
   *
   * @param {Object} options - { session: string, path: string }
   */
  async extract(options) {
    await this.init();
    const sessionId = this._normalizeSessionId(options.session);
    try {
      const result = await this.pool.query(
        'SELECT data FROM whatsapp_auth_sessions WHERE session_id = $1',
        [sessionId]
      );

      if (result.rows.length > 0 && result.rows[0].data) {
        // Garantir que o diretório pai existe
        const dir = path.dirname(options.path);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(options.path, result.rows[0].data);
        const sizeMB = (result.rows[0].data.length / 1024 / 1024).toFixed(2);
        console.log(`📦 PostgresStore: sessão "${sessionId}" extraída para ${options.path} (${sizeMB}MB)`);
      } else {
        throw new Error(`Session "${sessionId}" not found in database`);
      }
    } catch (err) {
      console.error(`❌ PostgresStore.extract error for "${sessionId}":`, err.message);
      throw err; // RemoteAuth trata: cria diretório vazio → novo QR
    }
  }

  /**
   * Remove a sessão do banco
   * @param {Object} options - { session: string }
   */
  async delete(options) {
    await this.init();
    const sessionId = this._normalizeSessionId(options.session);
    try {
      await this.pool.query(
        'DELETE FROM whatsapp_auth_sessions WHERE session_id = $1',
        [sessionId]
      );
      console.log(`🗑️ PostgresStore: sessão "${sessionId}" removida`);
    } catch (err) {
      console.error(`❌ PostgresStore.delete error for "${sessionId}":`, err.message);
      // NÃO relançar — delete é chamado em cleanup/logout
    }
  }

  /**
   * Lista todas as sessões salvas (para diagnóstico)
   */
  async listSessions() {
    await this.init();
    try {
      const result = await this.pool.query(
        'SELECT session_id, length(data) as data_size, updated_at FROM whatsapp_auth_sessions ORDER BY updated_at DESC'
      );
      return result.rows;
    } catch (err) {
      console.error('❌ PostgresStore.listSessions error:', err.message);
      return [];
    }
  }
}

module.exports = PostgresStore;
