const { Pool } = require('pg');
require('dotenv').config();

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL não está configurada no arquivo .env');
  console.log('💡 Este script precisa ser executado no servidor Koyeb onde a API está rodando.');
  console.log('💡 Vou criar um endpoint na API para limpar as mensagens remotamente.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function limparMensagens() {
  try {
    console.log('🔄 Conectando ao banco de dados...');
    
    const countResult = await pool.query('SELECT COUNT(*) FROM messages');
    const totalMensagens = countResult.rows[0].count;
    
    console.log(`📊 Total de mensagens no banco: ${totalMensagens}`);
    
    if (totalMensagens === '0') {
      console.log('✅ Não há mensagens para limpar!');
      process.exit(0);
    }
    
    console.log('🗑️ Deletando todas as mensagens...');
    await pool.query('DELETE FROM messages');
    
    console.log('✅ Todas as mensagens foram deletadas com sucesso!');
    console.log('💾 Liberando espaço no banco de dados...');
    
    await pool.query('VACUUM FULL messages');
    
    console.log('✅ Limpeza concluída! O banco de dados foi otimizado.');
    
    const newCount = await pool.query('SELECT COUNT(*) FROM messages');
    console.log(`📊 Total de mensagens após limpeza: ${newCount.rows[0].count}`);
    
  } catch (error) {
    console.error('❌ Erro ao limpar mensagens:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

limparMensagens();
