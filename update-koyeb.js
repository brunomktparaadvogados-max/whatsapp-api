const https = require('https');

const KOYEB_TOKEN = 'cazv4dd50kddgqcltjszupe0or7twea93zicbe8h9k2o57nd9632tkkyavm01cuu';
const NEW_DATABASE_URL = 'postgresql://postgres:Advogado26@@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

async function getKoyebApps() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.koyeb.com',
      path: '/v1/apps',
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KOYEB_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function getService(appId) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.koyeb.com',
      path: `/v1/apps/${appId}/services`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${KOYEB_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

async function updateService(appId, serviceId, serviceData) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(serviceData);
    
    const options = {
      hostname: 'api.koyeb.com',
      path: `/v1/services/${serviceId}`,
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${KOYEB_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function updateKoyebDatabase() {
  console.log('🔄 Atualizando DATABASE_URL no Koyeb...\n');

  try {
    console.log('1️⃣ Buscando aplicações...');
    const appsResponse = await getKoyebApps();
    
    if (!appsResponse.apps || appsResponse.apps.length === 0) {
      throw new Error('Nenhuma aplicação encontrada');
    }

    const targetApp = appsResponse.apps.find(app => 
      app.name.includes('racial-debby') || app.name.includes('1brunomktecomercial')
    );

    if (!targetApp) {
      console.log('\n📋 Aplicações disponíveis:');
      appsResponse.apps.forEach(app => {
        console.log(`   - ${app.name} (ID: ${app.id})`);
      });
      throw new Error('Aplicação racial-debby não encontrada');
    }

    console.log(`   ✅ Aplicação encontrada: ${targetApp.name}\n`);

    console.log('2️⃣ Buscando serviços...');
    const servicesResponse = await getService(targetApp.id);
    
    if (!servicesResponse.services || servicesResponse.services.length === 0) {
      throw new Error('Nenhum serviço encontrado');
    }

    const service = servicesResponse.services[0];
    console.log(`   ✅ Serviço encontrado: ${service.name}\n`);

    console.log('3️⃣ Atualizando variáveis de ambiente...');
    
    const currentEnv = service.definition?.env || [];
    const updatedEnv = currentEnv
      .filter(env => env.key !== 'MONGODB_URI')
      .map(env => {
        if (env.key === 'DATABASE_URL') {
          return { key: 'DATABASE_URL', value: NEW_DATABASE_URL };
        }
        return env;
      });

    if (!updatedEnv.find(env => env.key === 'DATABASE_URL')) {
      updatedEnv.push({ key: 'DATABASE_URL', value: NEW_DATABASE_URL });
    }

    const updatePayload = {
      definition: {
        ...service.definition,
        env: updatedEnv
      }
    };

    await updateService(targetApp.id, service.id, updatePayload);
    
    console.log('   ✅ DATABASE_URL atualizada');
    console.log('   ✅ MONGODB_URI removida\n');

    console.log('4️⃣ Deploy iniciado automaticamente pelo Koyeb');
    console.log('   Aguarde 2-3 minutos para o deploy completar\n');

    console.log('✅ ATUALIZAÇÃO CONCLUÍDA!\n');
    console.log('🔗 Teste a API em:');
    console.log('   https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.error('\n📝 Solução manual:');
    console.error('   1. Acesse: https://app.koyeb.com/apps');
    console.error('   2. Selecione: racial-debby-1brunomktecomercial');
    console.error('   3. Settings → Environment Variables');
    console.error('   4. Atualize DATABASE_URL manualmente\n');
  }
}

updateKoyebDatabase();
