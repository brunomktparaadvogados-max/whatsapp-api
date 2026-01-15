const https = require('https');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';

async function verificarStatus() {
  console.log('🔍 Verificando status do Koyeb...\n');

  const servicesData = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.koyeb.com',
      path: '/v1/services',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KOYEB_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  if (!servicesData.services || servicesData.services.length === 0) {
    console.log('❌ Nenhum serviço encontrado');
    return;
  }

  const service = servicesData.services[0];
  console.log(`📦 Serviço: ${service.name}`);
  console.log(`🆔 ID: ${service.id}`);
  console.log(`📊 Status: ${service.status}`);
  console.log(`🌐 URL: ${service.app_url || 'N/A'}\n`);

  const deploymentsData = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.koyeb.com',
      path: `/v1/deployments?service_id=${service.id}&limit=5`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KOYEB_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    https.get(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    }).on('error', reject);
  });

  console.log('📋 Últimos deployments:\n');
  deploymentsData.deployments.slice(0, 3).forEach((dep, i) => {
    console.log(`${i + 1}. ${dep.id}`);
    console.log(`   Status: ${dep.status}`);
    console.log(`   Criado: ${new Date(dep.created_at).toLocaleString()}`);
    if (dep.messages && dep.messages.length > 0) {
      console.log(`   Mensagens:`);
      dep.messages.forEach(msg => console.log(`     - ${msg}`));
    }
    console.log('');
  });
}

verificarStatus().catch(console.error);
