-- Script de limpeza emergencial de mensagens antigas
-- Remove mensagens com mais de 24 horas para liberar espaço no banco

-- Verificar quantidade de mensagens antes da limpeza
SELECT 
  COUNT(*) as total_messages,
  COUNT(CASE WHEN created_at < NOW() - INTERVAL '24 hours' THEN 1 END) as old_messages,
  pg_size_pretty(pg_total_relation_size('messages')) as table_size
FROM messages;

-- Deletar mensagens antigas (mais de 24 horas)
DELETE FROM messages 
WHERE created_at < NOW() - INTERVAL '24 hours';

-- Verificar resultado após limpeza
SELECT 
  COUNT(*) as remaining_messages,
  pg_size_pretty(pg_total_relation_size('messages')) as table_size_after,
  pg_size_pretty(pg_database_size(current_database())) as database_size
FROM messages;

-- Executar VACUUM para liberar espaço físico
VACUUM FULL messages;

-- Estatísticas finais
SELECT 
  'Limpeza concluída!' as status,
  COUNT(*) as total_messages_remaining,
  pg_size_pretty(pg_database_size(current_database())) as database_size_final
FROM messages;
