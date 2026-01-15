const { Pool } = require('pg');

const NEW_DB = 'postgresql://postgres:Advogado26@@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';

const pool = new Pool({
  connectionString: NEW_DB,
  ssl: { rejectUnauthorized: false }
});

async function fixUsersTable() {
  console.log('🔧 Corrigindo estrutura da tabela users...\n');

  try {
    console.log('1️⃣ Verificando colunas existentes...');
    const columns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    
    const columnNames = columns.rows.map(r => r.column_name);
    console.log(`   Colunas atuais: ${columnNames.join(', ')}\n`);

    console.log('2️⃣ Adicionando colunas faltantes...');
    
    if (!columnNames.includes('name')) {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(255)');
      console.log('   ✅ Coluna "name" adicionada');
    } else {
      console.log('   ℹ️  Coluna "name" já existe');
    }

    if (!columnNames.includes('company')) {
      await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS company VARCHAR(255)');
      console.log('   ✅ Coluna "company" adicionada');
    } else {
      console.log('   ℹ️  Coluna "company" já existe');
    }

    console.log('\n3️⃣ Verificando estrutura final...');
    const finalColumns = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    
    console.log('   Estrutura da tabela users:');
    finalColumns.rows.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });

    console.log('\n✅ CORREÇÃO CONCLUÍDA!\n');
    console.log('🔗 Teste novamente: https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/\n');

  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await pool.end();
  }
}

fixUsersTable();
