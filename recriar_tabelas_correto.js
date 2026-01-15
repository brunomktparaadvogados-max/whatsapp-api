const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const PROJETO_DB = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

async function recriarTabelas() {
  console.log('🚀 RECRIANDO TABELAS COM ESTRUTURA CORRETA\n');
  
  const client = new Client({ 
    connectionString: PROJETO_DB,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');

    console.log('🗑️  Removendo tabelas antigas...\n');
    
    await client.query(`
      DROP TABLE IF EXISTS scheduled_messages CASCADE;
      DROP TABLE IF EXISTS auto_replies CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS contacts CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP FUNCTION IF EXISTS delete_old_messages();
    `);
    
    console.log('✅ Tabelas removidas!\n');

    console.log('📋 Criando tabelas com estrutura correta...\n');
    
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status TEXT DEFAULT 'disconnected',
        phone_number TEXT,
        phone_name TEXT,
        webhook_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE contacts (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        phone_number TEXT NOT NULL,
        name TEXT,
        profile_pic TEXT,
        last_message_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(session_id, phone_number),
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE messages (
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
      );

      CREATE TABLE auto_replies (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        trigger_type TEXT NOT NULL,
        trigger_value TEXT NOT NULL,
        response_message TEXT NOT NULL,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE TABLE scheduled_messages (
        id SERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        contact_phone TEXT NOT NULL,
        message TEXT NOT NULL,
        scheduled_time TIMESTAMP NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      );

      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_status ON sessions(status);
      CREATE INDEX idx_messages_session_id ON messages(session_id);
      CREATE INDEX idx_messages_contact_phone ON messages(contact_phone);
      CREATE INDEX idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX idx_messages_created_at ON messages(created_at);
    `);
    
    console.log('✅ Tabelas criadas!\n');

    console.log('👤 Criando usuário admin...\n');
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await client.query(
      'INSERT INTO users (email, password, name, company) VALUES ($1, $2, $3, $4)',
      ['admin@whatsapp.com', hashedPassword, 'Administrador', 'Sistema']
    );
    
    console.log('✅ Usuário admin criado!');
    console.log('   📧 Email: admin@whatsapp.com');
    console.log('   🔑 Senha: admin123\n');

    console.log('🧹 Configurando limpeza automática...\n');
    
    await client.query(`
      CREATE OR REPLACE FUNCTION delete_old_messages()
      RETURNS void AS $$
      BEGIN
        DELETE FROM messages 
        WHERE created_at < NOW() - INTERVAL '24 hours';
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Função de limpeza criada!\n');
    
    console.log('🎉 BANCO CONFIGURADO COM SUCESSO!\n');
    console.log('📋 Agora teste o login na aplicação\n');
    
  } catch (erro) {
    console.error('❌ ERRO:', erro.message);
    console.error(erro);
  } finally {
    await client.end();
  }
}

recriarTabelas();
