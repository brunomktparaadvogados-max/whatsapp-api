const { Pool } = require('pg');

const OLD_DB = 'postgresql://postgres:Advocaciawh@db.cuvbzzfspeugqbwavqkv.supabase.co:5432/postgres';
const NEW_DB = 'postgresql://postgres:Advogado26@@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

const oldPool = new Pool({
  connectionString: OLD_DB,
  ssl: { rejectUnauthorized: false }
});

const newPool = new Pool({
  connectionString: NEW_DB,
  ssl: { rejectUnauthorized: false }
});

async function migrateDatabase() {
  console.log('🔄 Iniciando migração para novo banco Supabase...\n');

  try {
    console.log('1️⃣ Criando tabelas no novo banco...');
    
    await newPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await newPool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        qr_code TEXT,
        status VARCHAR(50) DEFAULT 'disconnected',
        phone_number VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await newPool.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        session_id VARCHAR(255) NOT NULL,
        message_id VARCHAR(255),
        from_number VARCHAR(255),
        to_number VARCHAR(255),
        message_type VARCHAR(50),
        content TEXT,
        media_url TEXT,
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await newPool.query(`CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at)`);
    await newPool.query(`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`);
    
    console.log('   ✅ Tabelas criadas\n');

    console.log('2️⃣ Migrando usuários...');
    const users = await oldPool.query('SELECT * FROM users');
    
    for (const user of users.rows) {
      try {
        await newPool.query(
          `INSERT INTO users (id, username, password, email, phone, created_at, updated_at) 
           VALUES ($1, $2, $3, $4, $5, $6, $7) 
           ON CONFLICT (username) DO NOTHING`,
          [user.id, user.username, user.password, user.email, user.phone, user.created_at, user.updated_at]
        );
      } catch (err) {
        console.log(`   ⚠️  Usuário ${user.username} já existe, pulando...`);
      }
    }
    console.log(`   ✅ ${users.rows.length} usuários migrados\n`);

    console.log('3️⃣ Migrando sessões ativas...');

    const checkColumn = await oldPool.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'sessions' AND column_name = 'last_seen'
    `);

    let sessionsQuery = 'SELECT * FROM sessions';
    if (checkColumn.rows.length > 0) {
      sessionsQuery = 'SELECT * FROM sessions WHERE last_seen > NOW() - INTERVAL \'7 days\'';
    }

    const sessions = await oldPool.query(sessionsQuery);

    for (const session of sessions.rows) {
      try {
        const lastSeen = session.last_seen || session.updated_at || new Date();
        await newPool.query(
          `INSERT INTO sessions (user_id, session_id, qr_code, status, phone_number, created_at, updated_at, last_seen)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (session_id) DO NOTHING`,
          [session.user_id, session.session_id, session.qr_code, session.status,
           session.phone_number, session.created_at, session.updated_at, lastSeen]
        );
      } catch (err) {
        console.log(`   ⚠️  Sessão ${session.session_id} já existe, pulando...`);
      }
    }
    console.log(`   ✅ ${sessions.rows.length} sessões migradas\n`);

    console.log('4️⃣ Verificando novo banco...');
    const stats = await newPool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as total_users,
        (SELECT COUNT(*) FROM sessions) as total_sessions,
        (SELECT COUNT(*) FROM messages) as total_messages,
        pg_size_pretty(pg_database_size(current_database())) as database_size
    `);
    
    console.log(`   Usuários: ${stats.rows[0].total_users}`);
    console.log(`   Sessões: ${stats.rows[0].total_sessions}`);
    console.log(`   Mensagens: ${stats.rows[0].total_messages}`);
    console.log(`   Tamanho: ${stats.rows[0].database_size}\n`);

    console.log('✅ MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
    console.log('📋 PRÓXIMOS PASSOS:');
    console.log('   1. Acesse: https://app.koyeb.com/apps');
    console.log('   2. Selecione: racial-debby-1brunomktecomercial');
    console.log('   3. Settings → Environment Variables');
    console.log('   4. Atualize DATABASE_URL para:');
    console.log(`      ${NEW_DB}`);
    console.log('   5. Remova MONGODB_URI (se existir)');
    console.log('   6. Clique em Deploy\n');

  } catch (error) {
    console.error('❌ Erro durante migração:', error.message);
    console.error(error);
  } finally {
    await oldPool.end();
    await newPool.end();
  }
}

migrateDatabase();
