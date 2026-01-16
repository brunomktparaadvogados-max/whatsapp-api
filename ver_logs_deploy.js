const axios = require('axios');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const KOYEB_API = 'https://app.koyeb.com/v1';

async function verificarLogs() {
  try {
    const servicesRes = await axios.get(`${KOYEB_API}/services`, {
      headers: { Authorization: `Bearer ${KOYEB_API_KEY}` }
    });

    const service = servicesRes.data.services.find(s => s.name === 'whatsapp-api');
    
    const deploymentsRes = await axios.get(
      `${KOYEB_API}/deployments?service_id=${service.id}&limit=1`,
      { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
    );

    const deployment = deploymentsRes.data.deployments[0];
    
    console.log('📋 ÚLTIMO DEPLOYMENT:\n');
    console.log(`   ID: ${deployment.id}`);
    console.log(`   Status: ${deployment.status}`);
    console.log(`   Created: ${new Date(deployment.created_at).toLocaleString('pt-BR')}`);
    console.log(`   Updated: ${new Date(deployment.updated_at).toLocaleString('pt-BR')}\n`);

    const logsRes = await axios.get(
      `${KOYEB_API}/deployments/${deployment.id}/logs?limit=100`,
      { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
    );

    console.log('📜 LOGS (últimas 50 linhas):\n');
    const logs = logsRes.data.logs || [];
    logs.slice(-50).forEach(log => {
      console.log(`   ${log.message}`);
    });

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

verificarLogs();
