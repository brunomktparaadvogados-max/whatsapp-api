-- ========================================
-- MIGRAÇÃO: RECRIAR TABELA MESSAGES
-- Execute no SQL Editor do Supabase
-- ========================================

-- 1. Backup da tabela antiga (segurança)
CREATE TABLE IF NOT EXISTS messages_backup AS SELECT * FROM messages;

-- 2. Dropar tabela antiga
DROP TABLE IF EXISTS messages CASCADE;

-- 3. Recriar com schema correto
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  message_type TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  media_mimetype TEXT,
  from_me BOOLEAN NOT NULL,
  timestamp BIGINT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 4. Criar índices para performance
CREATE INDEX idx_messages_session_id ON messages(session_id);
CREATE INDEX idx_messages_contact_phone ON messages(contact_phone);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_from_me ON messages(from_me);
CREATE INDEX idx_messages_status ON messages(status);

-- 5. Verificar estrutura (resultado aparecerá abaixo)
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;
