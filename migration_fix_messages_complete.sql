-- ========================================
-- MIGRAÇÃO COMPLETA DA TABELA MESSAGES
-- ========================================
-- Esta migração recria a tabela messages com o schema correto
-- Execute no SQL Editor do Supabase

-- 1. Fazer backup da tabela antiga (se existir dados importantes)
CREATE TABLE IF NOT EXISTS messages_backup AS SELECT * FROM messages;

-- 2. Dropar a tabela antiga
DROP TABLE IF EXISTS messages CASCADE;

-- 3. Recriar a tabela com o schema correto
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

-- 4. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_contact_phone ON messages(contact_phone);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_from_me ON messages(from_me);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);

-- 5. Verificar a estrutura
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'messages'
ORDER BY ordinal_position;

-- ========================================
-- RESULTADO ESPERADO:
-- ========================================
-- id               | text    | NO
-- session_id       | text    | NO
-- contact_phone    | text    | NO
-- message_type     | text    | NO
-- body             | text    | YES
-- media_url        | text    | YES
-- media_mimetype   | text    | YES
-- from_me          | boolean | NO
-- timestamp        | bigint  | NO
-- status           | text    | YES
-- created_at       | timestamp | YES
