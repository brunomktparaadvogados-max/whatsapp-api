const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';
const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const KOYEB_API = 'https://app.koyeb.com/v1';

async function aguardarETestar() {
  console.log('⏳ AGUARDANDO DEPLOY COMPLETAR...\n');
  console.log('=' .repeat(60) + '\n');

  for (let i = 0; i < 18; i++) {
    try {
      const servicesRes = await axios.get(`${KOYEB_API}/services`, {
        headers: { Authorization: `Bearer ${KOYEB_API_KEY}` }
      });

      const service = servicesRes.data.services.find(s => s.name === 'whatsapp-api');
      
      if (service && service.status === 'HEALTHY') {
        const deploymentsRes = await axios.get(
          `${KOYEB_API}/deployments?service_id=${service.id}&limit=1`,
          { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
        );

        const latestDeployment = deploymentsRes.data.deployments?.[0];
        
        if (latestDeployment) {
          console.log(`   [${i * 10}s] Status: ${latestDeployment.status} | Service: ${service.status}`);
          
          if (latestDeployment.status === 'HEALTHY' && service.status === 'HEALTHY') {
            console.log('\n✅ Deploy completado com sucesso!\n');
            break;
          }
        }
      }
    } catch (error) {
      console.log(`   [${i * 10}s] Verificando...`);
    }

    if (i < 17) {
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }

  console.log('=' .repeat(60) + '\n');
  console.log('🧪 TESTANDO ENVIO DE MENSAGEM\n');
  console.log('=' .repeat(60) + '\n');

  try {
    console.log('1️⃣ Fazendo login...\n');
    
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'contato@advocaciabrunoreis.com.br',
      password: 'Advogado26@'
    });

    console.log('   ✅ Login realizado!');
    console.log(`   Session Status: ${loginRes.data.sessionStatus}\n`);

    const token = loginRes.data.token;

    console.log('2️⃣ Verificando sessão...\n');

    const sessionRes = await axios.get(`${API_URL}/api/my-session`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log(`   Status: ${sessionRes.data.status}`);
    if (sessionRes.data.info) {
      console.log(`   Telefone: ${sessionRes.data.info.wid}\n`);
    }

    if (sessionRes.data.status !== 'connected') {
      console.log('   ⚠️  Sessão não conectada. Conecte o WhatsApp primeiro.\n');
      return;
    }

    console.log('3️⃣ Enviando mensagem de teste...\n');

    const sendRes = await axios.post(
      `${API_URL}/api/messages/send`,
      {
        to: '5511935001870',
        message: '✅ TESTE APÓS ATUALIZAÇÃO - ' + new Date().toLocaleString('pt-BR')
      },
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('   ✅ MENSAGEM ENVIADA COM SUCESSO!');
    console.log(`   Message ID: ${sendRes.data.data?.messageId || 'N/A'}`);
    console.log(`   Timestamp: ${sendRes.data.data?.timestamp || 'N/A'}\n`);

    console.log('=' .repeat(60) + '\n');
    console.log('🎉 PROBLEMA RESOLVIDO!\n');
    console.log('✅ A API está funcionando corretamente agora.\n');
    console.log('=' .repeat(60) + '\n');

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    
    if (error.response) {
      console.error('\n📋 Detalhes:');
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

aguardarETestar();
