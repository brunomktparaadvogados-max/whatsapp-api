-- ============================================================================
-- Migration: invariantes de sessão WhatsApp (2026-07-06)
-- Segura: NÃO apaga users, contacts, leads, campanhas ou histórico.
-- Pode rodar com o serviço no ar (idempotente), mas o ideal é rodar
-- imediatamente antes de um redeploy.
-- ============================================================================

-- 1. Garante colunas exigidas pela state machine
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS remote_auth_verified_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_ready_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_auth_failure_at TIMESTAMP;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS auth_generation INTEGER DEFAULT 0;

-- 2. INVARIANTE: elimina "sessão salva" FALSA
--    saved_auth sem remote_auth_verified_at nunca passou por ready validado.
UPDATE sessions
SET status = 'disconnected', updated_at = NOW()
WHERE status = 'saved_auth'
  AND remote_auth_verified_at IS NULL;

-- 3. Estados "vivos" fantasmas: initializing/qr_code/reconnecting parados
--    há mais de 1h não têm Chromium por trás (restart/deploy os matou).
UPDATE sessions
SET status = CASE
      WHEN remote_auth_verified_at IS NOT NULL THEN 'saved_auth'
      ELSE 'disconnected'
    END,
    updated_at = NOW()
WHERE status IN ('initializing', 'qr_code', 'reconnecting')
  AND updated_at < NOW() - INTERVAL '1 hour';

-- 4. Locks de envio vencidos (tabela pode não existir em ambientes antigos)
DO $$
BEGIN
  DELETE FROM whatsapp_send_locks WHERE created_at < NOW() - INTERVAL '1 day';
EXCEPTION
  WHEN undefined_table THEN NULL;
  WHEN undefined_column THEN NULL;
END $$;

-- 5. Backups RemoteAuth antigos (retenção 0 já configurada; limpa resíduo)
DO $$
BEGIN
  DELETE FROM whatsapp_auth_session_backups WHERE created_at < NOW() - INTERVAL '7 days';
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- 6. Blobs RemoteAuth órfãos (sessão não existe mais em sessions)
DO $$
BEGIN
  DELETE FROM whatsapp_auth_sessions
  WHERE replace(session_id, 'RemoteAuth-', '') NOT IN (SELECT id FROM sessions);
EXCEPTION
  WHEN undefined_table THEN NULL;
END $$;

-- 7. Relatório pós-migração (rode para conferir)
-- SELECT status, COUNT(*) FROM sessions GROUP BY status;
-- SELECT COUNT(*) AS false_saved_auth FROM sessions
--   WHERE status='saved_auth' AND remote_auth_verified_at IS NULL;  -- deve ser 0
