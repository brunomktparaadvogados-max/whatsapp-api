-- Script de migração para corrigir a tabela messages
-- Execute este script no SQL Editor do Supabase

-- 1. Adicionar coluna contact_phone se não existir
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name='messages' AND column_name='contact_phone'
  ) THEN
    ALTER TABLE messages ADD COLUMN contact_phone TEXT;
    RAISE NOTICE 'Coluna contact_phone adicionada com sucesso';
  ELSE
    RAISE NOTICE 'Coluna contact_phone já existe';
  END IF;
END $$;

-- 2. Atualizar valores NULL para contact_phone (se houver)
UPDATE messages 
SET contact_phone = 'unknown' 
WHERE contact_phone IS NULL;

-- 3. Tornar a coluna NOT NULL após preencher valores
ALTER TABLE messages 
ALTER COLUMN contact_phone SET NOT NULL;

-- 4. Verificar a estrutura da tabela
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'messages' 
ORDER BY ordinal_position;
