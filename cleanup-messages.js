const { Pool } = require('pg');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL não encontrada no .env');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function cleanupMessages() {
  const client = await pool.connect();
  
  try {
    console.log('🧹 Iniciando limpeza de mensagens antigas...\n');
    
    console.log('📊 Verificando estado atual do banco...');
    const beforeStats = await client.query(`
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN created_at < NOW() - INTERVAL '24 hours' THEN 1 END) as old_messages,
        pg_size_pretty(pg_total_relation_size('messages')) as table_size,
        pg_size_pretty(pg_database_size(current_database())) as database_size
      FROM messages
    `);
    
    console.log('📈 Estado ANTES da limpeza:');
    console.log(`   - Total de mensagens: ${beforeStats.rows[0].total_messages}`);
    console.log(`   - Mensagens antigas (>24h): ${beforeStats.rows[0].old_messages}`);
    console.log(`   - Tamanho da tabela messages: ${beforeStats.rows[0].table_size}`);
    console.log(`   - Tamanho total do banco: ${beforeStats.rows[0].database_size}\n`);
    
    console.log('🗑️  Deletando mensagens antigas...');
    const deleteResult = await client.query(`
      DELETE FROM messages 
      WHERE created_at < NOW() - INTERVAL '24 hours'
    `);
    
    console.log(`✅ ${deleteResult.rowCount} mensagens deletadas!\n`);
    
    console.log('🧹 Executando VACUUM para liberar espaço físico...');
    await client.query('VACUUM FULL messages');
    console.log('✅ VACUUM concluído!\n');
    
    console.log('📊 Verificando estado final...');
    const afterStats = await client.query(`
      SELECT 
        COUNT(*) as remaining_messages,
        pg_size_pretty(pg_total_relation_size('messages')) as table_size,
        pg_size_pretty(pg_database_size(current_database())) as database_size
      FROM messages
    `);
    
    console.log('📈 Estado DEPOIS da limpeza:');
    console.log(`   - Mensagens restantes: ${afterStats.rows[0].remaining_messages}`);
    console.log(`   - Tamanho da tabela messages: ${afterStats.rows[0].table_size}`);
    console.log(`   - Tamanho total do banco: ${afterStats.rows[0].database_size}\n`);
    
    console.log('✅ Limpeza concluída com sucesso!');
    console.log('💡 O banco agora deve voltar ao modo de escrita.');
    
  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error.message);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

cleanupMessages()
  .then(() => {
    console.log('\n🎉 Script finalizado!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Falha na execução:', error);
    process.exit(1);
  });
