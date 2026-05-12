# Prompt para Lovable - Correção ProspectFlow + WhatsApp API

Revise o projeto ProspectFlow inteiro com foco nos menus WhatsApp, Disparos, CRM, Conexão API e Construir Lista. Corrija a comunicação com a WhatsApp API para eliminar falso erro, falso inválido, duplicidade e status pendente após envio confirmado.

## Contrato da API

A API WhatsApp agora retorna campos padronizados. Use estes campos como fonte principal de verdade:

- `success`
- `status`
- `finalStatus`
- `shouldMarkLead`
- `confirmed`
- `invalidNumber`
- `messageId`
- `duplicate`
- `errorType`
- `action`

Regra obrigatória:

- Marcar lead como `Enviado` quando qualquer condição for verdadeira:
  - `success === true`
  - `confirmed === true`
  - `finalStatus === "sent"`
  - `shouldMarkLead === "sent"`
  - `status === "sent"`
  - existe `messageId`
  - `duplicate === true`

- Marcar lead como `Número Inválido` somente quando:
  - `invalidNumber === true`
  - ou `finalStatus === "invalid_number"`
  - ou `shouldMarkLead === "invalid"`
  - ou `status === "invalid_number"`

- Manter lead como `Pendente` ou `Tentará novamente` quando:
  - `finalStatus === "pending"`
  - ou `shouldMarkLead === "pending"`
  - ou `errorType` for `session_error`, `rate_limit` ou `temporary_send_error`
  - ou `action` for `retry_later` ou `reconnect_session`

Nunca marque um número válido como inválido por mensagens genéricas como `Could not send message`, `getContactById`, `No LID for user`, `reading 'isBot'`, timeout, websocket desconectado ou erro de confirmação do WhatsApp Web.

## Disparo Manual e Disparo Automático

Unifique os dois botões para chamarem uma única função central, por exemplo `sendLeadWhatsAppMessage(lead, options)`. A diferença entre manual e automático deve ser apenas a origem da chamada, não a regra de status.

Regras:

- Não faça retry que reenvia a mesma mensagem se a API retornou sucesso, `messageId`, `confirmed`, `shouldMarkLead: "sent"` ou `duplicate: true`.
- Se a API retornar erro temporário/pending, não reenvie imediatamente em loop; mantenha o lead pendente e aplique backoff.
- O botão `Disparo Automático` deve permitir vários usuários ao mesmo tempo, mas cada usuário deve ter sua fila local no frontend.
- Não dispare vários `fetch` paralelos para o mesmo usuário/sessão. Envie um lead por vez por usuário.
- Se dois usuários clicarem ao mesmo tempo, pode deixar rodar simultaneamente: a API já controla a fila global (`sendQueue`) e limita concorrência para proteger Koyeb/Chromium.
- Bloqueie duplo clique no botão automático enquanto uma campanha daquele usuário já estiver rodando.
- Salve uma chave idempotente por lead/campanha, usando `sessionId + phone + hash(message) + mediaUrl`, para evitar envio duplicado quando o navegador reconecta websocket ou o usuário clica novamente.
- Atualize contadores e badges da lista com base na resposta HTTP da API. WebSocket deve apenas reconciliar, nunca desfazer um status `Enviado` confirmado por HTTP.

## Integração de status no ProspectFlow

Ao receber resposta da API:

- Se enviado: atualizar lead para `whatsapp_status = "sent"`, `status = "Enviado"`, `sent_at = now()`, salvar `messageId` e limpar erro antigo.
- Se inválido: atualizar lead para `whatsapp_status = "invalid_number"`, `status = "Número Inválido"`, salvar erro técnico.
- Se pendente: manter lead como `Pendente`, salvar erro técnico em campo separado, e mostrar aviso discreto de tentativa futura.

Não exibir toast “número pode não existir” se a API retornou `shouldMarkLead: "pending"` ou `invalidNumber: false`.

## Menu Conexão API

Leia `/api/health` e mostre:

- sessões conectadas/desconectadas
- `sendQueue.active`
- `sendQueue.queued`
- `sendQueue.maxConcurrency`
- `sendQueue.dedupeMs`

Se houver fila, mostrar como “disparos em processamento”, não como erro.

## Construir Lista - ES com print do processo via extensão Claude

No fluxo do ES, o print deve ser extraído pela extensão criada via Claude que consulta o número do processo diretamente no site `https://processoeletronico.es.gov.br/`. Não capture um print genérico dentro do ProspectFlow depois do cadastro; o print correto é o da tela/resultado consultado pela extensão no momento em que ela encontra e salva o lead.

Implementação esperada:

- Na extensão Claude do Consulta Processo ES, após preencher o número do processo e carregar o resultado no `processoeletronico.es.gov.br`, capturar screenshot com `chrome.tabs.captureVisibleTab` ou mecanismo equivalente da própria extensão.
- O payload enviado da extensão para o ProspectFlow deve incluir os dados extraídos do processo e o arquivo/base64 do print associado ao mesmo processo/lead.
- Enviar a imagem para Supabase Storage em bucket como `lead-process-screenshots`.
- Caminho sugerido: `${user.id}/${lead.id}/${Date.now()}.png`.
- Salvar a URL pública ou assinada no lead/processo em campo como `process_print_url` ou `screenshot_url`.
- Mostrar miniatura/link do print no detalhe do lead e na lista quando aplicável.
- No menu Disparos, adicionar opção `Enviar print do processo junto com a mensagem`.
- Quando habilitado, enviar para a API com `mediaUrl: screenshotUrl` junto com `message`.

Endpoints aceitam `mediaUrl`:

- `POST /api/messages/send`
- `POST /api/sessions/:sessionId/message`
- `POST /api/sessions/:sessionId/messages`

Payload exemplo:

```json
{
  "sessionId": "user_88",
  "to": "5527999999999",
  "message": "Texto personalizado do lead...",
  "mediaUrl": "https://.../print-processo.png"
}
```

## Testes obrigatórios

Teste antes de publicar:

1. Disparo manual para número válido: mensagem chega uma vez e lead fica Enviado.
2. Disparo manual para número inválido real: lead fica Número Inválido.
3. Erro temporário/session/rate limit simulado: lead fica Pendente, não Inválido.
4. Disparo automático com 5 leads em um usuário: sem duplicar, status correto.
5. Disparo automático simultâneo em 2 ou mais usuários: cada usuário mantém sua fila, API controla a fila global, nenhum lead válido vira inválido.
6. Recarregar a página durante disparo: não reenviar mensagens já confirmadas.
7. ES Construir Lista: salvar lead com print, exibir print no lead e enviar texto + imagem pelo WhatsApp quando habilitado.
