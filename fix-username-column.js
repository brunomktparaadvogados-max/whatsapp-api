const { Pool } = require('pg');

const NEW_DB = 'postgresql://postgres:Advogado26@@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: NEW_DB,
  ssl: { rejectUnauthorized: false }
});

async function fixUsernameColumn() {
  console.log('🔧 Corrigindo coluna username...\n');

  try {
    console.log('1️⃣ Tornando username opcional (nullable)...');
    await pool.query('ALTER TABLE users ALTER COLUMN username DROP NOT NULL');
    console.log('   ✅ Coluna username agora é opcional\n');

    console.log('2️⃣ Removendo constraint UNIQUE de username...');
    await pool.query('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_key');
    console.log('   ✅ Constraint removida\n');

    console.log('3️⃣ Verificando estrutura...');
    const columns = await pool.query(`
      SELECT column_name, is_nullable, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users' AND column_name IN ('username', 'email', 'name')
    `);
    
    console.log('   Colunas principais:');
    columns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable})`);
    });

    console.log('\n✅ CORREÇÃO CONCLUÍDA!\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

fixUsernameColumn();
