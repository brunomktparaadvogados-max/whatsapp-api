const fs = require('fs');

/**
 * PostgresStore — substituto do MongoStore para wwebjs RemoteAuth
 *
 * Armazena sessões do WhatsApp Web no PostgreSQL (Supabase) em vez do MongoDB.
 * Implementa a mesma interface que MongoStore (sessionExists, save, extract, delete).
 *
 * Vantagens:
 * - Usa o banco PostgreSQL que já existe (sem serviço adicional)
 * - Sem problemas de DNS SRV ou IP whitelist
 * - Dados de sessão sobrevivem a deploys no Koyeb
 */
class PostgresStore {
  constructor({ pool }) {
    if (!pool) throw new Error('A valid pg Pool instance is required for PostgresStore.');
    this.pool = pool;
    this._initialized = false;
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
    try {
      const result = await this.pool.query(
        'SELECT 1 FROM whatsapp_auth_sessions WHERE session_id = $1',
        [options.session]
      );
      return result.rows.length > 0;
    } catch (err) {
      console.error(`PostgresStore.sessionExists error for ${options.session}:`, err.message);
      return false;
    }
  }

  /**
   * Salva o arquivo zip da sessão no banco
   * RemoteAuth cria {session}.zip no disco, depois chama save()
   * @param {Object} options - { session: string }
   */
  async save(options) {
    await this.init();
    const zipPath = `${options.session}.zip`;

    try {
      const data = fs.readFileSync(zipPath);
      const sizeMB = (data.length / 1024 / 1024).toFixed(2);

      await this.pool.query(
        `INSERT INTO whatsapp_auth_sessions (session_id, data, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (session_id)
         DO UPDATE SET data = $2, updated_at = NOW()`,
        [options.session, data]
      );

      console.log(`💾 PostgresStore: sessão "${options.session}" salva (${sizeMB}MB)`);
    } catch (err) {
      console.error(`PostgresStore.save error for ${options.session}:`, err.message);
      throw err;
    }
  }

  /**
   * Extrai o arquivo zip da sessão do banco para o disco
   * RemoteAuth chama extract() para restaurar a sessão
   * @param {Object} options - { session: string, path: string }
   */
  async extract(options) {
    await this.init();
    try {
      const result = await this.pool.query(
        'SELECT data FROM whatsapp_auth_sessions WHERE session_id = $1',
        [options.session]
      );

      if (result.rows.length > 0 && result.rows[0].data) {
        fs.writeFileSync(options.path, result.rows[0].data);
        const sizeMB = (result.rows[0].data.length / 1024 / 1024).toFixed(2);
        console.log(`📦 PostgresStore: sessão "${options.session}" extraída (${sizeMB}MB)`);
      } else {
        throw new Error(`Session ${options.session} not found in database`);
      }
    } catch (err) {
      console.error(`PostgresStore.extract error for ${options.session}:`, err.message);
      throw err;
    }
  }

  /**
   * Remove a sessão do banco
   * @param {Object} options - { session: string }
   */
  async delete(options) {
    await this.init();
    try {
      await this.pool.query(
        'DELETE FROM whatsapp_auth_sessions WHERE session_id = $1',
        [options.session]
      );
      console.log(`🗑️ PostgresStore: sessão "${options.session}" removida`);
    } catch (err) {
      console.error(`PostgresStore.delete error for ${options.session}:`, err.message);
    }
  }
}

module.exports = PostgresStore;
