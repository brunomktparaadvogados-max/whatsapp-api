const { Pool } = require('pg');

const NEW_DB = 'postgresql://postgres:Advogado26@@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: NEW_DB,
  ssl: { rejectUnauthorized: false }
});

async function recreateTables() {
  console.log('🔄 Recriando tabelas no schema correto...\n');

  try {
    console.log('1️⃣ Removendo tabelas antigas (se existirem)...');
    await pool.query('DROP TABLE IF EXISTS public.messages CASCADE');
    await pool.query('DROP TABLE IF EXISTS public.sessions CASCADE');
    await pool.query('DROP TABLE IF EXISTS public.users CASCADE');
    console.log('   ✅ Tabelas antigas removidas\n');

    console.log('2️⃣ Criando tabela users...');
    await pool.query(`
      CREATE TABLE public.users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(50),
        name VARCHAR(255),
        company VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Tabela users criada\n');

    console.log('3️⃣ Criando tabela sessions...');
    await pool.query(`
      CREATE TABLE public.sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES public.users(id) ON DELETE CASCADE,
        session_id VARCHAR(255) UNIQUE NOT NULL,
        qr_code TEXT,
        status VARCHAR(50) DEFAULT 'disconnected',
        phone_number VARCHAR(50),
        webhook_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('   ✅ Tabela sessions criada\n');

    console.log('4️⃣ Criando tabela messages...');
    await pool.query(`
      CREATE TABLE public.messages (
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
    console.log('   ✅ Tabela messages criada\n');

    console.log('5️⃣ Criando índices...');
    await pool.query('CREATE INDEX idx_messages_created_at ON public.messages(created_at)');
    await pool.query('CREATE INDEX idx_messages_session_id ON public.messages(session_id)');
    await pool.query('CREATE INDEX idx_sessions_user_id ON public.sessions(user_id)');
    console.log('   ✅ Índices criados\n');

    console.log('6️⃣ Verificando estrutura...');
    const tables = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      AND table_name IN ('users', 'sessions', 'messages')
      ORDER BY table_name
    `);
    
    console.log('   Tabelas criadas:');
    tables.rows.forEach(t => console.log(`   - ${t.table_name}`));

    console.log('\n✅ TABELAS RECRIADAS COM SUCESSO!\n');
    console.log('📋 Próximo passo: Reiniciar o deploy no Koyeb');
    console.log('   O banco está limpo e pronto para uso.\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

recreateTables();
