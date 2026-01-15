const axios = require('axios');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';

async function verificarKoyeb() {
  console.log('🔍 VERIFICANDO CONFIGURAÇÃO DO KOYEB\n');

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

    const serviceDetail = await axios.get(
      `https://app.koyeb.com/v1/services/${service.id}`,
      {
        headers: {
          'Authorization': `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const fullService = serviceDetail.data.service;

    console.log('📋 Status do serviço:', fullService.status, '\n');

    console.log('🔍 Buscando deployments...\n');

    const deploymentsResponse = await axios.get(
      `https://app.koyeb.com/v1/deployments?service_id=${service.id}`,
      {
        headers: {
          'Authorization': `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const deployments = deploymentsResponse.data.deployments || [];
    console.log(`✅ Encontrados ${deployments.length} deployments\n`);

    if (deployments.length > 0) {
      const latestDeployment = deployments[0];
      console.log(`📦 Último deployment: ${latestDeployment.id}`);
      console.log(`   Status: ${latestDeployment.status}\n`);

      const envVars = latestDeployment.definition?.env || [];
      console.log('📋 Variáveis de ambiente:\n');

      envVars.forEach(env => {
        if (env.key === 'DATABASE_URL') {
          console.log(`   ✅ ${env.key}:`);
          console.log(`      ${env.value}\n`);
        } else {
          console.log(`   ${env.key}: ${env.value}`);
        }
      });

      if (!envVars.find(e => e.key === 'DATABASE_URL')) {
        console.log('   ❌ DATABASE_URL NÃO ENCONTRADA!\n');
      }
    }

  } catch (erro) {
    console.error('❌ ERRO:', erro.response?.data || erro.message);
  }
}

verificarKoyeb();
