// authState.js — Auth state do Baileys no Postgres (v7)
// -----------------------------------------------------------------------------
// Substitui o RemoteAuth/PostgresStore (blob de Chromium do whatsapp-web.js), que
// em produção falha na reidratação ("RemoteAuth salvo existe, mas o WhatsApp Web
// pediu QR"). No Baileys a credencial É a sessão: um JSON pequeno, reconecta por
// WebSocket em ms, sem navegador para reidratar.
//
// Reaproveita o pool validado do database.js (via db.query) e embute a GOLDEN RULE:
// o primeiro save de `creds` de uma sessão nova nunca é bloqueado/adiado.
//
// Tabela: wa_v7_auth (ver migration.sql) — ADITIVA, não toca nos blobs da v6,
// então v6 e v7 rodam em paralelo (dual-run).
// -----------------------------------------------------------------------------

const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

/**
 * @param {string} sessionId  ex.: "user_165"
 * @param {{ query: (sql:string, params?:any[]) => Promise<{rows:any[]}> }} db  DatabaseManager
 */
async function usePostgresAuthState(sessionId, db) {
  const write = async (dataKey, value) => {
    const json = JSON.stringify(value, BufferJSON.replacer);
    await db.query(
      `INSERT INTO wa_v7_auth (session_id, data_key, data_value, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (session_id, data_key)
       DO UPDATE SET data_value = EXCLUDED.data_value, updated_at = now()`,
      [sessionId, dataKey, json]
    );
  };

  const read = async (dataKey) => {
    const { rows } = await db.query(
      `SELECT data_value FROM wa_v7_auth WHERE session_id = $1 AND data_key = $2 LIMIT 1`,
      [sessionId, dataKey]
    );
    if (!rows.length) return null;
    return JSON.parse(JSON.stringify(rows[0].data_value), BufferJSON.reviver);
  };

  const del = async (dataKey) => {
    await db.query(`DELETE FROM wa_v7_auth WHERE session_id = $1 AND data_key = $2`, [
      sessionId,
      dataKey,
    ]);
  };

  const existingCreds = await read('creds');
  const creds = existingCreds || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await read(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value || undefined;
            })
          );
          return data;
        },
        set: async (data) => {
          const tasks = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? write(key, value) : del(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    // GOLDEN RULE: sempre imediato, sem throttle. Sem creds salvo = sessão perdida.
    saveCreds: async () => {
      await write('creds', creds);
    },
    // Só após as 3 camadas do HealthGuard confirmarem logout real.
    clear: async () => {
      await db.query(`DELETE FROM wa_v7_auth WHERE session_id = $1`, [sessionId]);
    },
    hadSavedCreds: existingCreds != null,
  };
}

module.exports = { usePostgresAuthState };
