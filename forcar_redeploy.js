const axios = require('axios');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';

async function forcarRedeploy() {
  console.log('🔄 FORÇANDO REDEPLOY NO KOYEB\n');
  
  try {
    const servicesResponse = await axios.get(
      'https://app.koyeb.com/v1/services',
      {
        headers: {
          'Authorization': `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const service = servicesResponse.data.services[0];
    console.log(`✅ Serviço: ${service.name}\n`);
    
    console.log('🔄 Forçando redeploy...\n');
    
    await axios.post(
      `https://app.koyeb.com/v1/services/${service.id}/redeploy`,
      {},
      {
        headers: {
          'Authorization': `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Redeploy iniciado!\n');
    console.log('⏳ Aguarde 1-2 minutos para o deploy completar\n');
    
  } catch (erro) {
    console.error('❌ ERRO:', erro.response?.data || erro.message);
  }
}

forcarRedeploy();
