const { Client } = require('pg');

const credenciais = [
  {
    nome: 'Projeto rrgcwlbhfudjdfshtmaq - Senha Advogado255 - Pooler',
    url: 'postgresql://postgres.rrgcwlbhfudjdfshtmaq:Advogado255@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
  },
  {
    nome: 'Projeto rrgcwlbhfudjdfshtmaq - Senha Advogado255 - Direto',
    url: 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres'
  },
  {
    nome: 'Projeto rrgcwlbhfudjdfshtmaq - Senha Advogado266 - Pooler',
    url: 'postgresql://postgres.rrgcwlbhfudjdfshtmaq:Advogado266@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
  },
  {
    nome: 'Projeto rrgcwlbhfudjdfshtmaq - Senha Advogado266 - Direto',
    url: 'postgresql://postgres:Advogado266@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres'
  },
  {
    nome: 'Projeto tnpklervxwlexgaanxlw - Senha Advogado255 - Pooler',
    url: 'postgresql://postgres.tnpklervxwlexgaanxlw:Advogado255@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
  },
  {
    nome: 'Projeto tnpklervxwlexgaanxlw - Senha Advogado255 - Direto',
    url: 'postgresql://postgres:Advogado255@db.tnpklervxwlexgaanxlw.supabase.co:5432/postgres'
  }
];

async function verificarCredenciais() {
  console.log('🔍 TESTANDO TODAS AS CREDENCIAIS POSSÍVEIS\n');
  
  for (const cred of credenciais) {
    console.log(`\n📡 ${cred.nome}`);
    console.log(`   URL: ${cred.url}`);
    
    const client = new Client({ connectionString: cred.url });
    
    try {
      await client.connect();
      const result = await client.query('SELECT COUNT(*) FROM users');
      console.log(`   ✅ CONECTADO! Usuários: ${result.rows[0].count}`);
      
      const users = await client.query('SELECT id, email FROM users LIMIT 5');
      if (users.rows.length > 0) {
        console.log('   👥 Usuários encontrados:');
        users.rows.forEach(u => console.log(`      - ${u.email} (ID: ${u.id})`));
      }
      
      await client.end();
    } catch (error) {
      console.log(`   ❌ ERRO: ${error.message}`);
    }
  }
  
  console.log('\n\n✅ Teste concluído!');
}

verificarCredenciais().catch(console.error);
