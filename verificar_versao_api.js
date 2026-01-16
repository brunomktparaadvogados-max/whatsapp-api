const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function verificarVersao() {
  try {
    console.log('🔍 VERIFICANDO VERSÃO DO WHATSAPP-WEB.JS\n');
    console.log('=' .repeat(60) + '\n');

    const healthRes = await axios.get(`${API_URL}/health`);
    
    console.log('📋 Informações da API:\n');
    console.log(`   Status: ${healthRes.data.status}`);
    console.log(`   Uptime: ${healthRes.data.uptime}\n`);

    console.log('=' .repeat(60) + '\n');
    console.log('🧪 Testando envio de mensagem...\n');

    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'contato@advocaciabrunoreis.com.br',
      password: 'Advogado26@'
    });

    const token = loginRes.data.token;

    const sendRes = await axios.post(
      `${API_URL}/api/messages/send`,
      {
        to: '5511935001870',
        message: 'Teste após atualização - ' + new Date().toLocaleString('pt-BR')
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

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    
    if (error.response?.data?.error) {
      const errorMsg = error.response.data.error;
      
      if (errorMsg.includes('markedUnread')) {
        console.error('\n⚠️  PROBLEMA: A versão antiga ainda está sendo usada!');
        console.error('   O Koyeb não atualizou as dependências.\n');
        console.error('💡 SOLUÇÃO: Vou forçar a limpeza do cache do Koyeb.\n');
      }
    }
  }
}

verificarVersao();
