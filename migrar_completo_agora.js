const { createClient } = require('@supabase/supabase-js');
const { Client } = require('pg');

const PROJETO_NOVO_DB = 'postgresql://postgres.rrgcwlbhfudjdfshtmaq:Advogado26%40@aws-0-us-east-1.pooler.supabase.com:6543/postgres';
const PROJETO_ANTIGO_DB = 'postgresql://postgres:Advogado26@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

async function migrarCompleto() {
  console.log('🚀 INICIANDO MIGRAÇÃO COMPLETA\n');

  const clientNovo = new Client({
    connectionString: PROJETO_NOVO_DB,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await clientNovo.connect();
    console.log('✅ Conectado ao banco NOVO\n');

    console.log('📋 PASSO 1: Criando tabelas no projeto NOVO...\n');
    
    await clientNovo.query(`
      -- Tabela de usuários
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        name TEXT NOT NULL,
        company TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tabela de sessões WhatsApp
      CREATE TABLE IF NOT EXISTS sessions (
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

      -- Tabela de mensagens
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
      );

      -- Índices para performance
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status);
      CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
      CREATE INDEX IF NOT EXISTS idx_messages_contact_phone ON messages(contact_phone);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
    `);
    
    console.log('✅ Tabelas criadas com sucesso!\n');

    console.log('📥 PASSO 2: Extraindo usuários do projeto ANTIGO...\n');

    const clientAntigo = new Client({
      connectionString: PROJETO_ANTIGO_DB,
      ssl: { rejectUnauthorized: false }
    });
    
    await clientAntigo.connect();
    console.log('✅ Conectado ao banco ANTIGO (read-only)\n');
    
    const resultUsuarios = await clientAntigo.query('SELECT * FROM users');
    console.log(`✅ Encontrados ${resultUsuarios.rows.length} usuários\n`);
    
    if (resultUsuarios.rows.length === 0) {
      console.log('⚠️  Nenhum usuário encontrado no projeto antigo');
      console.log('   Criando usuário admin padrão...\n');
      
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await clientNovo.query(
        'INSERT INTO users (id, email, password, name, company) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
        ['admin-default', 'admin@whatsapp.com', hashedPassword, 'Administrador', 'Sistema']
      );
      
      console.log('✅ Usuário admin criado: admin@whatsapp.com / admin123\n');
    } else {
      console.log('👥 PASSO 3: Migrando usuários...\n');
      
      for (const usuario of resultUsuarios.rows) {
        try {
          await clientNovo.query(
            'INSERT INTO users (id, email, password, name, company, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (email) DO UPDATE SET name = $4, company = $5',
            [usuario.id, usuario.email, usuario.password, usuario.name, usuario.company, usuario.created_at, usuario.updated_at]
          );
          console.log(`   ✅ ${usuario.email}`);
        } catch (erro) {
          console.log(`   ⚠️  ${usuario.email} - ${erro.message}`);
        }
      }
      
      console.log(`\n✅ ${resultUsuarios.rows.length} usuários migrados!\n`);
    }
    
    await clientAntigo.end();
    
    console.log('🎉 MIGRAÇÃO CONCLUÍDA COM SUCESSO!\n');
    console.log('📋 Próximos passos:');
    console.log('   1. Atualizar DATABASE_URL no Koyeb');
    console.log('   2. Fazer redeploy da aplicação');
    console.log('   3. Testar login\n');
    
  } catch (erro) {
    console.error('❌ ERRO:', erro.message);
    console.error(erro);
  } finally {
    await clientNovo.end();
  }
}

migrarCompleto();
