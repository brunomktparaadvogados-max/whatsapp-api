const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

async function testarLogin() {
  console.log('🔍 TESTANDO LOGIN DIRETO NO BANCO\n');
  
  const client = new Client({ 
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');
    
    const result = await client.query('SELECT * FROM users WHERE email = $1', ['admin@whatsapp.com']);
    
    if (result.rows.length === 0) {
      console.log('❌ Usuário admin@whatsapp.com NÃO EXISTE');
      console.log('\n📋 Criando usuário admin...');
      
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      await client.query(
        'INSERT INTO users (email, password, name, company) VALUES ($1, $2, $3, $4)',
        ['admin@whatsapp.com', hashedPassword, 'Admin', 'Sistema']
      );
      
      console.log('✅ Usuário admin criado com sucesso!');
      console.log('\n📧 Email: admin@whatsapp.com');
      console.log('🔑 Senha: admin123');
    } else {
      console.log('✅ Usuário admin@whatsapp.com EXISTE');
      console.log('\n📋 Dados do usuário:');
      console.log(`   ID: ${result.rows[0].id}`);
      console.log(`   Email: ${result.rows[0].email}`);
      console.log(`   Nome: ${result.rows[0].name}`);
      console.log(`   Empresa: ${result.rows[0].company || 'N/A'}`);
      console.log(`   Criado em: ${result.rows[0].created_at}`);
      
      console.log('\n🔐 Testando senha...');
      const bcrypt = require('bcryptjs');
      const senhaCorreta = await bcrypt.compare('admin123', result.rows[0].password);
      
      if (senhaCorreta) {
        console.log('✅ Senha "admin123" está CORRETA');
      } else {
        console.log('❌ Senha "admin123" está INCORRETA');
        console.log('\n📋 Atualizando senha para "admin123"...');
        
        const hashedPassword = await bcrypt.hash('admin123', 10);
        await client.query('UPDATE users SET password = $1 WHERE email = $2', [hashedPassword, 'admin@whatsapp.com']);
        
        console.log('✅ Senha atualizada com sucesso!');
      }
      
      console.log('\n📧 Email: admin@whatsapp.com');
      console.log('🔑 Senha: admin123');
    }
    
    console.log('\n\n📊 Total de usuários no banco:');
    const count = await client.query('SELECT COUNT(*) FROM users');
    console.log(`   ${count.rows[0].count} usuário(s)`);
    
    const allUsers = await client.query('SELECT id, email, name FROM users');
    console.log('\n👥 Lista de usuários:');
    allUsers.rows.forEach(u => {
      console.log(`   - ${u.email} (${u.name}) - ID: ${u.id}`);
    });
    
    await client.end();
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

testarLogin().catch(console.error);
