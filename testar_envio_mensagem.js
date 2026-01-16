const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function testarEnvio() {
  console.log('🧪 TESTANDO ENVIO DE MENSAGEM\n');
  console.log('=' .repeat(60) + '\n');

  try {
    console.log('1️⃣ Fazendo login...\n');
    
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'contato@advocaciabrunoreis.com.br',
      password: 'Advogado26@'
    });

    console.log('   ✅ Login realizado com sucesso!');
    console.log(`   Token: ${loginRes.data.token.substring(0, 20)}...`);
    console.log(`   User ID: ${loginRes.data.user.id}`);
    console.log(`   Session ID: ${loginRes.data.sessionId}`);
    console.log(`   Session Status: ${loginRes.data.sessionStatus}\n`);

    const token = loginRes.data.token;
    const sessionId = loginRes.data.sessionId;

    console.log('=' .repeat(60) + '\n');
    console.log('2️⃣ Verificando status da sessão...\n');

    const sessionRes = await axios.get(`${API_URL}/api/my-session`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(`   Status: ${sessionRes.data.status}`);
    console.log(`   Session ID: ${sessionRes.data.sessionId}`);
    if (sessionRes.data.info) {
      console.log(`   Telefone: ${sessionRes.data.info.wid}`);
      console.log(`   Nome: ${sessionRes.data.info.pushname}\n`);
    } else {
      console.log(`   ⚠️  Sessão não tem informações de conexão\n`);
    }

    if (sessionRes.data.status !== 'connected') {
      console.log('   ❌ Sessão não está conectada!');
      console.log(`   Status atual: ${sessionRes.data.status}`);
      console.log('   Por favor, conecte o WhatsApp primeiro.\n');
      return;
    }

    console.log('=' .repeat(60) + '\n');
    console.log('3️⃣ Tentando enviar mensagem de teste...\n');

    const sendRes = await axios.post(
      `${API_URL}/api/messages/send`,
      {
        to: '5511935001870',
        message: 'Teste de envio via API - ' + new Date().toLocaleString('pt-BR')
      },
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('   ✅ MENSAGEM ENVIADA COM SUCESSO!');
    console.log(`   Response:`, JSON.stringify(sendRes.data, null, 2));
    console.log('\n');

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    
    if (error.response) {
      console.error('\n📋 Detalhes do erro:');
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    
    if (error.code) {
      console.error('   Code:', error.code);
    }
  }

  console.log('\n' + '=' .repeat(60) + '\n');
}

testarEnvio();
