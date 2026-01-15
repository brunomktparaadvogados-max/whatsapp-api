const https = require('https');

const API_URL = 'racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

function makeRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: API_URL,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      const payload = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const req = https.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function testAPI() {
  console.log('🧪 Testando API WhatsApp...\n');

  try {
    // 1. Criar conta
    console.log('1️⃣ Criando conta de teste...');
    const timestamp = Date.now();
    const registerRes = await makeRequest('POST', '/api/auth/register', {
      username: 'teste_' + timestamp,
      password: 'Teste123!',
      email: `teste${timestamp}@teste.com`,
      name: 'Usuário Teste'
    });
    
    if (registerRes.status !== 201 && registerRes.status !== 200) {
      throw new Error(`Falha ao criar conta: ${registerRes.status} - ${JSON.stringify(registerRes.data)}`);
    }
    console.log('   ✅ Conta criada com sucesso\n');

    // 2. Fazer login
    console.log('2️⃣ Fazendo login...');
    const loginRes = await makeRequest('POST', '/api/auth/login', {
      email: `teste${timestamp}@teste.com`,
      password: 'Teste123!'
    });
    
    if (loginRes.status !== 200 || !loginRes.data.token) {
      throw new Error(`Falha no login: ${loginRes.status} - ${JSON.stringify(loginRes.data)}`);
    }
    
    const token = loginRes.data.token;
    console.log('   ✅ Login realizado com sucesso\n');

    // 3. Criar sessão WhatsApp
    console.log('3️⃣ Criando sessão WhatsApp...');
    const sessionRes = await new Promise((resolve, reject) => {
      const options = {
        hostname: API_URL,
        path: '/api/sessions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, data: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, data: data });
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    if (sessionRes.status !== 201 && sessionRes.status !== 200) {
      throw new Error(`Falha ao criar sessão: ${sessionRes.status} - ${JSON.stringify(sessionRes.data)}`);
    }
    console.log('   ✅ Sessão criada com sucesso');
    console.log(`   📱 Session ID: ${sessionRes.data.sessionId || sessionRes.data.session?.id}\n`);

    // 4. Verificar estrutura do banco
    console.log('4️⃣ Verificando banco de dados...');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: 'postgresql://postgres:Advogado26@@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres',
      ssl: { rejectUnauthorized: false }
    });

    const stats = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users) as users,
        (SELECT COUNT(*) FROM sessions) as sessions,
        (SELECT COUNT(*) FROM messages) as messages,
        pg_size_pretty(pg_database_size(current_database())) as db_size
    `);

    console.log(`   Usuários: ${stats.rows[0].users}`);
    console.log(`   Sessões: ${stats.rows[0].sessions}`);
    console.log(`   Mensagens: ${stats.rows[0].messages}`);
    console.log(`   Tamanho: ${stats.rows[0].db_size}\n`);

    await pool.end();

    console.log('✅ TODOS OS TESTES PASSARAM!\n');
    console.log('📊 RESUMO:');
    console.log('   ✅ Criação de conta: OK');
    console.log('   ✅ Login: OK');
    console.log('   ✅ Criação de sessão: OK');
    console.log('   ✅ Banco de dados: OK');
    console.log('   ✅ Sem erros de read-only: OK\n');
    console.log('🎉 API TOTALMENTE FUNCIONAL!\n');

  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error.message);
    console.error('\n📋 Detalhes:', error);
    process.exit(1);
  }
}

testAPI();
