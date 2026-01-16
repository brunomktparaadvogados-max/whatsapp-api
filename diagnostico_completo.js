const { Client } = require('pg');
const axios = require('axios');

const DATABASE_URL = 'postgresql://postgres:Advogado255@db.rrgcwlbhfudjdfshtmaq.supabase.co:5432/postgres';
const API_URL = 'https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app';

async function diagnosticoCompleto() {
  console.log('🔍 DIAGNÓSTICO COMPLETO DA API WHATSAPP\n');
  console.log('=' .repeat(60) + '\n');

  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao banco Supabase\n');

    console.log('📊 VERIFICANDO USUÁRIOS...\n');
    const usersResult = await client.query('SELECT id, email, name, company, created_at FROM users ORDER BY created_at DESC');
    console.log(`   Total de usuários: ${usersResult.rows.length}\n`);
    
    usersResult.rows.forEach((user, index) => {
      console.log(`   ${index + 1}. ${user.email}`);
      console.log(`      Nome: ${user.name}`);
      console.log(`      ID: ${user.id}`);
      console.log(`      Criado: ${new Date(user.created_at).toLocaleString('pt-BR')}\n`);
    });

    console.log('=' .repeat(60) + '\n');
    console.log('📱 VERIFICANDO SESSÕES...\n');
    
    const sessionsResult = await client.query(`
      SELECT s.id, s.user_id, s.status, s.phone_number, s.created_at, s.updated_at, u.email
      FROM sessions s
      LEFT JOIN users u ON s.user_id = u.id
      ORDER BY s.updated_at DESC
    `);
    
    console.log(`   Total de sessões: ${sessionsResult.rows.length}\n`);
    
    if (sessionsResult.rows.length > 0) {
      sessionsResult.rows.forEach((session, index) => {
        console.log(`   ${index + 1}. Sessão: ${session.id}`);
        console.log(`      Usuário: ${session.email || 'USUÁRIO NÃO ENCONTRADO'}`);
        console.log(`      Status: ${session.status}`);
        console.log(`      Telefone: ${session.phone_number || 'N/A'}`);
        console.log(`      Atualizado: ${new Date(session.updated_at).toLocaleString('pt-BR')}\n`);
      });

      console.log('=' .repeat(60) + '\n');
      console.log('🧹 IDENTIFICANDO SESSÕES PROBLEMÁTICAS...\n');

      const problematicas = sessionsResult.rows.filter(s => {
        return !s.email || 
               s.status === 'failed' || 
               s.status === 'disconnected' ||
               s.status === 'auth_failure' ||
               !s.id.startsWith('user_');
      });

      if (problematicas.length > 0) {
        console.log(`   ⚠️  Encontradas ${problematicas.length} sessões problemáticas:\n`);
        problematicas.forEach((s, i) => {
          console.log(`   ${i + 1}. ${s.id} - ${s.status} - ${s.email || 'SEM USUÁRIO'}`);
        });
        console.log('\n');
      } else {
        console.log('   ✅ Nenhuma sessão problemática encontrada\n');
      }
    } else {
      console.log('   ℹ️  Nenhuma sessão encontrada no banco\n');
    }

    console.log('=' .repeat(60) + '\n');
    console.log('🔧 OPÇÕES DE CORREÇÃO:\n');
    console.log('   1. Limpar TODAS as sessões (recomendado)');
    console.log('   2. Limpar apenas sessões problemáticas');
    console.log('   3. Não fazer nada\n');

    console.log('=' .repeat(60) + '\n');
    console.log('🚀 TESTANDO API...\n');

    try {
      const healthCheck = await axios.get(`${API_URL}/health`, { timeout: 10000 });
      console.log('   ✅ API está respondendo');
      console.log(`   Status: ${healthCheck.data.status}`);
      console.log(`   Uptime: ${Math.floor(healthCheck.data.uptime / 60)} minutos\n`);
    } catch (error) {
      console.log('   ❌ API não está respondendo');
      console.log(`   Erro: ${error.message}\n`);
    }

    console.log('=' .repeat(60) + '\n');
    console.log('📋 RESUMO DO DIAGNÓSTICO:\n');
    console.log(`   ✅ Banco de dados: CONECTADO`);
    console.log(`   👥 Usuários: ${usersResult.rows.length}`);
    console.log(`   📱 Sessões: ${sessionsResult.rows.length}`);
    console.log(`   ⚠️  Sessões problemáticas: ${sessionsResult.rows.filter(s => !s.email || s.status === 'failed' || s.status === 'disconnected').length}`);
    console.log('\n');

  } catch (error) {
    console.error('❌ ERRO:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await client.end();
    console.log('🔌 Conexão com banco encerrada\n');
  }
}

diagnosticoCompleto();
