const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function testarEnvioReal() {
  console.log('🧪 TESTANDO ENVIO REAL DE MENSAGEM\n');

  try {
    console.log('1️⃣ Fazendo login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'admin@whatsapp.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log(`✅ Login OK!\n`);

    console.log('2️⃣ Enviando mensagem de teste para o próprio número...');
    console.log('   (Enviando para 5511935001870 - o próprio número conectado)\n');
    
    const sendRes = await axios.post(
      `${API_URL}/api/messages/send`,
      {
        to: '5511935001870',
        message: '🧪 Teste automático - Sistema funcionando!'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    console.log('✅ MENSAGEM ENVIADA COM SUCESSO!');
    console.log('📊 Resposta:', JSON.stringify(sendRes.data, null, 2));

  } catch (error) {
    console.error('❌ ERRO AO ENVIAR MENSAGEM:');
    console.error('Status:', error.response?.status);
    console.error('Dados:', JSON.stringify(error.response?.data, null, 2));
    console.error('Mensagem:', error.message);
    
    if (error.response?.data?.error?.includes('evaluation')) {
      console.log('\n🔍 ERRO "EVALUATION FAILED" DETECTADO!');
      console.log('Isso geralmente acontece quando:');
      console.log('1. O Puppeteer/Chromium está com problema');
      console.log('2. A página do WhatsApp Web mudou');
      console.log('3. A biblioteca whatsapp-web.js está desatualizada');
      console.log('\n💡 SOLUÇÃO:');
      console.log('Vou atualizar a biblioteca whatsapp-web.js para a versão mais recente...');
    }
  }
}

testarEnvioReal();
