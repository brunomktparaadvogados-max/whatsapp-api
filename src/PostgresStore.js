const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
    this._freshAuthSessions = new Set(); // Sessao marcada para ignorar auth antigo e liberar QR fresco
    this._sessionAliases = new Map(); // RemoteAuth temporario -> RemoteAuth real
    // 8 min: blob com 30+ min de defasagem era rejeitado pelo WhatsApp Web na
    // reativacao ("RemoteAuth salvo existe, mas pediu QR"). Com o backup a cada
    // 10 min, isso persiste no maximo 1 save por ciclo, sempre fresco.
    this._minSaveInterval = 8 * 60 * 1000;
    this._maxSaveBytes = 15 * 1024 * 1024;  // Máximo 15MB por sessão — blobs maiores são cache acumulado
    // O ZIP principal ja e a copia ativa. Backups completos duplicam dezenas
    // de MB no Supabase e podem impedir novos scans de serem persistidos.
    this._backupRetention = Math.max(0, parseInt(process.env.REMOTE_AUTH_BACKUP_RETENTION ?? '0', 10) || 0);
  }

  /**
   * Normaliza o session_id: extrai apenas o basename do path.
   * Garante que save() e sessionExists() usem o mesmo ID.
   */
  _normalizeSessionId(session) {
    if (!session) return 'unknown';
    return path.basename(String(session));
  }

  _normalizeAuthSessionId(session) {
    const sessionId = this._normalizeSessionId(session);
    return sessionId.startsWith('RemoteAuth-') ? sessionId : `RemoteAuth-${sessionId}`;
  }

  _resolveStorageSessionId(session) {
    const sessionId = this._normalizeSessionId(session);
    return this._sessionAliases.get(sessionId) || sessionId;
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
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_auth_session_backups (
          id BIGSERIAL PRIMARY KEY,
          session_id TEXT NOT NULL,
          data BYTEA NOT NULL,
          data_hash TEXT NOT NULL,
          data_size INTEGER NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          UNIQUE(session_id, data_hash)
        )
      `);
      await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_whatsapp_auth_backups_session_created
        ON whatsapp_auth_session_backups (session_id, created_at DESC)
      `);
      this._initialized = true;

      // Remove apenas historico redundante. O ZIP principal e o backup
      // verificado mais recente de cada sessao permanecem intactos.
      try {
        const pruned = await this._pruneBackupHistory(this._backupRetention);
        if (pruned.deletedCount > 0) {
          console.log(`PostgresStore: ${pruned.deletedCount} backup(s) redundante(s) removido(s), ${(pruned.deletedBytes / 1024 / 1024).toFixed(1)}MB liberados`);
        }
      } catch (pruneErr) {
        console.warn(`PostgresStore: nao conseguiu reduzir historico de backups: ${pruneErr.message}`);
      }

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
    const sourceSessionId = this._normalizeSessionId(options.session);
    const sessionId = this._resolveStorageSessionId(options.session);
    if (this._freshAuthSessions.has(sourceSessionId) || this._freshAuthSessions.has(sessionId)) {
      console.warn(`PostgresStore.sessionExists("${sessionId}"): auth antigo suprimido para gerar QR fresco`);
      return false;
    }
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
      if (exists) return true;

      const backup = await this._findValidBackup(sessionId, { includeData: false });
      if (backup) {
        console.warn(`PostgresStore.sessionExists("${sessionId}"): principal invalido/ausente, mas backup valido existe (${backup.sizeMB}MB)`);
        return true;
      }

      return false;
    } catch (err) {
      console.error(`❌ PostgresStore.sessionExists error for "${sessionId}":`, err.message);
      return false;
    }
  }

  async _findValidBackup(sessionId, { includeData = true } = {}) {
    const dataSelect = includeData ? ', data' : '';
    const result = await this.pool.query(
      `SELECT id, session_id, data_size, substring(data from 1 for 4) AS data_prefix, created_at${dataSelect}
       FROM whatsapp_auth_session_backups
       WHERE session_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [sessionId]
    );

    for (const row of result.rows) {
      if (this._isValidZipBuffer(row.data_prefix, row.data_size)) {
        return {
          ...row,
          sizeMB: (Number(row.data_size || 0) / 1024 / 1024).toFixed(2)
        };
      }
    }

    return null;
  }

  async _saveVerifiedBackup(client, sessionId, data, dataHash) {
    if (this._backupRetention <= 0) {
      await client.query(
        'DELETE FROM whatsapp_auth_session_backups WHERE session_id = $1',
        [sessionId]
      );
      return;
    }

    await client.query(
      `INSERT INTO whatsapp_auth_session_backups (session_id, data, data_hash, data_size, created_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (session_id, data_hash) DO NOTHING`,
      [sessionId, data, dataHash, data.length]
    );

    await client.query(
      `DELETE FROM whatsapp_auth_session_backups
       WHERE session_id = $1
         AND id NOT IN (
           SELECT id
           FROM whatsapp_auth_session_backups
           WHERE session_id = $1
           ORDER BY created_at DESC
           LIMIT $2
         )`,
      [sessionId, this._backupRetention]
    );
  }

  async _pruneBackupHistory(keepPerSession = this._backupRetention) {
    const retention = Math.max(0, Number(keepPerSession) || 0);
    const result = await this.pool.query(
      `WITH ranked AS (
         SELECT id,
                ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY created_at DESC, id DESC) AS backup_rank
         FROM whatsapp_auth_session_backups
       ),
       deleted AS (
         DELETE FROM whatsapp_auth_session_backups b
         USING ranked r
         WHERE b.id = r.id
           AND r.backup_rank > $1
         RETURNING b.data_size
       )
       SELECT COUNT(*)::INTEGER AS deleted_count,
              COALESCE(SUM(data_size), 0)::BIGINT AS deleted_bytes
       FROM deleted`,
      [retention]
    );

    return {
      deletedCount: Number(result.rows[0]?.deleted_count || 0),
      deletedBytes: Number(result.rows[0]?.deleted_bytes || 0)
    };
  }

  async pruneBackupHistory(keepPerSession = this._backupRetention) {
    await this.init();
    return await this._pruneBackupHistory(keepPerSession);
  }

  async copyAuthSession({ fromSession, toSession, overwrite = false }) {
    await this.init();

    const fromId = this._normalizeAuthSessionId(fromSession);
    const toId = this._normalizeAuthSessionId(toSession);

    if (!fromId || !toId || fromId === toId) {
      throw new Error('Informe sessoes de origem e destino diferentes.');
    }

    const sourceResult = await this.pool.query(
      'SELECT session_id, data, length(data) AS data_size, updated_at FROM whatsapp_auth_sessions WHERE session_id = $1',
      [fromId]
    );

    let sourceData = sourceResult.rows[0]?.data ? this._toBuffer(sourceResult.rows[0].data) : null;
    let sourceKind = 'main';
    let sourceUpdatedAt = sourceResult.rows[0]?.updated_at || null;

    if (!this._isValidZipBuffer(sourceData, sourceData?.length || 0)) {
      const backup = await this._findValidBackup(fromId, { includeData: true });
      if (!backup?.data) {
        throw new Error(`RemoteAuth de origem ${fromId} nao existe ou nao contem ZIP valido.`);
      }
      sourceData = this._toBuffer(backup.data);
      sourceKind = 'backup';
      sourceUpdatedAt = backup.created_at || null;
    }

    const targetResult = await this.pool.query(
      'SELECT session_id, data, length(data) AS data_size FROM whatsapp_auth_sessions WHERE session_id = $1',
      [toId]
    );
    const targetData = targetResult.rows[0]?.data ? this._toBuffer(targetResult.rows[0].data) : null;
    const targetHasValidZip = this._isValidZipBuffer(targetData, targetData?.length || 0);

    if (targetHasValidZip && !overwrite) {
      throw new Error(`RemoteAuth de destino ${toId} ja existe e parece valido. Use overwrite=true apenas com confirmacao.`);
    }

    const dataHash = crypto.createHash('sha256').update(sourceData).digest('hex');
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      if (targetHasValidZip) {
        const targetHash = crypto.createHash('sha256').update(targetData).digest('hex');
        await this._saveVerifiedBackup(client, toId, targetData, targetHash);
      }

      await client.query(
        `INSERT INTO whatsapp_auth_sessions (session_id, data, created_at, updated_at)
         VALUES ($1, $2, NOW(), NOW())
         ON CONFLICT (session_id)
         DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
        [toId, sourceData]
      );

      await this._saveVerifiedBackup(client, toId, sourceData, dataHash);

      await client.query('COMMIT');

      this._savedSessions.add(toId);
      this._freshAuthSessions.delete(toId);
      this._forceSaveSessions.add(toId);

      return {
        from: fromId,
        to: toId,
        sourceKind,
        sourceUpdatedAt,
        overwritten: targetHasValidZip,
        sizeBytes: sourceData.length,
        sizeMB: (sourceData.length / 1024 / 1024).toFixed(2)
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getStorageStats() {
    await this.init();
    const result = await this.pool.query(
      `SELECT
         (SELECT COUNT(*) FROM whatsapp_auth_sessions)::INTEGER AS main_count,
         COALESCE((SELECT SUM(length(data)) FROM whatsapp_auth_sessions), 0)::BIGINT AS main_bytes,
         (SELECT COUNT(*) FROM whatsapp_auth_session_backups)::INTEGER AS backup_count,
         COALESCE((SELECT SUM(data_size) FROM whatsapp_auth_session_backups), 0)::BIGINT AS backup_bytes`
    );
    const row = result.rows[0] || {};
    return {
      mainCount: Number(row.main_count || 0),
      mainBytes: Number(row.main_bytes || 0),
      backupCount: Number(row.backup_count || 0),
      backupBytes: Number(row.backup_bytes || 0)
    };
  }

  forceNextSave(session) {
    const sessionId = this._resolveStorageSessionId(session);
    this._forceSaveSessions.add(sessionId);
  }

  suppressExistingAuth(session) {
    const sessionId = this._normalizeSessionId(session);
    this._freshAuthSessions.add(sessionId);
    console.warn(`PostgresStore: RemoteAuth antigo de "${sessionId}" sera ignorado nesta inicializacao para liberar QR fresco`);
  }

  aliasSession({ fromSession, toSession, suppressSource = true }) {
    const fromId = this._normalizeAuthSessionId(fromSession);
    const toId = this._normalizeAuthSessionId(toSession);
    if (!fromId || !toId || fromId === toId) return;

    this._sessionAliases.set(fromId, toId);
    this._forceSaveSessions.add(toId);
    if (suppressSource) {
      this._freshAuthSessions.add(fromId);
    }

    console.warn(`PostgresStore: alias "${fromId}" -> "${toId}" para QR fresco sem perder a sessao real`);
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
    const sourceSessionId = this._normalizeSessionId(options.session);
    const sessionId = this._resolveStorageSessionId(options.session);

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

      const dataHash = crypto.createHash('sha256').update(data).digest('hex');

      // SET statement_timeout maior para blobs (são queries pesadas de 2-10MB)
      // O pool global tem 15s, mas blobs precisam de mais tempo
      const client = await this.pool.connect();
      let committed = false;
      try {
        await client.query('SET statement_timeout = 45000'); // 45s para blobs
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO whatsapp_auth_sessions (session_id, data, updated_at)
           VALUES ($1, $2, NOW())
           ON CONFLICT (session_id)
           DO UPDATE SET data = $2, updated_at = NOW()`,
          [sessionId, data]
        );
        await this._saveVerifiedBackup(client, sessionId, data, dataHash);
        await client.query('COMMIT');
        committed = true;
      } finally {
        if (!committed) {
          try {
            await client.query('ROLLBACK');
          } catch (_) { /* ignore */ }
        }
        client.release();
      }

      this._lastSaveTime.set(sessionId, now);
      this._savedSessions.add(sessionId);  // Marca: essa sessão já foi salva pelo menos 1x
      this._freshAuthSessions.delete(sessionId);
      this._freshAuthSessions.delete(sourceSessionId);
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
    const sourceSessionId = this._normalizeSessionId(options.session);
    const sessionId = this._resolveStorageSessionId(options.session);
    if (this._freshAuthSessions.has(sourceSessionId) || this._freshAuthSessions.has(sessionId)) {
      throw new Error(`RemoteAuth "${sourceSessionId}" suprimido para gerar QR fresco`);
    }
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
          const backup = await this._findValidBackup(sessionId);
          if (backup?.data) {
            console.warn(`PostgresStore.extract: principal invalido para "${sessionId}", usando backup valido (${backup.sizeMB}MB)`);
            return await this._writeExtractedBackup(sessionId, backup, options.path);
          }
          throw new Error(`RemoteAuth "${sessionId}" inválido ou vazio (${result.rows[0].data.length} bytes)`);
        }

        // Garantir que o diretório pai existe
        if (!this._isValidZipBuffer(data)) {
          const backup = await this._findValidBackup(sessionId);
          if (backup?.data) {
            console.warn(`PostgresStore.extract: principal corrompido para "${sessionId}", usando backup valido (${backup.sizeMB}MB)`);
            return await this._writeExtractedBackup(sessionId, backup, options.path);
          }
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
        const backup = await this._findValidBackup(sessionId);
        if (backup?.data) {
          console.warn(`PostgresStore.extract: principal ausente para "${sessionId}", usando backup valido (${backup.sizeMB}MB)`);
          return await this._writeExtractedBackup(sessionId, backup, options.path);
        }
        throw new Error(`Session "${sessionId}" not found in database`);
      }
    } catch (err) {
      console.error(`❌ PostgresStore.extract error for "${sessionId}":`, err.message);
      throw err; // RemoteAuth trata: cria diretório vazio → novo QR
    }
  }

  async _writeExtractedBackup(sessionId, backup, targetPath) {
    const data = this._toBuffer(backup.data);
    if (!this._isValidZipBuffer(data)) {
      throw new Error(`Backup RemoteAuth "${sessionId}" invalido (${data.length} bytes)`);
    }

    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(targetPath, data);

    // Auto-repara o registro principal com o ultimo backup bom.
    await this.pool.query(
      `INSERT INTO whatsapp_auth_sessions (session_id, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (session_id)
       DO UPDATE SET data = $2, updated_at = NOW()`,
      [sessionId, data]
    );

    const sizeMB = (data.length / 1024 / 1024).toFixed(2);
    console.log(`📦 PostgresStore: sessão "${sessionId}" extraída de backup para ${targetPath} (${sizeMB}MB)`);
  }

  /**
   * Remove a sessão do banco
   * @param {Object} options - { session: string }
   */
  async delete(options) {
    await this.init();
    const sessionId = this._normalizeSessionId(options.session);
    let client;
    let committed = false;
    try {
      client = await this.pool.connect();
      await client.query('BEGIN');
      await client.query(
        'DELETE FROM whatsapp_auth_session_backups WHERE session_id = $1',
        [sessionId]
      );
      await client.query(
        'DELETE FROM whatsapp_auth_sessions WHERE session_id = $1',
        [sessionId]
      );
      await client.query('COMMIT');
      committed = true;
      this._freshAuthSessions.delete(sessionId);
      console.log(`🗑️ PostgresStore: sessão "${sessionId}" removida`);
    } catch (err) {
      console.error(`❌ PostgresStore.delete error for "${sessionId}":`, err.message);
      // NÃO relançar — delete é chamado em cleanup/logout
    } finally {
      if (client && !committed) {
        try {
          await client.query('ROLLBACK');
        } catch (_) { /* ignore */ }
      }
      if (client) {
        client.release();
      }
    }
  }

  /**
   * Lista todas as sessões salvas (para diagnóstico)
   */
  async listSessions() {
    await this.init();
    try {
      const result = await this.pool.query(
        `SELECT s.session_id,
                length(s.data) as data_size,
                substring(s.data from 1 for 4) AS data_prefix,
                s.updated_at,
                COALESCE(b.backup_count, 0) AS backup_count,
                b.latest_backup_at
         FROM whatsapp_auth_sessions s
         LEFT JOIN (
           SELECT session_id, COUNT(*) AS backup_count, MAX(created_at) AS latest_backup_at
           FROM whatsapp_auth_session_backups
           GROUP BY session_id
         ) b ON b.session_id = s.session_id
         ORDER BY s.updated_at DESC`
      );
      const rows = [];
      for (const row of result.rows) {
        const validZip = this._isValidZipBuffer(row.data_prefix, row.data_size);
        const backup = validZip ? null : await this._findValidBackup(row.session_id, { includeData: false });
        rows.push({
          ...row,
          valid_zip: validZip || !!backup,
          main_valid_zip: validZip,
          recoverable_from_backup: !validZip && !!backup,
          signature: this._zipSignature(row.data_prefix)
        });
      }
      return rows;
    } catch (err) {
      console.error('❌ PostgresStore.listSessions error:', err.message);
      return [];
    }
  }
}

module.exports = PostgresStore;
