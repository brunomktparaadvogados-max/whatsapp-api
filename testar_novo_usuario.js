const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function testarNovoUsuario() {
  console.log('🧪 TESTANDO CRIAÇÃO DE NOVO USUÁRIO\n');

  try {
    const novoUsuario = {
      name: 'Usuário Teste',
      email: `teste${Date.now()}@example.com`,
      password: 'senha123',
      company: 'Empresa Teste'
    };

    console.log('1️⃣ Criando novo usuário...');
    console.log(`   Email: ${novoUsuario.email}`);
    
    const registerRes = await axios.post(`${API_URL}/api/auth/register`, novoUsuario);
    
    console.log('✅ Usuário criado com sucesso!');
    console.log(`📊 User ID: ${registerRes.data.user.id}`);
    console.log(`📊 Session ID: ${registerRes.data.sessionId}`);
    console.log(`🔑 Token: ${registerRes.data.token.substring(0, 50)}...`);
    console.log(`💬 Mensagem: ${registerRes.data.message}\n`);

    const token = registerRes.data.token;

    console.log('2️⃣ Aguardando 5 segundos para sessão ser criada...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log('3️⃣ Verificando sessão do novo usuário...');
    const mySessionRes = await axios.get(`${API_URL}/api/my-session`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    console.log(`✅ Sessão encontrada!`);
    console.log(`📊 Session ID: ${mySessionRes.data.sessionId}`);
    console.log(`📊 Status: ${mySessionRes.data.status}`);
    
    if (mySessionRes.data.qrCode) {
      console.log(`📱 QR Code disponível: SIM (${mySessionRes.data.qrCode.length} caracteres)`);
    } else {
      console.log(`📱 QR Code disponível: NÃO (aguarde alguns segundos)`);
    }

    console.log('\n4️⃣ Tentando obter QR Code...');
    const qrRes = await axios.get(`${API_URL}/api/my-qr`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (qrRes.data.qrCode) {
      console.log(`✅ QR Code obtido com sucesso!`);
      console.log(`📱 Tamanho: ${qrRes.data.qrCode.length} caracteres`);
      console.log(`📊 Status: ${qrRes.data.status}`);
    } else {
      console.log(`⚠️ QR Code ainda não disponível`);
      console.log(`📊 Status: ${qrRes.data.status}`);
      console.log(`💬 Mensagem: ${qrRes.data.message}`);
    }

    console.log('\n✅ TESTE COMPLETO!');
    console.log('\n📝 RESUMO:');
    console.log(`   ✅ Novo usuário criado: ${novoUsuario.email}`);
    console.log(`   ✅ Sessão WhatsApp criada automaticamente`);
    console.log(`   ✅ QR Code ${qrRes.data.qrCode ? 'disponível' : 'será gerado em breve'}`);
    console.log(`   ✅ Usuário pode escanear QR Code e enviar mensagens`);

    console.log('\n🔗 Para testar na interface:');
    console.log(`   1. Acesse: ${API_URL}`);
    console.log(`   2. Faça login com: ${novoUsuario.email} / ${novoUsuario.password}`);
    console.log(`   3. Escaneie o QR Code`);
    console.log(`   4. Envie mensagens!`);

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

testarNovoUsuario();
