const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const PROJETO_DB = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

async function verificarUsuarios() {
  console.log('🔍 VERIFICANDO USUÁRIOS NO BANCO\n');
  
  const client = new Client({ 
    connectionString: PROJETO_DB,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');

    const result = await client.query('SELECT id, email, name, company, created_at FROM users');
    
    console.log(`📊 Total de usuários: ${result.rows.length}\n`);
    
    if (result.rows.length === 0) {
      console.log('⚠️  NENHUM USUÁRIO ENCONTRADO!');
      console.log('   Criando usuário admin agora...\n');
      
      const hashedPassword = await bcrypt.hash('admin123', 10);
      const { v4: uuidv4 } = require('uuid');
      const adminId = uuidv4();
      
      await client.query(
        'INSERT INTO users (id, email, password, name, company) VALUES ($1, $2, $3, $4, $5)',
        [adminId, 'admin@whatsapp.com', hashedPassword, 'Administrador', 'Sistema']
      );
      
      console.log('✅ Usuário admin criado!');
      console.log('   📧 Email: admin@whatsapp.com');
      console.log('   🔑 Senha: admin123\n');
    } else {
      console.log('👥 Usuários encontrados:\n');
      result.rows.forEach((user, index) => {
        console.log(`${index + 1}. ${user.email}`);
        console.log(`   Nome: ${user.name}`);
        console.log(`   Empresa: ${user.company || 'N/A'}`);
        console.log(`   Criado em: ${user.created_at}\n`);
      });
      
      console.log('🔐 Testando senha do admin...\n');
      const adminUser = result.rows.find(u => u.email === 'admin@whatsapp.com');
      
      if (adminUser) {
        const passwordResult = await client.query('SELECT password FROM users WHERE email = $1', ['admin@whatsapp.com']);
        const storedHash = passwordResult.rows[0].password;
        const isValid = await bcrypt.compare('admin123', storedHash);
        
        if (isValid) {
          console.log('✅ Senha do admin está CORRETA!\n');
        } else {
          console.log('❌ Senha do admin está INCORRETA!');
          console.log('   Atualizando senha...\n');
          
          const newHash = await bcrypt.hash('admin123', 10);
          await client.query('UPDATE users SET password = $1 WHERE email = $2', [newHash, 'admin@whatsapp.com']);
          
          console.log('✅ Senha atualizada para: admin123\n');
        }
      }
    }
    
  } catch (erro) {
    console.error('❌ ERRO:', erro.message);
  } finally {
    await client.end();
  }
}

verificarUsuarios();
