const axios = require('axios');

const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function verificarQR() {
  try {
    const loginRes = await axios.post(`${API_URL}/api/auth/login`, {
      email: 'contato@advocaciabrunoreis.com.br',
      password: 'Advogado26@'
    });

    const token = loginRes.data.token;

    const qrRes = await axios.get(`${API_URL}/api/my-qr`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    console.log('📋 RESPOSTA COMPLETA:\n');
    console.log(JSON.stringify(qrRes.data, null, 2));

  } catch (error) {
    console.error('❌ ERRO:', error.response?.data || error.message);
  }
}

verificarQR();
