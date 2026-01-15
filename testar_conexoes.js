const { Client } = require('pg');

async function testarConexoes() {
  console.log('🔍 TESTANDO CONEXÕES\n');
  
  const conexoes = [
    {
      nome: 'Projeto ANTIGO (direto)',
      url: 'postgresql://postgres:Advogado26@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres'
    },
    {
      nome: 'Projeto ANTIGO (pooler)',
      url: 'postgresql://postgres.rrgcwlbhfudjdfshtmaq:Advogado26%40@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
    },
    {
      nome: 'Projeto NOVO (direto)',
      url: 'postgresql://postgres:Advogado266@db.tnpklervxwlexgaanxlw.supabase.co:5432/postgres'
    },
    {
      nome: 'Projeto NOVO (pooler)',
      url: 'postgresql://postgres.tnpklervxwlexgaanxlw:Advogado266@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
    }
  ];
  
  for (const conexao of conexoes) {
    console.log(`\n📡 Testando: ${conexao.nome}`);
    const client = new Client({ 
      connectionString: conexao.url,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000
    });
    
    try {
      await client.connect();
      console.log('   ✅ CONECTADO!');
      
      const result = await client.query('SELECT COUNT(*) FROM users');
      console.log(`   📊 Usuários encontrados: ${result.rows[0].count}`);
      
      await client.end();
    } catch (erro) {
      console.log(`   ❌ ERRO: ${erro.message}`);
    }
  }
}

testarConexoes();
