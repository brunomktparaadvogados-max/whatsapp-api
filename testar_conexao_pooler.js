const { Client } = require('pg');

const conexoes = [
  {
    nome: 'Pooler (sa-east-1)',
    url: 'postgresql://postgres.rrgcwlbhfudjdfshtmaq:Advogado255@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
  },
  {
    nome: 'Direto (db)',
    url: 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres'
  }
];

async function testarConexoes() {
  console.log('🔍 TESTANDO CONEXÕES\n');
  
  for (const conexao of conexoes) {
    console.log(`\n📡 Testando: ${conexao.nome}`);
    console.log(`   URL: ${conexao.url}\n`);
    
    const client = new Client({ 
      connectionString: conexao.url,
      ssl: { rejectUnauthorized: false }
    });
    
    try {
      await client.connect();
      console.log('   ✅ CONECTADO!');
      
      const result = await client.query('SELECT COUNT(*) FROM users');
      console.log(`   📊 Usuários: ${result.rows[0].count}`);
      
      await client.end();
    } catch (erro) {
      console.log(`   ❌ ERRO: ${erro.message}`);
    }
  }
}

testarConexoes();
