# 🚨 CORREÇÃO URGENTE - TABELA MESSAGES

## ❌ PROBLEMA IDENTIFICADO

A tabela `messages` no Supabase está com o **schema antigo**:
- ❌ Coluna `message_body` (antigo)
- ❌ Falta coluna `body` (novo)
- ❌ Falta coluna `contact_phone` (novo)

Por isso as mensagens não estão sendo salvas e não aparecem no CRM.

---

## ✅ SOLUÇÃO - EXECUTAR MIGRAÇÃO SQL

### PASSO 1: Acessar o Supabase

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em **SQL Editor** (menu lateral esquerdo)

### PASSO 2: Executar a Migração

1. Clique em **New Query**
2. Cole o SQL abaixo:

```sql
-- ========================================
-- MIGRAÇÃO COMPLETA DA TABELA MESSAGES
-- ========================================

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
```

3. Clique em **RUN** (ou pressione Ctrl+Enter)

### PASSO 3: Verificar o Resultado

Você deve ver uma tabela com as colunas:
- ✅ id (text)
- ✅ session_id (text)
- ✅ contact_phone (text)
- ✅ message_type (text)
- ✅ body (text)
- ✅ media_url (text)
- ✅ media_mimetype (text)
- ✅ from_me (boolean)
- ✅ timestamp (bigint)
- ✅ status (text)
- ✅ created_at (timestamp)

---

## 🔄 PASSO 4: Testar

Após executar a migração:

1. **Envie uma mensagem do celular** para o WhatsApp conectado
2. **Verifique os logs do Koyeb** - não deve mais aparecer erro de "column body does not exist"
3. **Acesse o CRM/Flow** e clique em "Assumir conversa"
4. **As mensagens devem aparecer** no chat

---

## 📊 VERIFICAR DADOS NO SUPABASE

Para ver as mensagens salvas, execute no SQL Editor:

```sql
-- Ver todas as mensagens
SELECT * FROM messages ORDER BY created_at DESC LIMIT 10;

-- Ver mensagens por contato
SELECT 
  contact_phone,
  body,
  from_me,
  status,
  created_at
FROM messages
WHERE contact_phone = '5512992273748'
ORDER BY timestamp DESC;

-- Contar mensagens por sessão
SELECT 
  session_id,
  COUNT(*) as total_messages
FROM messages
GROUP BY session_id;
```

---

## ⚠️ IMPORTANTE

- ✅ A migração cria um backup automático (`messages_backup`)
- ✅ Se você tinha mensagens antigas, elas estarão em `messages_backup`
- ✅ A API já está com o código correto, só faltava o banco estar atualizado
- ✅ Após a migração, tudo funcionará automaticamente

---

## 🆘 SE DER ERRO

Se aparecer erro de foreign key, execute antes:

```sql
-- Remover foreign key temporariamente
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_session_id_fkey;

-- Depois execute a migração completa acima
```

---

## ✅ APÓS A MIGRAÇÃO

1. ✅ Mensagens recebidas serão salvas automaticamente
2. ✅ Mensagens enviadas serão salvas automaticamente
3. ✅ O CRM/Flow mostrará as mensagens
4. ✅ O chat funcionará normalmente
5. ✅ O "Assumir conversa" mostrará o histórico

**Execute a migração AGORA e teste!** 🚀
