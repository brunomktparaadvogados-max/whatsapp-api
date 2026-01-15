const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

class DatabaseManager {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_URL;

    if (!databaseUrl) {
      console.error('❌ DATABASE_URL não configurado!');
      throw new Error('DATABASE_URL é obrigatório');
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
      ssl: {
        rejectUnauthorized: false
      }
    });

    this.initTables();
    this.runInitialCleanup();
  }

  async runInitialCleanup() {
    setTimeout(async () => {
      try {
        console.log('🧹 Executando limpeza inicial de mensagens antigas...');
        const deletedCount = await this.deleteOldMessages(24);
        console.log(`✅ Limpeza inicial: ${deletedCount} mensagens antigas removidas`);
      } catch (error) {
        console.error('❌ Erro na limpeza inicial:', error.message);
      }
    }, 5000);
  }

  async query(sql, params = []) {
    const client = await this.pool.connect();
    try {
      const result = await client.query(sql, params);
      return result;
    } finally {
      client.release();
    }
  }

  async run(sql, params = []) {
    const result = await this.query(sql, params);
    return { lastID: result.rows[0]?.id, changes: result.rowCount };
  }

  async get(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows[0];
  }

  async all(sql, params = []) {
    const result = await this.query(sql, params);
    return result.rows;
  }

  async initTables() {
    await this.run(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'disconnected',
        phone_number TEXT,
        phone_name TEXT,
        webhook_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        name TEXT,
        profile_pic TEXT,
        last_message_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, phone_number),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        message_type TEXT NOT NULL,
        body TEXT,
        media_url TEXT,
        media_mimetype TEXT,
        from_me BOOLEAN NOT NULL,
        timestamp BIGINT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    try {
      await this.run(`
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name='messages' AND column_name='contact_phone'
          ) THEN
            ALTER TABLE messages ADD COLUMN contact_phone TEXT;
          END IF;
        END $$;
      `);
      console.log('✅ Migração: coluna contact_phone verificada/adicionada');
    } catch (error) {
      console.error('⚠️ Erro na migração contact_phone:', error.message);
    }

    await this.run(`
      CREATE TABLE IF NOT EXISTS auto_replies (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT NOT NULL,
        response_message TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        message TEXT NOT NULL,
        media_url TEXT,
        scheduled_at TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS meta_configs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        access_token TEXT NOT NULL,
        phone_number_id TEXT NOT NULL,
        business_account_id TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await this.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`);

    const adminExists = await this.get('SELECT id FROM users WHERE email = $1', ['admin@flow.com']);
    if (!adminExists) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await this.run('INSERT INTO users (email, password, name, company) VALUES ($1, $2, $3, $4)',
        ['admin@flow.com', hashedPassword, 'Administrador', 'Flow System']
      );
    }
  }

  async createUser(email, password, name, company = null) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await this.query(
      'INSERT INTO users (email, password, name, company) VALUES ($1, $2, $3, $4) RETURNING id',
      [email, hashedPassword, name, company]
    );
    return result.rows[0].id;
  }

  async getUserByEmail(email) {
    return await this.get('SELECT * FROM users WHERE email = $1', [email]);
  }

  async getUserById(id) {
    return await this.get('SELECT id, email, name, company, created_at FROM users WHERE id = $1', [id]);
  }

  verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  }

  async createSession(sessionId, userId) {
    return await this.run('INSERT INTO sessions (id, user_id) VALUES ($1, $2)', [sessionId, userId]);
  }

  async updateSessionStatus(sessionId, status, phoneNumber = null, phoneName = null) {
    return await this.run(
      'UPDATE sessions SET status = $1, phone_number = $2, phone_name = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4',
      [status, phoneNumber, phoneName, sessionId]
    );
  }

  async getSessionsByUserId(userId) {
    return await this.all('SELECT * FROM sessions WHERE user_id = $1', [userId]);
  }

  async getAllSessionsFromDB() {
    return await this.all('SELECT * FROM sessions');
  }

  async getSession(sessionId) {
    return await this.get('SELECT * FROM sessions WHERE id = $1', [sessionId]);
  }

  async deleteSession(sessionId) {
    return await this.run('DELETE FROM sessions WHERE id = $1', [sessionId]);
  }

  async saveMessage(messageData) {
    try {
      return await this.run(`
        INSERT INTO messages (id, session_id, contact_phone, message_type, body, media_url, media_mimetype, from_me, timestamp, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (id) DO UPDATE SET
          status = EXCLUDED.status,
          body = EXCLUDED.body
      `,
        [messageData.id, messageData.sessionId, messageData.contactPhone, messageData.messageType,
          messageData.body, messageData.mediaUrl, messageData.mediaMimetype,
          messageData.fromMe, messageData.timestamp, messageData.status]
      );
    } catch (error) {
      console.error('❌ Erro ao salvar mensagem:', error.message);
      throw error;
    }
  }

  async updateMessageStatus(messageId, status) {
    try {
      return await this.run('UPDATE messages SET status = $1 WHERE id = $2', [status, messageId]);
    } catch (error) {
      console.error('❌ Erro ao atualizar status da mensagem:', error.message, 'MessageId:', messageId);
      throw error;
    }
  }

  async getMessagesByContact(sessionId, contactPhone, limit = 100) {
    return await this.all(`
      SELECT * FROM messages
      WHERE session_id = $1 AND contact_phone = $2
      ORDER BY timestamp DESC
      LIMIT $3
    `, [sessionId, contactPhone, limit]);
  }

  async getContactsBySession(sessionId) {
    return await this.all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = c.session_id AND m.contact_phone = c.phone_number AND m.from_me = false AND m.status = 'received') as unread_count
      FROM contacts c
      WHERE c.session_id = $1
      ORDER BY c.last_message_at DESC
    `, [sessionId]);
  }

  async upsertContact(sessionId, phoneNumber, name = null, profilePic = null) {
    const existing = await this.get(
      'SELECT id FROM contacts WHERE session_id = $1 AND phone_number = $2',
      [sessionId, phoneNumber]
    );

    if (existing) {
      return await this.run(`
        UPDATE contacts SET
          name = COALESCE($1, name),
          profile_pic = COALESCE($2, profile_pic),
          last_message_at = CURRENT_TIMESTAMP
        WHERE session_id = $3 AND phone_number = $4
      `, [name, profilePic, sessionId, phoneNumber]);
    } else {
      return await this.run(`
        INSERT INTO contacts (session_id, phone_number, name, profile_pic, last_message_at)
        VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      `, [sessionId, phoneNumber, name, profilePic]);
    }
  }

  async createAutoReply(sessionId, triggerType, triggerValue, responseMessage) {
    const result = await this.run(`
      INSERT INTO auto_replies (session_id, trigger_type, trigger_value, response_message)
      VALUES ($1, $2, $3, $4)
    `, [sessionId, triggerType, triggerValue, responseMessage]);
    return result;
  }

  async getAutoReplies(sessionId) {
    return await this.all('SELECT * FROM auto_replies WHERE session_id = $1 AND is_active = true', [sessionId]);
  }

  async deleteAutoReply(id) {
    return await this.run('DELETE FROM auto_replies WHERE id = $1', [id]);
  }

  async createScheduledMessage(sessionId, contactPhone, message, mediaUrl, scheduledAt) {
    const result = await this.run(`
      INSERT INTO scheduled_messages (session_id, contact_phone, message, media_url, scheduled_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [sessionId, contactPhone, message, mediaUrl, scheduledAt]);
    return result;
  }

  async getPendingScheduledMessages() {
    return await this.all(`
      SELECT * FROM scheduled_messages
      WHERE status = 'pending' AND scheduled_at <= NOW()
    `);
  }

  async updateScheduledMessageStatus(id, status, sentAt = null) {
    return await this.run(
      'UPDATE scheduled_messages SET status = $1, sent_at = $2 WHERE id = $3',
      [status, sentAt, id]
    );
  }

  async saveMetaConfig(userId, accessToken, phoneNumberId, businessAccountId = null) {
    const result = await this.run(`
      INSERT INTO meta_configs (user_id, access_token, phone_number_id, business_account_id)
      VALUES ($1, $2, $3, $4)
    `, [userId, accessToken, phoneNumberId, businessAccountId]);
    return result;
  }

  async getMetaConfig(userId) {
    return await this.get('SELECT * FROM meta_configs WHERE user_id = $1 AND is_active = true', [userId]);
  }

  async getAllUsers() {
    return await this.all('SELECT id, email, name, company, created_at FROM users ORDER BY created_at DESC');
  }

  async deleteUser(userId) {
    await this.run('DELETE FROM sessions WHERE user_id = $1', [userId]);
    return await this.run('DELETE FROM users WHERE id = $1', [userId]);
  }

  async updateSessionWebhook(sessionId, webhookUrl) {
    return await this.run(
      'UPDATE sessions SET webhook_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [webhookUrl, sessionId]
    );
  }

  async getSessionWebhook(sessionId) {
    const session = await this.get('SELECT webhook_url FROM sessions WHERE id = $1', [sessionId]);
    return session?.webhook_url || null;
  }

  async deleteOldMessages(hoursOld = 24) {
    try {
      const result = await this.run(`
        DELETE FROM messages
        WHERE created_at < NOW() - INTERVAL '${hoursOld} hours'
      `);
      console.log(`🧹 Limpeza automática: ${result.changes || 0} mensagens antigas removidas (>${hoursOld}h)`);
      return result.changes || 0;
    } catch (error) {
      console.error('❌ Erro ao deletar mensagens antigas:', error.message);
      return 0;
    }
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = DatabaseManager;
