const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';
const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const KOYEB_API = 'https://app.koyeb.com/v1';

async function aguardarETestar() {
  console.log('⏳ AGUARDANDO DEPLOY E TESTANDO\n');

  try {
    console.log('1️⃣ Verificando status do deploy...');
    
    for (let i = 0; i < 12; i++) {
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      try {
        const servicesRes = await axios.get(`${KOYEB_API}/services`, {
          headers: { Authorization: `Bearer ${KOYEB_API_KEY}` }
        });

        const service = servicesRes.data.services.find(s => 
          s.name === 'whatsapp-api' || s.name.includes('whatsapp')
        );

        if (service) {
          const deploymentsRes = await axios.get(
            `${KOYEB_API}/deployments?service_id=${service.id}&limit=1`,
            { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
          );

          const latestDeployment = deploymentsRes.data.deployments?.[0];
          const status = latestDeployment?.status || 'UNKNOWN';
          
          console.log(`   [${i + 1}/12] Status: ${status}`);

          if (status === 'HEALTHY') {
            console.log('\n✅ Deploy concluído com sucesso!\n');
            break;
          }

          if (status === 'ERROR' || status === 'UNHEALTHY') {
            console.log('\n❌ Deploy falhou!');
            return;
          }
        }
      } catch (error) {
        console.log(`   [${i + 1}/12] Verificando...`);
      }
    }

    console.log('2️⃣ Testando login...');
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'admin@whatsapp.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    console.log('✅ Login OK!\n');

    console.log('3️⃣ Verificando sessão...');
    const mySessionRes = await axios.get(`${API_URL}/api/my-session`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`📊 Status: ${mySessionRes.data.status}`);
    
    if (mySessionRes.data.status !== 'connected') {
      console.log('\n⚠️ Sessão não conectada. Você precisa escanear o QR Code novamente.');
      console.log('Acesse: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/');
      return;
    }

    console.log('\n4️⃣ Testando envio de mensagem...');
    const sendRes = await axios.post(
      `${API_URL}/api/messages/send`,
      {
        to: '5511935001870',
        message: '✅ Sistema corrigido! Mensagem de teste enviada com sucesso!'
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    
    console.log('🎉 MENSAGEM ENVIADA COM SUCESSO!');
    console.log('📊 Resposta:', JSON.stringify(sendRes.data, null, 2));
    console.log('\n✅ SISTEMA 100% FUNCIONAL!');

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

aguardarETestar();
