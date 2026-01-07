# Correção dos Erros da API WhatsApp

## Problemas Identificados

### 1. Erro: `column "contact_phone" of relation "messages" does not exist`
**Causa**: A tabela `messages` no banco de dados Supabase não possui a coluna `contact_phone`, mas o código está tentando inserir dados nessa coluna.

**Solução Aplicada**:
- Adicionada migração automática no arquivo `database.js` que verifica e cria a coluna `contact_phone` se ela não existir
- Criado script SQL manual `migration_fix_messages.sql` para executar diretamente no Supabase

### 2. Erro: `invalid input syntax for type uuid`
**Causa**: O código estava tentando usar IDs de mensagens do WhatsApp (que são strings longas) como UUIDs.

**Solução Aplicada**:
- Adicionado tratamento de erro nos métodos `saveMessage` e `updateMessageStatus`
- Adicionado `ON CONFLICT` no INSERT para evitar duplicatas
- Melhorado o log de erros para facilitar debug

### 3. Erro: `Sessão user_2 não encontrada no banco`
**Causa**: Sessões que existem no disco (arquivos de autenticação) não têm registro correspondente no banco de dados.

**Solução Aplicada**:
- Modificado o método `restoreSessionsFromDatabase` para:
  - Verificar se existem sessões no disco sem registro no banco
  - Criar automaticamente o registro no banco para essas sessões
  - Restaurar essas sessões na memória

## Como Aplicar as Correções

### Opção 1: Migração Automática (Recomendado)
1. Faça o deploy do código atualizado no Koyeb
2. A migração será executada automaticamente na inicialização
3. Verifique os logs para confirmar: `✅ Migração: coluna contact_phone verificada/adicionada`

### Opção 2: Migração Manual no Supabase
1. Acesse o Supabase Dashboard
2. Vá em SQL Editor
3. Execute o script `migration_fix_messages.sql`
4. Faça o deploy do código atualizado no Koyeb

## Verificação Pós-Deploy

Após o deploy, verifique nos logs do Koyeb:

1. **Migração executada**:
   ```
   ✅ Migração: coluna contact_phone verificada/adicionada
   ```

2. **Sessões restauradas**:
   ```
   ✅ Sessão user_2 restaurada com sucesso
   💾 Sessão user_2 salva no banco com status: connected
   ```

3. **Mensagens sendo salvas**:
   ```
   📩 Mensagem recebida - SessionId: user_2, From: 5511...
   ```
   (Sem erros de `column "contact_phone"`)

4. **Envio de mensagens funcionando**:
   ```
   ✅ [SEND MESSAGE] Mensagem enviada com sucesso!
   ```

## Arquivos Modificados

1. `whatsapp-api/src/database.js`:
   - Adicionada migração automática para coluna `contact_phone`
   - Melhorado tratamento de erros em `saveMessage` e `updateMessageStatus`

2. `whatsapp-api/src/SessionManager.js`:
   - Modificado `restoreSessionsFromDatabase` para criar registros no banco para sessões órfãs

3. `whatsapp-api/migration_fix_messages.sql`:
   - Script SQL para migração manual (se necessário)

## Próximos Passos

1. Faça commit das alterações:
   ```bash
   git add .
   git commit -m "fix: corrige erros de banco de dados e restauração de sessões"
   git push origin main
   ```

2. O Koyeb detectará automaticamente o push e fará o redeploy

3. Monitore os logs no Koyeb para confirmar que:
   - A migração foi executada
   - As sessões foram restauradas
   - As mensagens estão sendo salvas corretamente
   - O envio de mensagens está funcionando

## Testando o Sistema

Após o deploy:

1. **Teste de Recebimento**:
   - Envie uma mensagem para o WhatsApp conectado
   - Verifique se aparece nos logs sem erros
   - Verifique se a mensagem aparece no CRM

2. **Teste de Envio**:
   - Tente enviar uma mensagem via API ou CRM
   - Verifique se a mensagem é enviada com sucesso
   - Confirme o recebimento no WhatsApp

3. **Teste de Assumir Conversa**:
   - No CRM, clique em "Chat"
   - Tente assumir uma conversa
   - Verifique se as mensagens anteriores são carregadas
   - Envie uma mensagem e confirme o recebimento
