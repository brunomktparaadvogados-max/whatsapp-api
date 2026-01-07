# 🚀 EXECUTAR MIGRAÇÃO NO SUPABASE - PASSO A PASSO

## ⚡ MÉTODO RÁPIDO - Supabase Dashboard

### PASSO 1: Acessar o Supabase

1. Acesse: **https://supabase.com/dashboard**
2. Faça login
3. Selecione seu projeto (o mesmo que está conectado no Koyeb)

### PASSO 2: Abrir SQL Editor

1. No menu lateral esquerdo, clique em **SQL Editor**
2. Clique no botão **New Query** (ou pressione Ctrl+N)

### PASSO 3: Colar e Executar o SQL

Cole este SQL completo:

```sql
-- ========================================
-- MIGRAÇÃO: RECRIAR TABELA MESSAGES
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
```

### PASSO 4: Executar

1. Clique no botão **RUN** (ou pressione Ctrl+Enter)
2. Aguarde a execução (deve levar 1-2 segundos)

### PASSO 5: Verificar Resultado

Você deve ver uma tabela com estas colunas:

| column_name     | data_type | is_nullable |
|----------------|-----------|-------------|
| id             | text      | NO          |
| session_id     | text      | NO          |
| contact_phone  | text      | NO          |
| message_type   | text      | NO          |
| body           | text      | YES         |
| media_url      | text      | YES         |
| media_mimetype | text      | YES         |
| from_me        | boolean   | NO          |
| timestamp      | bigint    | NO          |
| status         | text      | YES         |
| created_at     | timestamp | YES         |

---

## ✅ APÓS A MIGRAÇÃO

### Teste Imediato:

1. **Envie uma mensagem do celular** para o WhatsApp conectado
2. **Verifique no Supabase** se a mensagem foi salva:

```sql
SELECT * FROM messages ORDER BY created_at DESC LIMIT 5;
```

3. **Verifique os logs do Koyeb**:
   - Acesse: https://app.koyeb.com/
   - Vá em "Services" → "whatsapp-api" → "Logs"
   - Não deve mais aparecer erro de "column body does not exist"

4. **Teste no CRM/Flow**:
   - Acesse o sistema Flow
   - Vá em "Conversas" ou "Chat"
   - Clique em "Assumir conversa"
   - As mensagens devem aparecer! 🎉

---

## 🔍 QUERIES ÚTEIS PARA VERIFICAR

### Ver todas as mensagens:
```sql
SELECT 
  id,
  session_id,
  contact_phone,
  body,
  from_me,
  status,
  created_at
FROM messages
ORDER BY created_at DESC
LIMIT 10;
```

### Ver mensagens por contato:
```sql
SELECT 
  body,
  from_me,
  status,
  to_char(created_at, 'DD/MM/YYYY HH24:MI:SS') as data_hora
FROM messages
WHERE contact_phone = '5512992273748'
ORDER BY timestamp DESC;
```

### Contar mensagens por sessão:
```sql
SELECT 
  session_id,
  COUNT(*) as total_mensagens,
  COUNT(CASE WHEN from_me = true THEN 1 END) as enviadas,
  COUNT(CASE WHEN from_me = false THEN 1 END) as recebidas
FROM messages
GROUP BY session_id;
```

### Ver últimas mensagens recebidas:
```sql
SELECT 
  contact_phone,
  body,
  to_char(created_at, 'DD/MM/YYYY HH24:MI:SS') as data_hora
FROM messages
WHERE from_me = false
ORDER BY created_at DESC
LIMIT 10;
```

---

## ⚠️ SE DER ERRO

### Erro: "violates foreign key constraint"

Execute antes da migração:

```sql
-- Remover foreign key temporariamente
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_session_id_fkey;

-- Depois execute a migração completa
```

### Erro: "permission denied"

Você precisa ter permissões de admin no Supabase. Verifique se está logado com a conta correta.

---

## 🎯 RESULTADO ESPERADO

Após executar a migração:

- ✅ Tabela `messages` recriada com schema correto
- ✅ Backup salvo em `messages_backup`
- ✅ Índices criados para melhor performance
- ✅ API funcionando normalmente
- ✅ Mensagens sendo salvas automaticamente
- ✅ CRM/Flow mostrando mensagens
- ✅ Chat funcionando perfeitamente

---

## 📞 SUPORTE

Se tiver algum problema:

1. Tire um print do erro
2. Verifique os logs do Koyeb
3. Execute as queries de verificação acima
4. Me avise para ajudar!

**Execute AGORA e teste!** 🚀
