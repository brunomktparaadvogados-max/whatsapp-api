// server.js (v7) — API HTTP/WebSocket com motor Baileys
// -----------------------------------------------------------------------------
// Mantém o MESMO contrato de endpoints/eventos da v6, então o frontend
// (src/services/whatsappApi.ts) NÃO muda — só a env var VITE_WHATSAPP_API_URL
// aponta para este serviço no cutover.
//
// Reusa a infra validada: ../database (DatabaseManager, pool max 5) e ../auth
// (JWT). sessionId é determinístico: `user_${userId}` (igual à v6).
//
// Deploy: serviço Koyeb SEPARADO (dual-run) — a v6 continua no ar até o cutover.
// -----------------------------------------------------------------------------

const express = require('express');
const http = require('http');
const cors = require('cors');
const crypto = require('crypto');
const { Server } = require('socket.io');
const axios = require('axios');

const DatabaseManager = require('../database');
const { generateToken, authMiddleware, verifyToken } = require('../auth');
const { SessionManagerV7 } = require('./sessionManager');
const { SendQueue } = require('./sendQueue');

const PORT = process.env.PORT || 8000;
const WA_WEBHOOK_SECRET = process.env.WA_WEBHOOK_SECRET || '';
// Quanto o HTTP de envio espera pela confirmação de ENTREGA antes de responder
// 'pending' (mantém o contrato síncrono do dispatcher, sem falso "enviado").
const SEND_DELIVERY_WAIT_MS = Number(process.env.SEND_DELIVERY_WAIT_MS || 25_000);

const app = express();
app.use(cors());
app.use(express.json({ limit: '4mb' }));
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const db = new DatabaseManager();
let ready = false;

// Encaminha mensagem recebida ao webhook do usuário (assinado — item T2 auditoria).
async function forwardIncoming(sessionId, { phone, body, messageId, timestamp }) {
  let session;
  try {
    session = await db.getSession(sessionId);
  } catch {
    return;
  }
  const url = session?.webhook_url;
  if (!url) return;
  const payload = JSON.stringify({
    sessionId,
    phone,
    message: body,
    messageId,
    fromMe: false,
    timestamp: new Date((timestamp || 0) * 1000).toISOString(),
  });
  const sig = WA_WEBHOOK_SECRET
    ? crypto.createHmac('sha256', WA_WEBHOOK_SECRET).update(payload).digest('hex')
    : '';
  try {
    await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json', 'x-wa-webhook-secret': WA_WEBHOOK_SECRET, 'x-wa-signature': sig },
      timeout: 10_000,
    });
  } catch (e) {
    console.error('[v7] webhook falhou', e.message);
  }
}

const manager = new SessionManagerV7({ db, io, forwardIncoming });
const queue = new SendQueue(manager, console);

const sessionIdForUser = (userId) => `user_${userId}`;

// Socket.IO: cada cliente entra na sala da própria sessão (isolamento por usuário).
io.on('connection', (socket) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const decoded = token ? verifyToken(token) : null;
  if (decoded?.userId) socket.join(sessionIdForUser(decoded.userId));
  socket.on('authenticate', (t) => {
    const d = verifyToken(String(t || '').replace('Bearer ', ''));
    if (d?.userId) socket.join(sessionIdForUser(d.userId));
  });
});

// ── Auth (reusa users + JWT da v6) ──────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, company } = req.body;
    if (!email || !password || !name) return res.status(400).json({ error: 'email, password e name obrigatórios' });
    const userId = await db.createUser(email, password, name, company || null);
    const token = generateToken(userId);
    const sessionId = sessionIdForUser(userId);
    await db.createSession(sessionId, userId).catch(() => {});
    manager.ensureSession(sessionId, userId).catch(() => {});
    res.json({ success: true, token, user: { id: userId, email, name, company }, sessionId, sessionStatus: 'initializing' });
  } catch (e) {
    if (e.code === 'USER_EMAIL_EXISTS') return res.status(409).json({ error: e.message, userId: e.userId });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    const user = await db.getUserByEmail(email);
    if (!user || !db.verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }
    const token = generateToken(user.id);
    const sessionId = sessionIdForUser(user.id);
    await db.createSession(sessionId, user.id).catch(() => {});
    // Carrega a sessão SOB DEMANDA já no login (reconecta da credencial se houver).
    const st = await manager.ensureSession(sessionId, user.id).catch(() => ({ status: 'initializing' }));
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, company: user.company },
      sessionId,
      sessionStatus: st.status,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const sessionId = sessionIdForUser(req.userId);
    // Reacende sob demanda (sem precisar acionar manual).
    const st = await manager.ensureSession(sessionId, req.userId).catch(() => manager.statusOf(sessionId));
    res.json({
      success: true,
      user,
      session: { sessionId, status: st.status, qrCode: st.qrCode, info: st.info },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Sessões ──────────────────────────────────────────────────────────────────
app.post('/api/sessions', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  await db.createSession(sessionId, req.userId).catch(() => {});
  manager.ensureSession(sessionId, req.userId).catch(() => {});
  res.json({ success: true, sessionId, message: 'Sessão sendo iniciada' });
});

app.get('/api/sessions', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const st = manager.statusOf(sessionId);
  res.json({ success: true, sessions: [{ sessionId, status: st.status, qrCode: st.qrCode, info: st.info }] });
});

