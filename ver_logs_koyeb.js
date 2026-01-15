const axios = require('axios');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const KOYEB_API = 'https://app.koyeb.com/v1';

async function verLogs() {
  console.log('📋 VERIFICANDO LOGS DO KOYEB\n');

  try {
    console.log('1️⃣ Buscando serviço...');
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

    console.log(`✅ Serviço: ${service.name}\n`);

    console.log('2️⃣ Buscando último deployment...');
    const deploymentsRes = await axios.get(
      `${KOYEB_API}/deployments?service_id=${service.id}&limit=1`,
      { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
    );

    const deployment = deploymentsRes.data.deployments?.[0];
    if (!deployment) {
      console.error('❌ Nenhum deployment encontrado!');
      return;
    }

    console.log(`📊 Deployment ID: ${deployment.id}`);
    console.log(`📊 Status: ${deployment.status}`);
    console.log(`📊 Mensagem: ${deployment.messages?.[0] || 'N/A'}\n`);

    console.log('3️⃣ Buscando logs...');
    const logsRes = await axios.get(
      `${KOYEB_API}/deployments/${deployment.id}/logs`,
      { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
    );

    console.log('📋 LOGS:\n');
    if (logsRes.data.logs && logsRes.data.logs.length > 0) {
      logsRes.data.logs.slice(-50).forEach(log => {
        console.log(`[${log.timestamp}] ${log.message}`);
      });
    } else {
      console.log('Nenhum log disponível ainda.');
    }

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\n💡 Os logs podem não estar disponíveis ainda.');
      console.log('Acesse o painel do Koyeb para ver os logs em tempo real:');
      console.log('https://app.koyeb.com/');
    }
  }
}

verLogs();
