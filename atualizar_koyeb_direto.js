const https = require('https');

const KOYEB_API_KEY = 'b59qraoufe3brffyp75c10hrx90opmfwj7xcaokpjy9j2i5mxfo524fyjxy26yvj';
const NEW_DATABASE_URL = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

async function atualizarKoyeb() {
  console.log('🔄 Atualizando Koyeb com conexão DIRETA...\n');

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

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });

  const service = servicesData.services.find(s => 
    s.name.includes('whatsapp') || s.name.includes('api')
  );

  if (!service) {
    console.log('❌ Serviço não encontrado');
    return;
  }

  console.log(`📦 Serviço: ${service.name}`);
  console.log(`🆔 ID: ${service.id}\n`);

  const fullService = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.koyeb.com',
      path: `/v1/services/${service.id}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KOYEB_API_KEY}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    req.on('error', reject);
    req.end();
  });

  const definition = fullService.service.latest_deployment_definition;
  
  const envIndex = definition.env.findIndex(e => e.key === 'DATABASE_URL');
  if (envIndex !== -1) {
    definition.env[envIndex].value = NEW_DATABASE_URL;
  } else {
    definition.env.push({ key: 'DATABASE_URL', value: NEW_DATABASE_URL });
  }

  const updatePayload = JSON.stringify({ definition });

  console.log('🔄 Atualizando DATABASE_URL para conexão DIRETA...');
  console.log(`📡 Nova URL: ${NEW_DATABASE_URL}\n`);

  const updateResult = await new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.koyeb.com',
      path: `/v1/services/${service.id}`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${KOYEB_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(updatePayload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Status ${res.statusCode}: ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.write(updatePayload);
    req.end();
  });

  console.log('✅ Koyeb atualizado com sucesso!');
  console.log('⏳ Aguarde 1-2 minutos para o deploy completar');
}

atualizarKoyeb().catch(console.error);
