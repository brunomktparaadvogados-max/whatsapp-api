# ProspectFlow WhatsApp Evolution Adapter

API limpa do ProspectFlow para WhatsApp usando Evolution API como motor oficial.

## Arquitetura

- `prospectflow-whatsapp-api`: painel/API do ProspectFlow.
- `evolution-api`: motor WhatsApp baseado na Evolution API.
- `evolution-postgres`: banco persistente da Evolution.
- `evolution-redis`: cache/estado da Evolution.

O ProspectFlow nao abre navegador, nao usa sessao local e nao gerencia credenciais WhatsApp diretamente. QR, reconexao e envio passam pela Evolution.

## Variaveis obrigatorias do ProspectFlow

```env
DATABASE_URL=postgresql://...
JWT_SECRET=...
PUBLIC_BASE_URL=https://sua-api-prospectflow.koyeb.app
EVOLUTION_API_URL=https://sua-evolution-api.koyeb.app
EVOLUTION_API_KEY=sua-chave-forte
EVOLUTION_WEBHOOK_URL=https://sua-api-prospectflow.koyeb.app/api/webhooks/evolution
EVOLUTION_INSTANCE_PREFIX=pf
```

## Variaveis obrigatorias da Evolution

```env
SERVER_PORT=8080
SERVER_URL=https://sua-evolution-api.koyeb.app
AUTHENTICATION_API_KEY=sua-chave-forte
DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_CONNECTION_URI=postgresql://...
CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=redis://...
CACHE_REDIS_SAVE_INSTANCES=true
```

## Contrato funcional

- Usuario novo ou desconectado: API chama `/instance/create` e `/instance/connect/:instanceName` na Evolution.
- QR disponivel: retornado em `qrCode`.
- Conectado: `status=connected`, `canSend=true`, sem QR visivel.
- Envio: `POST /message/sendText/:instanceName` na Evolution.
- Retorno inicial de envio: pendente, nunca marcado como entregue antes de webhook/status.
- Webhook da Evolution: atualiza conexao, QR e status de mensagem.

## Checagem local

```bash
npm ci
npm run check
docker compose up --build
```

## Observacao de deploy

O servico Evolution deve existir antes do ProspectFlow conseguir gerar QR. A URL e a chave da Evolution nao existem na documentacao: sao criadas no deploy do servico Evolution.
