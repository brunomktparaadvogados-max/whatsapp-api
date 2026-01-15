const { Pool } = require('pg');
const axios = require('axios');

const pool = new Pool({
  connectionString: 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres'
});

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function corrigirSistema() {
  console.log('🔧 CORRIGINDO SISTEMA COMPLETO\n');

  try {
    console.log('1️⃣ Testando login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'admin@whatsapp.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    const userId = loginRes.data.user.id;
    console.log(`✅ Login OK! User ID: ${userId}`);
    console.log(`🔑 Token: ${token}\n`);

    console.log('2️⃣ Verificando sessões do usuário...');
    const sessionsRes = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1',
      [userId]
    );
    
    console.log(`📊 Sessões encontradas: ${sessionsRes.rows.length}`);
    sessionsRes.rows.forEach(s => {
      console.log(`   - ID: ${s.id}, Status: ${s.status}, Conectado: ${s.is_connected}`);
    });

    if (sessionsRes.rows.length === 0) {
      console.log('\n3️⃣ Criando sessão automática...');
      const createRes = await axios.post(
        `${API_URL}/api/sessions`,
        { sessionId: `user_${userId}` },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log(`✅ Sessão criada: ${createRes.data.sessionId}`);
    } else {
      console.log('\n3️⃣ Sessão já existe!');
    }

    console.log('\n4️⃣ Listando todas as sessões...');
    const allSessionsRes = await axios.get(`${API_URL}/api/sessions`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log(`📋 Total de sessões: ${allSessionsRes.data.sessions.length}`);
    allSessionsRes.data.sessions.forEach(s => {
      console.log(`   - ${s.id}: ${s.status} (Conectado: ${s.isConnected})`);
    });

    console.log('\n5️⃣ Verificando estrutura das tabelas...');
    const tablesRes = await pool.query(`
      SELECT table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      ORDER BY table_name, ordinal_position
    `);
    
    const tables = {};
    tablesRes.rows.forEach(row => {
      if (!tables[row.table_name]) tables[row.table_name] = [];
      tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
    });
    
    console.log('📊 Estrutura do banco:');
    Object.keys(tables).forEach(table => {
      console.log(`\n   ${table}:`);
      tables[table].forEach(col => console.log(`      - ${col}`));
    });

    console.log('\n\n✅ DIAGNÓSTICO COMPLETO!');
    console.log('\n📝 PRÓXIMOS PASSOS:');
    console.log('   1. Faça login na aplicação com admin@whatsapp.com / admin123');
    console.log('   2. Clique em "Criar Minha Sessão WhatsApp"');
    console.log('   3. Escaneie o QR Code');
    console.log('   4. Teste enviar mensagem');

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Detalhes:', JSON.stringify(error.response.data, null, 2));
    }
  } finally {
    await pool.end();
  }
}

corrigirSistema();
