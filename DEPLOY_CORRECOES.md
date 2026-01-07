# Comandos para Deploy das Correções

## 1. Verificar as alterações
```bash
cd whatsapp-api
git status
```

## 2. Adicionar os arquivos modificados
```bash
git add src/database.js
git add src/SessionManager.js
git add migration_fix_messages.sql
git add CORRECAO_ERROS_BANCO.md
```

## 3. Fazer commit
```bash
git commit -m "fix: corrige erros de banco de dados e restauração de sessões

- Adiciona migração automática para coluna contact_phone na tabela messages
- Melhora tratamento de erros em saveMessage e updateMessageStatus
- Corrige restauração de sessões órfãs (existem no disco mas não no banco)
- Adiciona ON CONFLICT para evitar duplicatas de mensagens
- Melhora logs de erro para facilitar debug"
```

## 4. Fazer push para o repositório
```bash
git push origin main
```

## 5. Monitorar o deploy no Koyeb

Acesse: https://app.koyeb.com/

Aguarde o deploy completar e verifique os logs para confirmar:
- ✅ Migração executada
- ✅ Sessões restauradas
- ✅ Mensagens sendo salvas sem erros

## 6. Testar o sistema

Após o deploy:
1. Envie uma mensagem para o WhatsApp
2. Tente enviar uma mensagem via CRM
3. Tente assumir uma conversa no Chat

## Observações

- O Koyeb detectará automaticamente o push e fará o redeploy
- A migração será executada automaticamente na inicialização
- As sessões user_1 e user_2 serão restauradas e registradas no banco
- Os erros de "contact_phone" e "sessão não encontrada" devem desaparecer
