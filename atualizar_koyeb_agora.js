const axios = require('axios');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const NEW_DATABASE_URL = 'postgresql://postgres.rrgcwlbhfudjdfshtmaq:Advogado255@aws-0-us-east-1.pooler.supabase.com:6543/postgres';

async function atualizarKoyeb() {
  console.log('🚀 ATUALIZANDO KOYEB\n');

  try {
    console.log('📡 Buscando serviços...\n');

    const servicesResponse = await axios.get(
      'https://app.koyeb.com/v1/services',
      {
        headers: {
          'Authorization': `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const services = servicesResponse.data.services || [];
    console.log(`✅ Encontrados ${services.length} serviços\n`);

    const targetService = services.find(s => s.name.includes('whatsapp') || s.name.includes('racial'));

    if (!targetService) {
      console.error('❌ Serviço não encontrado!');
      return;
    }

    console.log(`✅ Serviço encontrado: ${targetService.name} (${targetService.id})\n`);

    console.log('📡 Buscando detalhes completos do serviço...\n');

    const serviceDetailResponse = await axios.get(
      `https://app.koyeb.com/v1/services/${targetService.id}`,
      {
        headers: {
          'Authorization': `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const serviceDetail = serviceDetailResponse.data.service;

    console.log('🔄 Atualizando DATABASE_URL...\n');

    const definition = serviceDetail.latest_deployment?.definition || serviceDetail.definition || {};
    const envVars = definition.env || [];

    const updatedEnv = envVars.map(env => {
      if (env.key === 'DATABASE_URL') {
        console.log(`   📝 Atualizando DATABASE_URL existente`);
        return { key: 'DATABASE_URL', value: NEW_DATABASE_URL };
      }
      return env;
    });

    if (!updatedEnv.find(env => env.key === 'DATABASE_URL')) {
      console.log(`   ➕ Adicionando DATABASE_URL nova`);
      updatedEnv.push({ key: 'DATABASE_URL', value: NEW_DATABASE_URL });
    }

    const updatePayload = {
      definition: {
        ...definition,
        env: updatedEnv
      }
    };

    await axios.patch(
      `https://app.koyeb.com/v1/services/${targetService.id}`,
      updatePayload,
      {
        headers: {
          'Authorization': `Bearer ${KOYEB_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ DATABASE_URL atualizada!\n');
    console.log('🔄 Koyeb está fazendo redeploy automático...\n');
    console.log('⏳ Aguarde 1-2 minutos para o deploy completar\n');
    console.log('🎉 CONFIGURAÇÃO CONCLUÍDA!\n');
    console.log('📋 Acesse: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/');
    console.log('   📧 Email: admin@whatsapp.com');
    console.log('   🔑 Senha: admin123\n');

  } catch (erro) {
    console.error('❌ ERRO:', erro.response?.data || erro.message);
    console.error('\n⚠️  Atualize manualmente:');
    console.error('   1. Acesse: https://app.koyeb.com/');
    console.error('   2. Vá em Services > whatsapp-api');
    console.error('   3. Clique em Settings > Environment variables');
    console.error('   4. Atualize DATABASE_URL para:');
    console.error(`      ${NEW_DATABASE_URL}`);
    console.error('   5. Clique em Save e aguarde o redeploy\n');
  }
}

atualizarKoyeb();
