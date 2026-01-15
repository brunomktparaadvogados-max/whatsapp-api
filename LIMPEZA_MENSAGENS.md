# 🧹 Script de Limpeza de Mensagens Antigas

Este script remove mensagens com mais de 24 horas do banco de dados para liberar espaço.

## 🚀 Como Executar

### Opção 1: Script Node.js (Recomendado)
```bash
cd whatsapp-api
node cleanup-messages.js
```

### Opção 2: Script SQL Direto
```bash
psql $DATABASE_URL -f cleanup-messages.sql
```

## 📊 O que o script faz:

1. ✅ Verifica estado atual do banco (total de mensagens, tamanho)
2. 🗑️ Deleta mensagens com mais de 24 horas
3. 🧹 Executa VACUUM FULL para liberar espaço físico
4. 📈 Mostra estatísticas antes e depois

## ⚠️ Importante:

- **NÃO afeta**: WhatsApps conectados, usuários, sessões, contatos
- **Remove**: Apenas histórico de mensagens antigas (>24h)
- **Seguro**: Pode ser executado a qualquer momento

## 🔄 Limpeza Automática

A partir de agora, o sistema executa limpeza automática:
- ⏰ A cada 1 hora (cron job)
- 🧹 Remove mensagens com mais de 24h
- 📊 Loga estatísticas no console

## 🛠️ Endpoints Adicionados

### POST /api/cleanup-messages
Executa limpeza manual de mensagens.

**Body (opcional):**
```json
{
  "hoursOld": 24
}
```

**Response:**
```json
{
  "success": true,
  "deletedCount": 1523,
  "remainingMessages": 45,
  "databaseSize": "125 MB",
  "message": "1523 mensagens antigas foram removidas com sucesso"
}
```

### GET /api/database-stats
Retorna estatísticas do banco de dados.

**Response:**
```json
{
  "success": true,
  "stats": {
    "totalMessages": 45,
    "databaseSize": "125 MB",
    "databaseSizeBytes": 131072000
  }
}
```

## 📝 Logs

O sistema agora loga automaticamente:
```
🧹 Executando limpeza automática de mensagens antigas...
✅ Limpeza concluída:
   - 1523 mensagens antigas removidas
   - 45 mensagens restantes
   - Tamanho do banco: 125 MB
```
