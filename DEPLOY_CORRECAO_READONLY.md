# 🚀 Guia de Deploy - Correção Banco Read-Only

## 📋 Problema Identificado

Seu banco PostgreSQL no Koyeb atingiu o limite de **1GB** e entrou em **modo read-only**.

**Causa:** Tabela `messages` acumulando todas as mensagens sem limite de tempo.

## ✅ Solução Implementada

### 1. Limpeza Automática de Mensagens
- ⏰ Executa a cada 1 hora
- 🗑️ Remove mensagens com mais de 24h
- 📊 Mantém apenas mensagens recentes

### 2. Endpoints de Gerenciamento
- `POST /api/cleanup-messages` - Limpeza manual
- `GET /api/database-stats` - Estatísticas do banco

### 3. Limpeza Inicial ao Iniciar
- Executa automaticamente 5 segundos após o servidor iniciar

## 🔧 Como Aplicar no Koyeb

### Passo 1: Executar Limpeza Emergencial (AGORA)

**Opção A: Via Script Local**
```bash
cd whatsapp-api
node cleanup-messages.js
```

**Opção B: Via Koyeb CLI (se tiver acesso)**
```bash
# Conectar ao banco e executar
psql $DATABASE_URL -c "DELETE FROM messages WHERE created_at < NOW() - INTERVAL '24 hours'; VACUUM FULL messages;"
```

### Passo 2: Fazer Deploy das Mudanças

**Opção A: Via Git (Recomendado)**
```bash
cd whatsapp-api
git add .
git commit -m "feat: adicionar limpeza automática de mensagens para evitar limite de 1GB"
git push origin main
```

O Koyeb detectará automaticamente e fará o deploy.

**Opção B: Via Koyeb Dashboard**
1. Acesse https://app.koyeb.com
2. Vá em seu serviço
3. Clique em "Redeploy"
4. Aguarde o deploy concluir

### Passo 3: Verificar se Funcionou

Após o deploy, acesse:
```
https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/database-stats
```

Você deve ver algo como:
```json
{
  "success": true,
  "stats": {
    "totalMessages": 45,
    "databaseSize": "125 MB"
  }
}
```

## 📊 Monitoramento

### Verificar Logs do Koyeb
Você verá logs como:
```
🧹 Executando limpeza inicial de mensagens antigas...
✅ Limpeza inicial: 1523 mensagens antigas removidas

🧹 Executando limpeza automática de mensagens antigas...
✅ Limpeza concluída:
   - 1523 mensagens antigas removidas
   - 45 mensagens restantes
   - Tamanho do banco: 125 MB
```

### Executar Limpeza Manual (se necessário)
```bash
curl -X POST https://racial-debby-1brunomktecomercial-eb2f294d.koyeb.app/api/cleanup-messages \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"hoursOld": 24}'
```

## ⚠️ Importante

### ✅ O que NÃO será afetado:
- WhatsApps conectados (permanecem logados)
- Contas de usuários
- Sessões ativas
- Contatos salvos
- Configurações de webhook

### ❌ O que será removido:
- Histórico de mensagens com mais de 24h
- Mensagens de status (`status@broadcast`)
- Mensagens antigas de grupos

## 🔄 Próximos Passos

1. **Executar limpeza emergencial** (Passo 1)
2. **Fazer deploy** (Passo 2)
3. **Verificar funcionamento** (Passo 3)
4. **Monitorar logs** para confirmar limpeza automática

## 💡 Dicas

- O banco deve voltar ao modo de escrita após liberar espaço
- A limpeza automática evitará que o problema ocorra novamente
- Mensagens são mantidas por 24h (tempo suficiente para envio/recebimento)
- Se precisar manter mensagens por mais tempo, ajuste o parâmetro `hoursOld`

## 🆘 Se o Problema Persistir

Se após a limpeza o banco continuar read-only:

1. Verifique se o tamanho está abaixo de 1GB
2. Execute VACUUM FULL manualmente:
   ```sql
   VACUUM FULL messages;
   VACUUM FULL contacts;
   ```
3. Considere migrar para um plano pago do Koyeb
4. Ou migrar para outro provedor (Supabase, Railway, Render)

## 📞 Suporte

Se precisar de ajuda, verifique:
- Logs do Koyeb: https://app.koyeb.com
- Documentação: `LIMPEZA_MENSAGENS.md`
