const axios = require('axios');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const KOYEB_API = 'https://app.koyeb.com/v1';

async function forcarRedeploy() {
  console.log('🔄 FORÇANDO REDEPLOY NO KOYEB\n');

  try {
    console.log('1️⃣ Buscando serviços...');
    const servicesRes = await axios.get(`${KOYEB_API}/services`, {
      headers: { Authorization: `Bearer ${KOYEB_API_KEY}` }
    });

    const service = servicesRes.data.services.find(s => 
      s.name === 'whatsapp-api' || s.name.includes('whatsapp')
    );

    if (!service) {
      console.error('❌ Serviço não encontrado!');
      return;
    }

    console.log(`✅ Serviço encontrado: ${service.name} (ID: ${service.id})\n`);

    console.log('2️⃣ Forçando redeploy...');
    const redeployRes = await axios.post(
      `${KOYEB_API}/services/${service.id}/redeploy`,
      {},
      { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
    );

    console.log('✅ Redeploy iniciado!');
    console.log('📊 Status:', redeployRes.data.deployment?.status || 'STARTING');
    console.log('\n⏳ Aguarde 2-3 minutos para o deploy completar...');
    console.log('🔗 Acesse: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/');

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

forcarRedeploy();
