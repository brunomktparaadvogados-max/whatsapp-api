const { Client } = require('pg');

const DATABASE_URL = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';
const NEW_WEBHOOK_URL = 'https://rrgcwlbhfudjdfshtmaq.supabase.co/functions/v1/whatsapp-webhook';

async function atualizarWebhook() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados');
    
    const result = await client.query(
      'UPDATE sessions SET webhook_url = $1 WHERE id = $2 RETURNING id, webhook_url',
      [NEW_WEBHOOK_URL, 'user_13']
    );

    if (result.rows.length > 0) {
      console.log('✅ Webhook atualizado com sucesso!');
      console.log('Sessão:', result.rows[0].id);
      console.log('Novo webhook:', result.rows[0].webhook_url);
    } else {
      console.log('⚠️ Nenhuma sessão encontrada com ID user_13');
    }
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

atualizarWebhook();
