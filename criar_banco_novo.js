const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const PROJETO_NOVO_DB = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

async function criarBancoNovo() {
  console.log('🚀 RECRIANDO BANCO DE DADOS DO ZERO\n');

  const client = new Client({
    connectionString: PROJETO_NOVO_DB,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao projeto NOVO (rrgcwlbhfudjdfshtmaq)\n');

    console.log('🗑️  PASSO 1: Limpando tabelas antigas...\n');

    await client.query(`
      DROP TABLE IF EXISTS messages CASCADE;
      DROP TABLE IF EXISTS sessions CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
      DROP FUNCTION IF EXISTS delete_old_messages();
    `);

    console.log('✅ Tabelas antigas removidas!\n');

    console.log('📋 PASSO 2: Criando tabelas novas...\n');

    await client.query(`
      -- Tabela de usuários
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de sessões WhatsApp
      CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        status TEXT DEFAULT 'disconnected',
        qr_code TEXT,
        phone_number TEXT,
        webhook_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      -- Tabela de mensagens (com auto-delete após 24h)
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

      -- Índices para performance
      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_status ON sessions(status);
      CREATE INDEX idx_messages_session_id ON messages(session_id);
      CREATE INDEX idx_messages_contact_phone ON messages(contact_phone);
      CREATE INDEX idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX idx_messages_created_at ON messages(created_at);
    `);

    console.log('✅ Tabelas criadas!\n');

    console.log('👤 PASSO 3: Criando usuário admin padrão...\n');
    
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const { v4: uuidv4 } = require('uuid');
    const adminId = uuidv4();

    await client.query(
      'INSERT INTO users (id, email, password, name, company) VALUES ($1, $2, $3, $4, $5)',
      [adminId, 'admin@whatsapp.com', hashedPassword, 'Administrador', 'Sistema']
    );

    console.log('✅ Usuário admin criado!');
    console.log('   📧 Email: admin@whatsapp.com');
    console.log('   🔑 Senha: admin123\n');

    console.log('🧹 PASSO 4: Configurando limpeza automática de mensagens...\n');
    
    await client.query(`
      -- Função para deletar mensagens antigas
      CREATE OR REPLACE FUNCTION delete_old_messages()
      RETURNS void AS $$
      BEGIN
        DELETE FROM messages 
        WHERE created_at < NOW() - INTERVAL '24 hours';
      END;
      $$ LANGUAGE plpgsql;
    `);
    
    console.log('✅ Função de limpeza criada!\n');
    
    console.log('🎉 BANCO DE DADOS CONFIGURADO COM SUCESSO!\n');
    console.log('📋 Próximos passos:');
    console.log('   1. Atualizar DATABASE_URL no Koyeb');
    console.log('   2. Fazer redeploy no Koyeb');
    console.log('   3. Acessar a aplicação e fazer login\n');
    
  } catch (erro) {
    console.error('❌ ERRO:', erro.message);
    console.error(erro);
  } finally {
    await client.end();
  }
}

criarBancoNovo();
