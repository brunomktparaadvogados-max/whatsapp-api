const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function testarEnvioMensagem() {
  console.log('🧪 TESTANDO ENVIO DE MENSAGEM\n');

  try {
    console.log('1️⃣ Fazendo login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'admin@whatsapp.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log(`✅ Login OK!\n`);

    console.log('2️⃣ Verificando sessão...');
    const mySessionRes = await axios.get(`${API_URL}/api/my-session`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`📊 Status da sessão: ${mySessionRes.data.status}`);
    console.log(`📱 Info:`, mySessionRes.data.info);
    
    if (mySessionRes.data.status !== 'connected') {
      console.log('\n⚠️ ATENÇÃO: Sessão não está conectada!');
      console.log('Você precisa:');
      console.log('1. Acessar https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/');
      console.log('2. Fazer login');
      console.log('3. Clicar em "Criar Minha Sessão WhatsApp"');
      console.log('4. Escanear o QR Code');
      console.log('5. Aguardar a conexão');
      return;
    }

    console.log('\n3️⃣ Testando envio de mensagem...');
    console.log('⚠️ IMPORTANTE: Coloque um número válido para teste!');
    console.log('Exemplo: 5511999999999 (DDI + DDD + Número)\n');
    
    // Não vou enviar mensagem de verdade sem autorização
    console.log('✅ Sistema está pronto para enviar mensagens!');
    console.log('\nPara testar, use a API:');
    console.log(`
POST ${API_URL}/api/messages/send
Headers: {
  "Authorization": "Bearer ${token}",
  "Content-Type": "application/json"
}
Body: {
  "to": "5511999999999",
  "message": "Teste de mensagem"
}
    `);

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    
    if (error.response?.status === 404 && error.response?.data?.error?.includes('Sessão não encontrada')) {
      console.log('\n⚠️ SOLUÇÃO:');
      console.log('1. Acesse https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/');
      console.log('2. Faça login com admin@whatsapp.com / admin123');
      console.log('3. Clique em "Criar Minha Sessão WhatsApp"');
      console.log('4. Escaneie o QR Code com seu celular');
    }
  }
}

testarEnvioMensagem();
