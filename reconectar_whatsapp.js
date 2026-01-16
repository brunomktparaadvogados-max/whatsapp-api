const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function reconectarWhatsApp() {
  console.log('🔄 RECONECTANDO WHATSAPP\n');
  console.log('=' .repeat(60) + '\n');

  try {
    console.log('1️⃣ Fazendo login...\n');
    
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'contato@advocaciabrunoreis.com.br',
      password: 'Advogado26@'
    });

    console.log('   ✅ Login realizado!\n');

    const token = loginRes.data.token;

    console.log('2️⃣ Criando nova sessão...\n');

    const createRes = await axios.post(
      `${API_URL}/api/sessions`,
      {},
      {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('   ✅ Sessão criada!');
    console.log(`   Session ID: ${createRes.data.sessionId}\n`);

    console.log('3️⃣ Aguardando QR Code (15 segundos)...\n');
    await new Promise(resolve => setTimeout(resolve, 15000));

    console.log('4️⃣ Buscando QR Code...\n');

    const qrRes = await axios.get(`${API_URL}/api/my-qr`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (qrRes.data.qrCode) {
      console.log('   ✅ QR CODE GERADO!\n');
      console.log('=' .repeat(60));
      console.log('\n📱 ESCANEIE O QR CODE ABAIXO:\n');
      console.log(qrRes.data.qrCode);
      console.log('\n' + '=' .repeat(60) + '\n');
      console.log('📋 INSTRUÇÕES:\n');
      console.log('   1. Abra o WhatsApp no seu celular');
      console.log('   2. Vá em Configurações > Aparelhos conectados');
      console.log('   3. Toque em "Conectar um aparelho"');
      console.log('   4. Escaneie o QR code acima\n');
      console.log('⏳ Aguarde a conexão ser estabelecida...\n');
      console.log('=' .repeat(60) + '\n');
    } else {
      console.log('   ⚠️  QR Code ainda não disponível.');
      console.log(`   Status: ${qrRes.data.status}\n`);
      console.log('   Tente novamente em alguns segundos.\n');
    }

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
    
    if (error.response) {
      console.error('\n📋 Detalhes:');
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

reconectarWhatsApp();
