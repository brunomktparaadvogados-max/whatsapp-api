// sendQueue.js — Fila de envio serial por sessão (v7)
// -----------------------------------------------------------------------------
// Serializa o sock.sendMessage (1 por vez por sessão) e aplica os delays
// humanizados validados (anti-ban). NÃO decide "enviado": devolve o resultado
// do rawSend (com deliveryPromise); quem chama aguarda a entrega com um teto.
//
// A fila LIBERA o slot logo após o send + delay (não fica presa 90s esperando
// entrega), então a vazão não trava num número que não recebe.
// -----------------------------------------------------------------------------

const MSG_DELAY_MS = [2000, 3000]; // 2-3s entre mensagens (validado).
const BATCH_SIZE = 25; // lote 20-30 (validado).
const BATCH_PAUSE_MS = [60_000, 120_000]; // pausa entre lotes.

const rand = ([a, b]) => Math.floor(a + Math.random() * (b - a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class SendQueue {
  constructor(manager, logger = console) {
    this.manager = manager;
    this.log = logger;
    this.queues = new Map(); // sessionId -> { items:[], running, sentInBatch }
  }

  /**
   * Enfileira e resolve com o resultado do rawSend:
   *   { outcome:'queued'|'invalid'|'pending', messageId, deliveryPromise }
   */
  enqueue(sessionId, number, text) {
    if (!this.queues.has(sessionId)) {
      this.queues.set(sessionId, { items: [], running: false, sentInBatch: 0 });
    }
    const q = this.queues.get(sessionId);
    return new Promise((resolve) => {
      q.items.push({ number, text, resolve });
      this._drain(sessionId);
    });
  }

  async _drain(sessionId) {
    const q = this.queues.get(sessionId);
    if (!q || q.running) return;
    q.running = true;
    try {
      while (q.items.length) {
        const item = q.items.shift();
        let res;
        try {
          res = await this.manager.rawSend(sessionId, item.number, item.text);
        } catch (e) {
          res = { outcome: 'pending', messageId: '', error: e?.message || 'erro no envio', deliveryPromise: null };
        }
        item.resolve(res);

        // Anti-ban: delay entre mensagens; pausa a cada lote.
        if (res.outcome !== 'invalid') {
          q.sentInBatch += 1;
          if (q.sentInBatch >= BATCH_SIZE) {
            q.sentInBatch = 0;
            const pause = rand(BATCH_PAUSE_MS);
            this.log.info?.(`[${sessionId}] pausa de lote ${Math.round(pause / 1000)}s`);
            await sleep(pause);
          } else if (q.items.length) {
            await sleep(rand(MSG_DELAY_MS));
          }
        }
      }
    } finally {
      q.running = false;
    }
  }

  stats() {
    let queued = 0;
    for (const q of this.queues.values()) queued += q.items.length;
    return { queues: this.queues.size, queued };
  }
}

module.exports = { SendQueue };
