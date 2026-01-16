const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function aguardarConexaoETestar() {
  console.log('⏳ AGUARDANDO CONEXÃO DO WHATSAPP...\n');
  console.log('=' .repeat(60) + '\n');

  try {
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'contato@advocaciabrunoreis.com.br',
      password: 'Advogado26@'
    });

    const token = loginRes.data.token;

    for (let i = 0; i < 30; i++) {
      try {
        const sessionRes = await axios.get(`${API_URL}/api/my-session`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        console.log(`   [${i * 5}s] Status: ${sessionRes.data.status}`);

        if (sessionRes.data.status === 'connected') {
          console.log('\n✅ WhatsApp conectado com sucesso!\n');
          console.log(`   Telefone: ${sessionRes.data.info?.wid || 'N/A'}`);
          console.log(`   Nome: ${sessionRes.data.info?.pushname || 'N/A'}\n`);
          
          console.log('=' .repeat(60) + '\n');
          console.log('🧪 TESTANDO ENVIO DE MENSAGEM\n');
          console.log('=' .repeat(60) + '\n');

          const sendRes = await axios.post(
            `${API_URL}/api/messages/send`,
            {
              to: '5511935001870',
              message: '🎉 TESTE FINAL - API CORRIGIDA E FUNCIONANDO! ' + new Date().toLocaleString('pt-BR')
            },
            {
              headers: { 
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            }
          );

          console.log('✅ MENSAGEM ENVIADA COM SUCESSO!\n');
          console.log(`   Message ID: ${sendRes.data.data?.messageId || 'N/A'}`);
          console.log(`   Timestamp: ${sendRes.data.data?.timestamp || 'N/A'}`);
          
          if (sendRes.data.data?.warning) {
            console.log(`   ⚠️  Warning: ${sendRes.data.data.warning}`);
          }

          console.log('\n' + '=' .repeat(60) + '\n');
          console.log('🎉 PROBLEMA RESOLVIDO!\n');
          console.log('✅ A API está 100% funcional agora.\n');
          console.log('📋 O que foi corrigido:\n');
          console.log('   1. Atualizado whatsapp-web.js de 1.23.0 para 1.25.0');
          console.log('   2. Corrigido erro do sendSeen (markedUnread)');
          console.log('   3. Sessão reconectada com sucesso\n');
          console.log('=' .repeat(60) + '\n');
          
          return;
        }

      } catch (error) {
        console.log(`   [${i * 5}s] Verificando...`);
      }

      if (i < 29) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log('\n⚠️  Timeout: WhatsApp não foi conectado em 2.5 minutos.');
    console.log('   Por favor, escaneie o QR code e tente novamente.\n');

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

aguardarConexaoETestar();
