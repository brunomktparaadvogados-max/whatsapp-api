const axios = require('axios');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const KOYEB_API = 'https://app.koyeb.com/v1';

async function atualizarAPI() {
  console.log('🔄 ATUALIZANDO API PARA CORRIGIR ERRO DE ENVIO\n');
  console.log('=' .repeat(60) + '\n');

  try {
    console.log('1️⃣ Buscando serviço whatsapp-api...\n');
    
    const servicesRes = await axios.get(`${KOYEB_API}/services`, {
      headers: { Authorization: `Bearer ${KOYEB_API_KEY}` }
    });

    const service = servicesRes.data.services.find(s => s.name === 'whatsapp-api');
    
    if (!service) {
      console.error('❌ Serviço whatsapp-api não encontrado!');
      return;
    }

    console.log(`   ✅ Serviço encontrado: ${service.id}`);
    console.log(`   Status: ${service.status}\n`);

    console.log('=' .repeat(60) + '\n');
    console.log('2️⃣ Forçando redeploy para atualizar dependências...\n');

    const redeployRes = await axios.post(
      `${KOYEB_API}/services/${service.id}/redeploy`,
      {},
      {
        headers: {
          Authorization: `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('   ✅ Redeploy iniciado com sucesso!');
    console.log(`   Deployment ID: ${redeployRes.data.deployment?.id || 'N/A'}\n`);

    console.log('=' .repeat(60) + '\n');
    console.log('✅ ATUALIZAÇÃO INICIADA COM SUCESSO!\n');
    console.log('📋 O que foi feito:\n');
    console.log('   1. Atualizado whatsapp-web.js de 1.23.0 para 1.25.0');
    console.log('   2. Iniciado redeploy no Koyeb\n');
    console.log('⏳ Aguarde 3-5 minutos para o deploy completar.\n');
    console.log('🔍 Depois, teste novamente o envio de mensagem.\n');
    console.log('=' .repeat(60) + '\n');

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

atualizarAPI();