app.get('/api/sessions/:sessionId', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const st = await manager.ensureSession(sessionId, req.userId).catch(() => manager.statusOf(sessionId));
  res.json({ success: true, sessionId, status: st.status, qrCode: st.qrCode, info: st.info });
});

// QR SEMPRE disponível: ensureSession recria sob demanda; nunca fica mudo.
app.get('/api/sessions/:sessionId/qr', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const st = await manager.ensureSession(sessionId, req.userId).catch(() => manager.statusOf(sessionId));
  if (st.status === 'connected') return res.json({ success: true, status: 'connected', qrCode: null });
  if (!st.qrCode) return res.status(202).json({ success: true, status: st.status || 'initializing', qrCode: null, message: 'QR sendo preparado' });
  res.json({ success: true, status: st.status, qrCode: st.qrCode });
});

// Também sob /api/my-qr e /api/my-session (compat com a v6).
app.get('/api/my-qr', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const st = await manager.ensureSession(sessionId, req.userId).catch(() => manager.statusOf(sessionId));
  res.json({ success: true, status: st.status, qrCode: st.qrCode || null });
});
app.get('/api/my-session', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const st = await manager.ensureSession(sessionId, req.userId).catch(() => manager.statusOf(sessionId));
  res.json({ success: true, sessionId, status: st.status, qrCode: st.qrCode, info: st.info });
});

app.delete('/api/sessions/:sessionId', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  await manager._destroy(sessionId, /*deleteCreds*/ true); // delete explícito = novo QR.
  await db.updateSessionStatus(sessionId, 'disconnected').catch(() => {});
  res.json({ success: true });
});

// Botão "Forçar QR Code": descarta credencial e gera QR novo AGORA (quebra
// qualquer socket travado em 'initializing'). Idempotente e rápido.
async function handleRequireQr(req, res) {
  const sessionId = sessionIdForUser(req.userId);
  await db.createSession(sessionId, req.userId).catch(() => {});
  const st = await manager.forceQr(sessionId, req.userId).catch(() => manager.statusOf(sessionId));
  res.json({ success: true, sessionId, status: st.status, qrCode: st.qrCode });
}
app.post('/api/sessions/:sessionId/require-qr', authMiddleware, handleRequireQr);
app.post('/api/admin/require-qr/:sessionId', authMiddleware, handleRequireQr); // compat v6.

// Botão "Reconectar sessão salva": reconecta da credencial (sem re-parear).
// Também serve para destravar 'initializing'.
app.post('/api/sessions/:sessionId/reactivate', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  await db.createSession(sessionId, req.userId).catch(() => {});
  const st = await manager.reactivate(sessionId, req.userId).catch(() => manager.statusOf(sessionId));
  res.json({ success: true, sessionId, status: st.status, qrCode: st.qrCode });
});

