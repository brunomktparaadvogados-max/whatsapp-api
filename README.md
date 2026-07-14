# ProspectFlow WhatsApp Adapter

Adapter Node.js em producao para o ProspectFlow. A Evolution API e o motor
padrao; Meta oficial e BotConversa sao provedores opcionais selecionados por
usuario.

## Producao

- API publica: `https://143-95-221-102.sslip.io`
- VPS: `/opt/prospectflow-whatsapp`
- Branch: `codex/koyeb-session-safety`
- Evolution interna: `http://evolution-api:8080`
- Instancias: `pfvps_user_{id}`

Nao usar configuracoes antigas do Koyeb. A VPS executa:

- `adapter`
- `evolution-api`
- `evolution-postgres`
- `evolution-redis`
- `caddy`

## Contratos

- `connected` so e valido com `canSend=true`.
- QR forcado limpa cache e recria a instancia de forma controlada.
- O envio usa trava persistente por sessao, telefone e conteudo.
- `pending_confirmation` e `duplicate_ignored` nao sao entrega confirmada.
- Resposta ambigua preserva a trava e impede reenvio imediato.
- Um unico provedor executa cada chamada.

## Verificacao

```bash
npm ci
node --check src/server.js
node --check src/EvolutionWhatsAppProvider.js
```

## Deploy

```bash
cd /opt/prospectflow-whatsapp/adapter
git fetch origin codex/koyeb-session-safety
git merge --ff-only origin/codex/koyeb-session-safety
cd ..
docker compose up -d --build adapter
docker compose ps
docker compose logs --tail=120 adapter
```

Nao documente segredos e nao remova backups ou mudancas desconhecidas da VPS.

Para arquitetura completa, consulte
`sistemaflow/docs/PROSPECTFLOW_WHATSAPP_OPERATIONS.md`.
