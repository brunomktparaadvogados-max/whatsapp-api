# WhatsApp API v7 — motor Baileys (dual-run)

Nova versão da API que resolve, na **raiz**, os erros recorrentes do motor atual
(whatsapp-web.js + Chromium): sessões que caem e pedem QR de novo, "Carregando
sessão..." travado, "Falha na autenticação", precisar acionar manual, e mensagem
marcada como enviada que não chega.

## Por que resolve (evidência de produção)

O `/api/health` da v6 hoje mostra `connectedSessions: 0` de `5`, com
`activeChromiums: 5` — cinco navegadores gastando RAM para **zero** sessões
conectadas, e erros `RemoteAuth salvo existe, mas o WhatsApp Web pediu QR durante
reidratação`. Ou seja: a credencial existe, mas re-hidratar o Chromium falha.

No Baileys **a credencial É a sessão**: reconecta por WebSocket em milissegundos,
sem navegador para re-hidratar. RAM por sessão cai de ~250 MB para ~10-30 MB.

## O que já vem implementado

| Requisito | Onde |
|---|---|
| Carrega a sessão **sob demanda** (login/abrir tela/enviar) — sem acionar manual | `sessionManager.ensureSession` + `server` (login/me/qr chamam ensureSession) |
| **QR sempre disponível**: regenera sozinho quando expira, enquanto não escaneado | `_onConnection` (close→`_refreshQr`) |
| **Não hiberna** sessão aguardando QR; só após 6h sem scan **ou** sobrecarga | `_sweep` + `QR_KEEPALIVE_MAX_MS` |
| Hiberna sessão **conectada e ociosa > 3h** (reconecta sob demanda, sem QR) | `_sweep` + `IDLE_HIBERNATE_MS` |
| **"Enviado" só com entrega real** (DELIVERY_ACK); ambíguo = pending → volta à fila | `rawSend` + `handleSend` (delivery-guard) |
| Número **sem WhatsApp** vira `invalid` **antes** de enviar | `rawSend` (`onWhatsApp`) |
| **Golden Rule** (1º save de credencial sagrado) | `authState.saveCreds` |
| **HealthGuard 3 camadas** (só apaga credencial em logout real) | `sessionManager._handleLoggedOut` |
| Fila **serial por sessão** + delays 2-3s / lote 25 (anti-ban) | `sendQueue` |
| **SIGTERM gracioso** + re-hidratação escalonada no boot | `server` |
| Webhook de recebimento **assinado** (HMAC) | `server.forwardIncoming` |

## Contrato preservado (frontend NÃO muda)

Mesmos endpoints e eventos da v6 (`/api/auth/*`, `/api/sessions*`,
`/api/messages/send`, `/api/sessions/:id/message`, `/api/sessions/:id/qr`,
`/health`, `/api/health`; eventos `qr_code`, `session_connected`,
`message_status`, `new_message`). `sessionId = user_${userId}`. Reusa
`../database` (pool max 5) e `../auth` (JWT). Só a env var
`VITE_WHATSAPP_API_URL` aponta para a v7 no cutover.

## Deploy dual-run (sem downtime, sem tocar na v6)

1. **Migração:** a tabela `wa_v7_auth` é criada automaticamente no boot
   (aditiva; não toca nos blobs da v6). v6 e v7 coexistem.
2. **Novo serviço Koyeb** (separado do atual):
   - Build: `Dockerfile.v7` (sem Chromium).
   - Start: `node src/v7/server.js` (ou `npm run start:v7`).
   - Env: `DATABASE_URL`, `JWT_SECRET` (o **mesmo** da v6, p/ tokens valerem),
     `WA_WEBHOOK_SECRET`, `PORT=8000`, `SEND_DELIVERY_WAIT_MS` (opcional, 25000).
3. **Cobaia:** aponte `VITE_WHATSAPP_API_URL` de 1 usuário para a URL da v7.
   Ele escaneia o QR uma vez (formatos de auth v6/v7 são incompatíveis).
4. **Valide** (checklist abaixo) e vá migrando usuários.
5. **Cutover:** aponte todos para a v7 e aposente a v6.
6. **Rollback:** basta reapontar a env var para a v6.

## Checklist de validação (com número cobaia)

- [ ] Login → QR aparece em ≤ 5s; escanear → conecta; `restartRequired(515)` não
      pede QR de novo.
- [ ] Fechar e reabrir a tela → sessão reconecta **sozinha** (sem botão manual).
- [ ] Deixar a tela de QR aberta 2-3 min sem escanear → QR continua disponível
      (regenerou), sessão **não** hibernou.
- [ ] Enviar para número real → só fica "enviado" após entrega; para número
      desligado → fica `pending`/volta à fila (nunca falso "enviado").
- [ ] Enviar para número sem WhatsApp → `invalid` sem tentativa.
- [ ] `SIGTERM` (redeploy) → sessão volta por WebSocket em segundos, sem re-scan.

## Limitações honestas

- Ainda **não testado contra o WhatsApp real** neste ambiente (sem aparelho para
  escanear). Validar com número cobaia antes do cutover.
- `getMessage` (retry de mensagem) usa LRU em memória; reinício perde o cache.
- A camada de admin/Meta/auto-replies/scheduled da v6 não foi reimplementada aqui
  (o core de conexão + envio + recebimento + CRM está completo). Portar sob
  demanda se necessário.
- Remover as credenciais hardcoded do `admin-whatsapp-proxy` (item T1 da auditoria
  em `sistemaflow/docs/security-audit-2026-07.md`) antes de expor o admin.
