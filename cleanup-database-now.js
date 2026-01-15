const { Pool } = require('pg');

const DATABASE_URL = 'postgresql://postgres:Advocaciawh@db.cuvbzzfspeugqbwavqkv.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function cleanupDatabase() {
  console.log('🧹 Iniciando limpeza do banco de dados...\n');

  try {
    console.log('📊 Verificando estado atual...');
    const beforeStats = await pool.query(`
      SELECT 
        COUNT(*) as total_messages,
        pg_size_pretty(pg_total_relation_size('messages')) as table_size
      FROM messages
    `);
    
    console.log(`   Total de mensagens: ${beforeStats.rows[0].total_messages}`);
    console.log(`   Tamanho da tabela: ${beforeStats.rows[0].table_size}\n`);

    console.log('🗑️  Deletando mensagens antigas (> 24h)...');
    const deleteOld = await pool.query(`
      DELETE FROM messages 
      WHERE created_at < NOW() - INTERVAL '24 hours'
    `);
    console.log(`   ✅ ${deleteOld.rowCount} mensagens antigas removidas\n`);

    console.log('🗑️  Deletando mensagens de status...');
    const deleteStatus = await pool.query(`
      DELETE FROM messages 
      WHERE to_number LIKE '%status@broadcast%'
    `);
    console.log(`   ✅ ${deleteStatus.rowCount} mensagens de status removidas\n`);

    console.log('🔄 Executando VACUUM FULL para liberar espaço...');
    await pool.query('VACUUM FULL messages');
    console.log('   ✅ VACUUM concluído\n');

    console.log('📊 Verificando estado final...');
    const afterStats = await pool.query(`
      SELECT 
        COUNT(*) as total_messages,
        pg_size_pretty(pg_total_relation_size('messages')) as table_size,
        pg_size_pretty(pg_database_size(current_database())) as database_size
      FROM messages
    `);
    
    console.log(`   Total de mensagens: ${afterStats.rows[0].total_messages}`);
    console.log(`   Tamanho da tabela: ${afterStats.rows[0].table_size}`);
    console.log(`   Tamanho do banco: ${afterStats.rows[0].database_size}\n`);

    console.log('✅ Limpeza concluída com sucesso!');
    console.log('🎉 O banco deve voltar ao modo de escrita agora.\n');

  } catch (error) {
    console.error('❌ Erro durante a limpeza:', error.message);
    if (error.code === '25006') {
      console.error('\n⚠️  BANCO AINDA EM READ-ONLY!');
      console.error('   Tente executar os comandos SQL diretamente no Supabase:');
      console.error('   https://supabase.com/dashboard/project/cuvbzzfspeugqbwavqkv/editor\n');
    }
  } finally {
    await pool.end();
  }
}

cleanupDatabase();