// ── Envio (síncrono, com delivery-guard) ────────────────────────────────────
async function handleSend(req, res) {
  const sessionId = sessionIdForUser(req.userId);
  const { to, message } = req.body;
  if (!to || !message) return res.status(400).json({ error: 'Campos "to" e "message" são obrigatórios' });

  // Garante sessão carregada sob demanda.
  const st = await manager.ensureSession(sessionId, req.userId).catch(() => ({ status: 'initializing' }));
  if (st.status !== 'connected') {
    return res.status(200).json({ success: false, finalStatus: 'pending', errorType: 'session_error', action: 'reconnect_session', message: 'Sessão não conectada — reconectando' });
  }

  const r = await queue.enqueue(sessionId, to, message);

  if (r.outcome === 'invalid') {
    return res.status(200).json({ success: false, invalidNumber: true, finalStatus: 'invalid_number', message: r.error || 'Número sem WhatsApp' });
  }
  if (r.duplicate) {
    return res.status(200).json({ success: true, finalStatus: 'sent', duplicate: true, messageId: r.messageId });
  }
  if (r.outcome === 'pending' || !r.deliveryPromise) {
    return res.status(200).json({ success: false, finalStatus: 'pending', errorType: 'temporary_send_error', action: 'retry_later', message: r.error || 'Envio pendente' });
  }

  // Aguarda a ENTREGA de verdade (DELIVERY_ACK) até o teto; senão, pending.
  const timeout = new Promise((resolve) => setTimeout(() => resolve({ outcome: 'pending' }), SEND_DELIVERY_WAIT_MS));
  const outcome = await Promise.race([r.deliveryPromise, timeout]);

  if (outcome.outcome === 'sent') {
    return res.status(200).json({ success: true, finalStatus: 'sent', confirmed: true, messageId: r.messageId });
  }
  // Server aceitou mas ainda não confirmou entrega -> pending (não marca enviado).
  return res.status(200).json({ success: false, finalStatus: 'pending', errorType: 'temporary_send_error', action: 'retry_later', messageId: r.messageId, message: 'Sem confirmação de entrega — tentaremos novamente' });
}

app.post('/api/messages/send', authMiddleware, handleSend);
app.post('/api/sessions/:sessionId/message', authMiddleware, handleSend); // fallback legado do frontend.

// ── Webhook config (grava webhook_url na sessão) ────────────────────────────
app.put('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const { webhookUrl } = req.body;
  await db.query(`UPDATE sessions SET webhook_url=$1, updated_at=now() WHERE id=$2`, [webhookUrl, sessionId]).catch(() => {});
  res.json({ success: true });
});
app.get('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const s = await db.getSession(sessionId);
  res.json({ success: true, webhookUrl: s?.webhook_url || null });
});

// ── CRM: contatos e mensagens (lê da tabela messages) ───────────────────────
app.get('/api/sessions/:sessionId/messages/:contactPhone', authMiddleware, async (req, res) => {
  const sessionId = sessionIdForUser(req.userId);
  const phone = String(req.params.contactPhone).replace(/\D/g, '');
  const rows = await db.all(
    `SELECT id, contact_phone, body, from_me, timestamp, status FROM messages WHERE session_id=$1 AND contact_phone=$2 ORDER BY timestamp ASC LIMIT 200`,
    [sessionId, phone]
  ).catch(() => []);
  res.json({ success: true, messages: rows });
});

// ── Saúde / readiness ────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.status(200).json({ status: 'ok', version: 'v7' }));
app.get('/readyz', (req, res) => res.status(ready ? 200 : 503).json({ ready }));
app.get('/api/health', (req, res) => {
  res.json({ online: true, ready, version: 'v7', sessions: manager.stats(), sendQueue: queue.stats() });
});
app.get('/api/ping', (req, res) => res.json({ pong: true }));

// ── Shutdown gracioso ───────────────────────────────────────────────────────
async function onSigterm() {
  ready = false;
  try {
    await manager.shutdown();
  } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8000);
}
process.on('SIGTERM', onSigterm);
process.on('SIGINT', onSigterm);

async function boot() {
  await db.initTables();
  await db.query(`
    CREATE TABLE IF NOT EXISTS wa_v7_auth (
      session_id text NOT NULL,
      data_key   text NOT NULL,
      data_value jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (session_id, data_key)
    )`).catch((e) => console.error('[v7] migration wa_v7_auth', e.message));

  manager.startSweep();

  server.listen(PORT, async () => {
    console.log(`[v7] WhatsApp API (Baileys) na porta ${PORT}`);
    // Re-hidratação escalonada das sessões com credencial salva.
    try {
      const { rows } = await db.query(`SELECT DISTINCT session_id FROM wa_v7_auth WHERE data_key='creds'`);
      const ids = rows.map((r) => r.session_id);
      const C = 5;
      for (let i = 0; i < ids.length; i += C) {
        await Promise.all(ids.slice(i, i + C).map((id) => {
          const userId = Number(String(id).replace('user_', '')) || null;
          return manager.ensureSession(id, userId).catch(() => {});
        }));
      }
      console.log(`[v7] re-hidratadas ${ids.length} sessões`);
    } catch (e) {
      console.error('[v7] re-hidratação falhou', e.message);
    } finally {
      ready = true;
    }
  });
}

boot().catch((e) => {
  console.error('[v7] boot falhou', e);
  process.exit(1);
});

module.exports = { app, server, manager, queue };
