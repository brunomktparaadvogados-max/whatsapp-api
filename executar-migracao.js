const { Client } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada no .env');
  process.exit(1);
}

const migrationSQL = `
-- Backup da tabela antiga
CREATE TABLE IF NOT EXISTS messages_backup AS SELECT * FROM messages;

-- Dropar tabela antiga
DROP TABLE IF EXISTS messages CASCADE;

-- Recriar com schema correto
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

-- Criar índices
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_contact_phone ON messages(contact_phone);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_from_me ON messages(from_me);
CREATE INDEX idx_messages_status ON messages(status);
`;

async function executeMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('🔄 Conectando ao banco de dados...');
    await client.connect();
    console.log('✅ Conectado!');

    console.log('🔄 Executando migração...');
    await client.query(migrationSQL);
    console.log('✅ Migração executada com sucesso!');

    console.log('🔍 Verificando estrutura da tabela...');
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'messages'
      ORDER BY ordinal_position;
    `);

    console.log('\n📋 Estrutura da tabela messages:');
    console.table(result.rows);

    console.log('\n✅ Migração concluída com sucesso!');
    console.log('🎉 A tabela messages está pronta para receber mensagens!');
    
  } catch (error) {
    console.error('❌ Erro ao executar migração:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

executeMigration();
