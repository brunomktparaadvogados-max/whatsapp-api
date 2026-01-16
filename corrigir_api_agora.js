const { Client } = require('pg');
const axios = require('axios');

const DATABASE_URL = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';
const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const KOYEB_API = 'https://app.koyeb.com/v1';

async function corrigirAPI() {
  console.log('🔧 CORREÇÃO COMPLETA DA API WHATSAPP\n');
  console.log('=' .repeat(60) + '\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco Supabase\n');

    console.log('🗑️  PASSO 1: Limpando TODAS as sessões do banco...\n');
    
    const deleteResult = await client.query('DELETE FROM sessions RETURNING id');
    console.log(`   ✅ ${deleteResult.rowCount} sessões deletadas\n`);
    
    deleteResult.rows.forEach((row, index) => {
      console.log(`   ${index + 1}. ${row.id}`);
    });
    console.log('\n');

    console.log('=' .repeat(60) + '\n');
    console.log('🔄 PASSO 2: Forçando redeploy no Koyeb...\n');

    try {
      const servicesRes = await axios.get(`${KOYEB_API}/services`, {
        headers: { Authorization: `Bearer ${KOYEB_API_KEY}` }
      });

      const service = servicesRes.data.services.find(s => 
        s.name === 'whatsapp-api' || s.name.includes('whatsapp')
      );

      if (service) {
        console.log(`   📦 Serviço encontrado: ${service.name}`);
        console.log(`   🔄 Iniciando redeploy...\n`);

        const redeployRes = await axios.post(
          `${KOYEB_API}/services/${service.id}/redeploy`,
          {},
          { headers: { Authorization: `Bearer ${KOYEB_API_KEY}` } }
        );

        console.log(`   ✅ Redeploy iniciado com sucesso!`);
        console.log(`   ⏳ Aguarde 2-3 minutos para o deploy completar\n`);
      } else {
        console.log(`   ⚠️  Serviço não encontrado no Koyeb\n`);
      }
    } catch (error) {
      console.log(`   ❌ Erro ao fazer redeploy: ${error.message}\n`);
    }

    console.log('=' .repeat(60) + '\n');
    console.log('✅ CORREÇÃO CONCLUÍDA!\n');
    console.log('📋 PRÓXIMOS PASSOS:\n');
    console.log('   1. Aguarde 2-3 minutos para o Koyeb reiniciar');
    console.log('   2. Acesse: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/');
    console.log('   3. Faça login com: contato@advocaciabrunoreis.com.br');
    console.log('   4. Clique em "Criar Minha Sessão WhatsApp"');
    console.log('   5. Escaneie o QR Code com seu celular');
    console.log('   6. Aguarde a conexão e teste o envio de mensagem\n');

    console.log('=' .repeat(60) + '\n');
    console.log('⚠️  IMPORTANTE:\n');
    console.log('   - Todas as sessões foram deletadas');
    console.log('   - Todos os usuários precisarão reconectar o WhatsApp');
    console.log('   - O QR Code deve aparecer em ~30 segundos após criar sessão');
    console.log('   - Se o QR Code não aparecer, aguarde 1 minuto e recarregue a página\n');

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
    console.log('🔌 Conexão com banco encerrada\n');
  }
}

corrigirAPI();
