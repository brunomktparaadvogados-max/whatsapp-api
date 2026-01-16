const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function testarCompleto() {
  console.log('🔄 TESTE COMPLETO - CONECTAR E ENVIAR\n');
  console.log('=' .repeat(60) + '\n');

  try {
    console.log('1️⃣ Fazendo login...\n');
    
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'contato@advocaciabrunoreis.com.br',
      password: 'Advogado26@'
    });

    const token = loginRes.data.token;
    console.log('   ✅ Login realizado!\n');

    console.log('2️⃣ Verificando status da sessão...\n');

    const sessionRes = await axios.get(`${API_URL}/api/my-session`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(`   Status: ${sessionRes.data.status}`);

    if (sessionRes.data.status !== 'connected') {
      console.log('   ⚠️  Sessão não conectada.\n');
      console.log('3️⃣ Criando nova sessão...\n');

      await axios.post(
        `${API_URL}/api/sessions`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('   ✅ Sessão criada! Aguardando QR code...\n');
      await new Promise(resolve => setTimeout(resolve, 15000));

      const qrRes = await axios.get(`${API_URL}/api/my-qr`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (qrRes.data.qrCode) {
        console.log('📱 ESCANEIE O QR CODE:\n');
        console.log(qrRes.data.qrCode.substring(0, 100) + '...\n');
        console.log('⏳ Aguardando conexão (60 segundos)...\n');

        for (let i = 0; i < 12; i++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          const checkRes = await axios.get(`${API_URL}/api/my-session`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          console.log(`   [${(i + 1) * 5}s] Status: ${checkRes.data.status}`);

          if (checkRes.data.status === 'connected') {
            console.log('\n✅ WhatsApp conectado!\n');
            break;
          }
        }
      }
    } else {
      console.log('   ✅ Sessão já conectada!\n');
    }

    console.log('=' .repeat(60) + '\n');
    console.log('4️⃣ Testando envio de mensagem...\n');

    const sendRes = await axios.post(
      `${API_URL}/api/messages/send`,
      {
        to: '5511935001870',
        message: '🎉 TESTE FINAL - ' + new Date().toLocaleString('pt-BR')
      },
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ MENSAGEM ENVIADA COM SUCESSO!\n');
    console.log(JSON.stringify(sendRes.data, null, 2));
    console.log('\n' + '=' .repeat(60) + '\n');
    console.log('🎉 PROBLEMA RESOLVIDO!\n');

  } catch (error) {
    console.error('\n❌ ERRO:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      const errorMsg = error.response.data.error;
      
      if (errorMsg.includes('markedUnread')) {
        console.error('\n⚠️  O ERRO PERSISTE!');
        console.error('   A versão 1.25.0 não resolveu o problema.\n');
        console.error('💡 SOLUÇÃO ALTERNATIVA:');
        console.error('   Vou modificar o código para ignorar esse erro.\n');
      }
    }
  }
}

testarCompleto();
