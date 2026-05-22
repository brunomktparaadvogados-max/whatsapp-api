const fs = require('fs');
const path = require('path');
const MIN_AUTH_BLOB_BYTES = parseInt(process.env.MIN_REMOTE_AUTH_BLOB_BYTES) || 128 * 1024;

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
    this._savedSessions = new Set(); // Sessões que JÁ foram salvas pelo menos 1x (proteção contra perda)
    this._forceSaveSessions = new Set(); // Proximo save deve ignorar throttle/HealthGuard
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

  _toBuffer(data) {
    if (!data) return Buffer.alloc(0);
    return Buffer.isBuffer(data) ? data : Buffer.from(data);
  }

  _zipSignature(data) {
    return this._toBuffer(data).subarray(0, 4).toString('hex') || 'empty';
  }

  _isValidZipBuffer(data, dataSize = null) {
    const buffer = this._toBuffer(data);
    const size = dataSize === null ? buffer.length : Number(dataSize || 0);

    if (size < MIN_AUTH_BLOB_BYTES || buffer.length < 4) return false;

    const isZipPrefix = buffer[0] === 0x50 && buffer[1] === 0x4b; // "PK"
    const isKnownZipHeader =
      (buffer[2] === 0x03 && buffer[3] === 0x04) ||
      (buffer[2] === 0x05 && buffer[3] === 0x06) ||
      (buffer[2] === 0x07 && buffer[3] === 0x08);

    return isZipPrefix && isKnownZipHeader;
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

      // Carrega lista de sessões que JÁ existem no banco para saber quais já foram salvas
      try {
        const existing = await this.pool.query(
          'SELECT session_id, length(data) AS data_size, substring(data from 1 for 4) AS data_prefix FROM whatsapp_auth_sessions'
        );
        for (const row of existing.rows) {
          const dataSize = Number(row.data_size || 0);
          if (this._isValidZipBuffer(row.data_prefix, dataSize)) {
            this._savedSessions.add(row.session_id);
          } else if (dataSize >= MIN_AUTH_BLOB_BYTES) {
            console.warn(`PostgresStore: "${row.session_id}" ignorada no rastreamento; zip corrompido ou assinatura invalida (${dataSize} bytes, sig=${this._zipSignature(row.data_prefix)})`);
          }
        }
        console.log(`✅ PostgresStore: ${this._savedSessions.size} sessões válidas carregadas no rastreamento`);
      } catch (loadErr) {
        console.warn(`⚠️ PostgresStore: não conseguiu carregar sessões existentes: ${loadErr.message}`);
      }

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
        'SELECT length(data) AS data_size, substring(data from 1 for 4) AS data_prefix FROM whatsapp_auth_sessions WHERE session_id = $1',
        [sessionId]
      );
      const dataSize = Number(result.rows[0]?.data_size || 0);
      const exists = this._isValidZipBuffer(result.rows[0]?.data_prefix, dataSize);
      console.log(`🔍 PostgresStore.sessionExists("${sessionId}"): ${exists}`);
      if (!exists && dataSize >= MIN_AUTH_BLOB_BYTES) {
        console.warn(`PostgresStore.sessionExists("${sessionId}"): blob existe, mas ZIP invalido (${dataSize} bytes, sig=${this._zipSignature(result.rows[0]?.data_prefix)})`);
      }
      return exists;
    } catch (err) {
      console.error(`❌ PostgresStore.sessionExists error for "${sessionId}":`, err.message);
      return false;
    }
  }

  forceNextSave(session) {
    const sessionId = this._normalizeSessionId(session);
    this._forceSaveSessions.add(sessionId);
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
      const now = Date.now();
      const isFirstSave = !this._savedSessions.has(sessionId);
      const forcedSave = this._forceSaveSessions.delete(sessionId);

      // ═══════════════════════════════════════════════════════════════
      // REGRA DE OURO: O PRIMEIRO SAVE DE UMA SESSÃO NUNCA É BLOQUEADO
      // ═══════════════════════════════════════════════════════════════
      // Se o usuário acabou de escanear QR e o RemoteAuth tenta salvar pela
      // primeira vez, SEMPRE permitir — é o save que garante que a sessão
      // sobrevive a restarts. Sem isso, se o servidor cair antes do 1º save,
      // a sessão é perdida e o usuário precisa escanear QR novamente.

      if (!isFirstSave && !forcedSave) {
        // HEALTHGUARD: Verifica se saves devem ser pausados (banco sobrecarregado / disparos)
        // Só bloqueia saves SUBSEQUENTES — o primeiro save sempre passa
        if (global.__healthGuard && global.__healthGuard.shouldBlockSave()) {
          return;
        }

        // THROTTLE: Evita saves muito frequentes da mesma sessão
        // Só aplica throttle após o primeiro save — o primeiro é urgente
        const lastSave = this._lastSaveTime.get(sessionId);
        if (lastSave && (now - lastSave) < this._minSaveInterval) {
          return;
        }
      } else {
        const saveReason = isFirstSave ? 'PRIMEIRO SAVE' : 'SAVE FORCADO';
        console.log(`🔰 PostgresStore: ${saveReason} para "${sessionId}" — prioridade máxima (bypass throttle/healthguard)`);
      }

      if (!fs.existsSync(zipPath)) {
        console.error(`❌ PostgresStore.save: zip não encontrado em "${zipPath}"`);
        return; // NÃO lançar — setInterval sem try/catch
      }

      const data = fs.readFileSync(zipPath);
      const sizeMB = (data.length / 1024 / 1024).toFixed(2);

      if (data.length < MIN_AUTH_BLOB_BYTES) {
        console.error(`PostgresStore.save: zip invalido para "${sessionId}" (${data.length} bytes; minimo ${MIN_AUTH_BLOB_BYTES})`);
        return;
      }

      // LIMITE DE TAMANHO: Blobs > 15MB são cache acumulado que sobrecarrega o Supabase.
      // O banco Micro (1GB RAM) não suporta muitos blobs grandes — cada save de 78MB
      // consome RAM do banco e bloqueia conexões. Sessões normais têm 2-5MB.
      if (!this._isValidZipBuffer(data)) {
        console.error(`PostgresStore.save: zip corrompido para "${sessionId}" (${data.length} bytes, sig=${this._zipSignature(data)}) - preservando ultimo RemoteAuth valido no banco`);
        return;
      }

      if (data.length > this._maxSaveBytes) {
        const maxMB = (this._maxSaveBytes / 1024 / 1024).toFixed(0);
        console.warn(`⚠️ PostgresStore.save: "${sessionId}" tem ${sizeMB}MB (máx ${maxMB}MB) — pulando save para proteger o banco`);
        this._lastSaveTime.set(sessionId, now); // Evita retry imediato
        return;
      }

      // SET statement_timeout maior para blobs (são queries pesadas de 2-10MB)
      // O pool global tem 15s, mas blobs precisam de mais tempo
      const client = await this.pool.connect();
      try {
        await client.query('SET statement_timeout = 45000'); // 45s para blobs
        await client.query(
          `INSERT INTO whatsapp_auth_sessions (session_id, data, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (session_id)
           DO UPDATE SET data = $2, updated_at = NOW()`,
          [sessionId, data]
        );
      } finally {
        client.release();
      }

      this._lastSaveTime.set(sessionId, now);
      this._savedSessions.add(sessionId);  // Marca: essa sessão já foi salva pelo menos 1x
      console.log(`💾 PostgresStore: sessão "${sessionId}" salva (${sizeMB}MB)${isFirstSave ? ' ★ PRIMEIRO SAVE — sessão protegida!' : ''}`);
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
      // SET statement_timeout maior para extract de blobs (podem ser 5-10MB)
      const client = await this.pool.connect();
      let result;
      try {
        await client.query('SET statement_timeout = 45000'); // 45s para blobs
        result = await client.query(
          'SELECT data FROM whatsapp_auth_sessions WHERE session_id = $1',
          [sessionId]
        );
      } finally {
        client.release();
      }

      if (result.rows.length > 0 && result.rows[0].data) {
        const data = this._toBuffer(result.rows[0].data);
        if (data.length < MIN_AUTH_BLOB_BYTES) {
          throw new Error(`RemoteAuth "${sessionId}" inválido ou vazio (${result.rows[0].data.length} bytes)`);
        }

        // Garantir que o diretório pai existe
        if (!this._isValidZipBuffer(data)) {
          throw new Error(`RemoteAuth "${sessionId}" corrompido: ZIP invalido (${data.length} bytes, sig=${this._zipSignature(data)})`);
        }

        const dir = path.dirname(options.path);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        fs.writeFileSync(options.path, data);
        const sizeMB = (data.length / 1024 / 1024).toFixed(2);
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
        'SELECT session_id, length(data) as data_size, substring(data from 1 for 4) AS data_prefix, updated_at FROM whatsapp_auth_sessions ORDER BY updated_at DESC'
      );
      return result.rows.map(row => ({
        ...row,
        valid_zip: this._isValidZipBuffer(row.data_prefix, row.data_size),
        signature: this._zipSignature(row.data_prefix)
      }));
    } catch (err) {
      console.error('❌ PostgresStore.listSessions error:', err.message);
      return [];
    }
  }
}

module.exports = PostgresStore;
