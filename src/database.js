const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

class DatabaseManager {
  constructor() {
    const dbPath = path.join(__dirname, '..', 'data', 'whatsapp.db');
    this.db = new sqlite3.Database(dbPath);

    this.initTables();
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async initTables() {
    await this.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'disconnected',
        phone_number TEXT,
        phone_name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        name TEXT,
        profile_pic TEXT,
        last_message_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
        timestamp INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS auto_replies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT NOT NULL,
        response_message TEXT NOT NULL,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS scheduled_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        message TEXT NOT NULL,
        media_url TEXT,
        scheduled_at DATETIME NOT NULL,
        status TEXT DEFAULT 'pending',
        sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);

    await this.run(`
      CREATE TABLE IF NOT EXISTS meta_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        access_token TEXT NOT NULL,
        phone_number_id TEXT NOT NULL,
        business_account_id TEXT,
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await this.run(`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_messages_contact ON messages(contact_phone)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_contacts_session ON contacts(session_id)`);
    await this.run(`CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`);

    const adminExists = await this.get('SELECT id FROM users WHERE email = ?', ['admin@flow.com']);
    if (!adminExists) {
      const hashedPassword = bcrypt.hashSync('admin123', 10);
      await this.run('INSERT INTO users (email, password, name, company) VALUES (?, ?, ?, ?)',
        ['admin@flow.com', hashedPassword, 'Administrador', 'Flow System']
      );
    }
  }

  async createUser(email, password, name, company = null) {
    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = await this.run(
      'INSERT INTO users (email, password, name, company) VALUES (?, ?, ?, ?)',
      [email, hashedPassword, name, company]
    );
    return result.lastID;
  }

  async getUserByEmail(email) {
    return await this.get('SELECT * FROM users WHERE email = ?', [email]);
  }

  async getUserById(id) {
    return await this.get('SELECT id, email, name, company, created_at FROM users WHERE id = ?', [id]);
  }

  verifyPassword(plainPassword, hashedPassword) {
    return bcrypt.compareSync(plainPassword, hashedPassword);
  }

  async createSession(sessionId, userId) {
    return await this.run('INSERT INTO sessions (id, user_id) VALUES (?, ?)', [sessionId, userId]);
  }

  async updateSessionStatus(sessionId, status, phoneNumber = null, phoneName = null) {
    return await this.run(
      'UPDATE sessions SET status = ?, phone_number = ?, phone_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [status, phoneNumber, phoneName, sessionId]
    );
  }

  async getSessionsByUserId(userId) {
    return await this.all('SELECT * FROM sessions WHERE user_id = ?', [userId]);
  }

  async getAllSessionsFromDB() {
    return await this.all('SELECT * FROM sessions');
  }

  async getSession(sessionId) {
    return await this.get('SELECT * FROM sessions WHERE id = ?', [sessionId]);
  }

  async deleteSession(sessionId) {
    return await this.run('DELETE FROM sessions WHERE id = ?', [sessionId]);
  }

  async saveMessage(messageData) {
    return await this.run(`
      INSERT INTO messages (id, session_id, contact_phone, message_type, body, media_url, media_mimetype, from_me, timestamp, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [messageData.id, messageData.sessionId, messageData.contactPhone, messageData.messageType,
        messageData.body, messageData.mediaUrl, messageData.mediaMimetype,
        messageData.fromMe ? 1 : 0, messageData.timestamp, messageData.status]
    );
  }

  async updateMessageStatus(messageId, status) {
    return await this.run('UPDATE messages SET status = ? WHERE id = ?', [status, messageId]);
  }

  async getMessagesByContact(sessionId, contactPhone, limit = 100) {
    return await this.all(`
      SELECT * FROM messages
      WHERE session_id = ? AND contact_phone = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `, [sessionId, contactPhone, limit]);
  }

  async getContactsBySession(sessionId) {
    return await this.all(`
      SELECT c.*,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = c.session_id AND m.contact_phone = c.phone_number AND m.from_me = 0 AND m.status = 'received') as unread_count
      FROM contacts c
      WHERE c.session_id = ?
      ORDER BY c.last_message_at DESC
    `, [sessionId]);
  }

  async upsertContact(sessionId, phoneNumber, name = null, profilePic = null) {
    const existing = await this.get(
      'SELECT id FROM contacts WHERE session_id = ? AND phone_number = ?',
      [sessionId, phoneNumber]
    );

    if (existing) {
      return await this.run(`
        UPDATE contacts SET
          name = COALESCE(?, name),
          profile_pic = COALESCE(?, profile_pic),
          last_message_at = CURRENT_TIMESTAMP
        WHERE session_id = ? AND phone_number = ?
      `, [name, profilePic, sessionId, phoneNumber]);
    } else {
      return await this.run(`
        INSERT INTO contacts (session_id, phone_number, name, profile_pic, last_message_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [sessionId, phoneNumber, name, profilePic]);
    }
  }

  async createAutoReply(sessionId, triggerType, triggerValue, responseMessage) {
    const result = await this.run(`
      INSERT INTO auto_replies (session_id, trigger_type, trigger_value, response_message)
      VALUES (?, ?, ?, ?)
    `, [sessionId, triggerType, triggerValue, responseMessage]);
    return result;
  }

  async getAutoReplies(sessionId) {
    return await this.all('SELECT * FROM auto_replies WHERE session_id = ? AND is_active = 1', [sessionId]);
  }

  async deleteAutoReply(id) {
    return await this.run('DELETE FROM auto_replies WHERE id = ?', [id]);
  }

  async createScheduledMessage(sessionId, contactPhone, message, mediaUrl, scheduledAt) {
    const result = await this.run(`
      INSERT INTO scheduled_messages (session_id, contact_phone, message, media_url, scheduled_at)
      VALUES (?, ?, ?, ?, ?)
    `, [sessionId, contactPhone, message, mediaUrl, scheduledAt]);
    return result;
  }

  async getPendingScheduledMessages() {
    return await this.all(`
      SELECT * FROM scheduled_messages
      WHERE status = 'pending' AND scheduled_at <= datetime('now')
    `);
  }

  async updateScheduledMessageStatus(id, status, sentAt = null) {
    return await this.run(
      'UPDATE scheduled_messages SET status = ?, sent_at = ? WHERE id = ?',
      [status, sentAt, id]
    );
  }

  async saveMetaConfig(userId, accessToken, phoneNumberId, businessAccountId = null) {
    const result = await this.run(`
      INSERT INTO meta_configs (user_id, access_token, phone_number_id, business_account_id)
      VALUES (?, ?, ?, ?)
    `, [userId, accessToken, phoneNumberId, businessAccountId]);
    return result;
  }

  async getMetaConfig(userId) {
    return await this.get('SELECT * FROM meta_configs WHERE user_id = ? AND is_active = 1', [userId]);
  }

  close() {
    this.db.close();
  }
}

module.exports = DatabaseManager;
