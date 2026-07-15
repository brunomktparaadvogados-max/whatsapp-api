const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const crypto = require('crypto');
const path = require('path');
require('dotenv').config();

const DatabaseManager = require('./database');
const EvolutionWhatsAppProvider = require('./EvolutionWhatsAppProvider');
const MetaWhatsAppAPI = require('./MetaAPI');
const BotConversaAPI = require('./BotConversaAPI');
const { generateToken, authMiddleware } = require('./auth');

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

const db = new DatabaseManager();
const publicBaseUrl = (process.env.PUBLIC_BASE_URL || process.env.APP_URL || process.env.KOYEB_PUBLIC_DOMAIN || '')
  .replace(/^https?:\/\/(.+)$/, 'https://$1')
  .replace(/\/+$/, '');

const whatsapp = new EvolutionWhatsAppProvider({
  baseUrl: process.env.EVOLUTION_API_URL,
  apiKey: process.env.EVOLUTION_API_KEY || process.env.AUTHENTICATION_API_KEY,
  webhookUrl: process.env.EVOLUTION_WEBHOOK_URL || (publicBaseUrl ? `${publicBaseUrl}/api/webhooks/evolution` : null),
  webhookSecret: process.env.EVOLUTION_WEBHOOK_SECRET,
  instancePrefix: process.env.EVOLUTION_INSTANCE_PREFIX || 'pf'
});

const recentErrors = [];
const recentSends = new Map();
const SEND_DEDUPE_MS = parseInt(process.env.WHATSAPP_SEND_DEDUPE_MS || String(15 * 60 * 1000), 10);
const SEND_DELAY_MS = parseInt(process.env.EVOLUTION_SEND_DELAY_MS || '1200', 10);
const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || 'v20.0';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), {
  etag: false,
  maxAge: 0,
  setHeaders: (res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  }
}));

app.use('/api', (req, res, next) => {
  req.setTimeout(90000);
  res.setTimeout(90000);
  next();
});

function rememberError(scope, error, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    scope,
    code: error?.code || null,
    message: error?.message || String(error),
    details
  };
  recentErrors.unshift(entry);
  recentErrors.splice(50);
  console.error(`[${scope}]`, entry.message, details);
  return entry;
}

function sendError(res, error, fallbackStatus = 500) {
  const status = error?.status || fallbackStatus;
  return res.status(status).json({
    success: false,
    error: error?.message || 'Erro interno',
    code: error?.code || 'INTERNAL_ERROR',
    details: error?.details || undefined
  });
}

function isProspectFlowRequest(req) {
  const origin = String(req.get('origin') || '');
  let hostname = '';
  try {
    hostname = origin ? new URL(origin).hostname.toLowerCase() : '';
  } catch {
    hostname = '';
  }

  return hostname === 'marketing-comercial.adv.br' || hostname === 'www.marketing-comercial.adv.br';
}

function resolveDispatchMode(req) {
  if (req.body?.dispatchMode) return req.body.dispatchMode;
  return isProspectFlowRequest(req) ? 'prospecting' : null;
}

function assertCurrentProspectFlowDispatchClient(req) {
  if (!isProspectFlowRequest(req)) return true;

  const clientHeader = String(req.get('x-prospectflow-client') || '').toLowerCase();
  const contractVersion = Number(req.body?.clientContractVersion || 0);
  if (clientHeader === 'dispatch-v2' || contractVersion >= 2) return true;

  const err = new Error('Atualize a pagina do ProspectFlow antes de disparar. Esta versao foi bloqueada para evitar mensagens duplicadas.');
  err.status = 428;
  err.code = 'CLIENT_UPDATE_REQUIRED';
  throw err;
}

async function getCurrentUser(req) {
  return await db.getUserById(req.userId);
}

async function isAdmin(req) {
  const user = await getCurrentUser(req);
  return user?.email === 'admin@flow.com';
}

async function assertSessionAccess(req, sessionId) {
  const session = await db.getSession(sessionId);
  if (!session) {
    const err = new Error('Sessao nao encontrada');
    err.status = 404;
    throw err;
  }
  if (!(await isAdmin(req)) && session.user_id !== req.userId) {
    const err = new Error('Voce nao tem permissao para usar esta sessao');
    err.status = 403;
    throw err;
  }
  return session;
}

async function ensureDbSession(sessionId, userId) {
  await db.createSession(sessionId, userId);
  return await db.getSession(sessionId);
}

async function updateDbFromView(sessionId, view) {
  const status = view?.status || 'unknown';
  if (status === 'connected') {
    await db.markSessionReady(sessionId, view?.info?.ownerJid || view?.raw?.instance?.ownerJid || null, view?.info?.profileName || null, true);
  } else if (status === 'qr_code') {
    await db.updateSessionStatus(sessionId, 'qr_code');
  } else if (status === 'not_created') {
    await db.updateSessionStatus(sessionId, 'disconnected');
  } else if (['disconnected', 'failed', 'auth_failure'].includes(status)) {
    await db.updateSessionStatus(sessionId, status);
  } else {
    await db.updateSessionStatus(sessionId, 'initializing');
  }
}

function publicSessionView(row, providerView = null) {
  const status = providerView?.status || row?.status || 'not_created';
  const connected = status === 'connected';
  return {
    id: row?.id || providerView?.id,
    user_id: row?.user_id,
    status,
    canSend: connected,
    qrCode: connected ? null : (providerView?.qrCode || null),
    qr_code: connected ? null : (providerView?.qrCode || null),
    engine: 'evolution',
    instanceName: providerView?.instanceName || whatsapp.instanceNameForSession(row?.id || providerView?.id),
    info: providerView?.info || {
      wid: row?.phone_number ? { user: row.phone_number } : undefined,
      pushname: row?.phone_name || undefined
    },
    created_at: row?.created_at,
    updated_at: row?.updated_at
  };
}

async function getSessionView(sessionId, row = null, { activate = false, waitMs = 0, forceQr = false, resetInstance = false, user = null } = {}) {
  const dbSession = row || await db.getSession(sessionId);
  if (!dbSession) return null;

  let view;
  if (activate || forceQr) {
    view = await whatsapp.getQr(sessionId, { waitMs, forceQr, resetInstance, user });
  } else {
    view = await whatsapp.getState(sessionId);
  }

  await updateDbFromView(sessionId, view);
  const refreshed = await db.getSession(sessionId);
  return publicSessionView(refreshed || dbSession, view);
}

function normalizeMessageKey(sessionId, to, message, mediaUrl = null) {
  const number = whatsapp.normalizePhone(to);
  const body = `${String(message || '').trim().replace(/\s+/g, ' ')}|media:${String(mediaUrl || '')}`;
  const hash = crypto.createHash('sha256').update(body).digest('hex');
  return {
    number,
    hash,
    key: `${sessionId}:${number}:${hash}`
  };
}

async function claimSend(sessionId, to, message, mediaUrl = null) {
  const { key, number, hash } = normalizeMessageKey(sessionId, to, message, mediaUrl);
  const now = Date.now();
  const existing = recentSends.get(key);
  if (existing && now - existing < SEND_DEDUPE_MS) {
    return { duplicate: true, key, number, hash };
  }
  recentSends.set(key, now);
  setTimeout(() => recentSends.delete(key), SEND_DEDUPE_MS).unref?.();

  try {
    const acquired = await db.acquireWhatsAppSendLock(key, sessionId, number, hash, SEND_DEDUPE_MS);
    if (!acquired) return { duplicate: true, key, number, hash };
  } catch (error) {
    rememberError('send-lock', error, { sessionId, number });
  }

  return { duplicate: false, key, number, hash };
}

async function releaseSend(key) {
  recentSends.delete(key);
  try {
    await db.releaseWhatsAppSendLock(key);
  } catch (error) {
    rememberError('send-lock-release', error, { key });
  }
}

function normalizeProvider(provider) {
  if (provider === 'meta' || provider === 'meta_official') return 'meta_official';
  if (provider === 'botconversa' || provider === 'bot_conversa') return 'bot_conversa';
  return 'evolution';
}

function isAmbiguousEvolutionSendError(error) {
  return ['EVOLUTION_REQUEST_FAILED', 'EVOLUTION_NON_JSON_RESPONSE'].includes(error?.code) ||
    (error?.status === 502 && String(error?.details?.url || '').includes('/message/send'));
}

async function sendViaMetaOfficial({ sessionId, userId, to, message, mediaUrl = null }) {
  const config = await db.getMetaConfig(userId);
  if (!config) {
    const err = new Error('API oficial do WhatsApp nao configurada para este usuario');
    err.status = 400;
    throw err;
  }

  const meta = new MetaWhatsAppAPI(config.access_token, config.phone_number_id, { graphVersion: META_GRAPH_VERSION });
  const result = mediaUrl
    ? await meta.sendMedia(to, 'image', mediaUrl, message)
    : await meta.sendMessage(to, message);

  if (!result.success) {
    const err = new Error(result.error?.error?.message || result.error?.message || 'Falha ao enviar via API oficial do WhatsApp');
    err.status = result.error?.error?.code ? 502 : 400;
    err.details = result.error;
    throw err;
  }

  const messageId = result.data?.messages?.[0]?.id || crypto.randomUUID();
  await db.saveMessage({
    id: messageId,
    sessionId,
    contactPhone: to,
    messageType: mediaUrl ? 'media' : 'chat',
    body: message,
    mediaUrl,
    mediaMimetype: null,
    fromMe: true,
    timestamp: Date.now(),
    status: 'sent'
  });
  await db.upsertContact(sessionId, to);

  return {
    success: true,
    provider: 'meta_official',
    sessionId,
    to,
    messageId,
    confirmed: true,
    status: 'sent',
    finalStatus: 'sent',
    shouldMarkLead: 'sent',
    raw: result.data
  };
}

async function sendViaBotConversa({ sessionId, userId, to, firstName = '', message }) {
  const config = await db.getBotConversaConfig(userId);
  if (!config) {
    const err = new Error('BotConversa nao configurado para este usuario');
    err.status = 400;
    throw err;
  }

  const bot = new BotConversaAPI(config.api_key);
  const result = await bot.sendFlow({ phone: to, firstName, flowId: config.flow_id });
  const messageId = `botconversa-${result.subscriberId}-${Date.now()}`;

  await db.saveMessage({
    id: messageId,
    sessionId,
    contactPhone: result.to,
    messageType: 'bot_conversa_flow',
    body: message || `Fluxo BotConversa ${config.flow_name || config.flow_id}`,
    mediaUrl: null,
    mediaMimetype: null,
    fromMe: true,
    timestamp: Date.now(),
    status: 'sent'
  });
  await db.upsertContact(sessionId, result.to);

  return {
    success: true,
    provider: 'bot_conversa',
    sessionId,
    to: result.to,
    messageId,
    confirmed: true,
    status: 'sent',
    finalStatus: 'sent',
    shouldMarkLead: 'sent',
    botConversaSubscriberId: result.subscriberId,
    botConversaFlowId: result.flowId,
    raw: result.raw
  };
}

async function sendWhatsAppText({
  sessionId,
  to,
  message,
  mediaUrl = null,
  providerOverride = null,
  firstName = '',
  dispatchMode = null,
  leadKey = null,
  allowResend = false
}) {
  if (!to || !message) {
    const err = new Error('Campos "to" e "message" sao obrigatorios');
    err.status = 400;
    throw err;
  }

  const sessionRow = await db.getSession(sessionId);
  if (!sessionRow?.user_id) {
    const err = new Error('Sessao nao encontrada');
    err.status = 404;
    throw err;
  }

  const activeProvider = normalizeProvider(providerOverride || await db.getWhatsAppProvider(sessionRow.user_id));

  const claim = await claimSend(sessionId, to, message, mediaUrl);
  if (claim.duplicate) {
    return {
      success: true,
      duplicate: true,
      confirmed: false,
      status: 'duplicate_ignored',
      finalStatus: 'duplicate_ignored',
      shouldMarkLead: 'pending',
      message: 'Mensagem duplicada ignorada para evitar reenvio ao mesmo lead. O lead deve permanecer pendente ate confirmacao real.'
    };
  }

  const isProspectingDispatch = dispatchMode === 'prospecting';
  let persistentReservation = false;
  if (isProspectingDispatch) {
    try {
      persistentReservation = await db.reserveProspectingSend(
        sessionRow.user_id,
        sessionId,
        claim.number,
        claim.hash,
        leadKey,
        allowResend === true
      );
      if (allowResend === true) {
        console.info('[DispatchAudit] Reenvio manual confirmado pelo usuario', {
          userId: sessionRow.user_id,
          sessionId,
          to: claim.number,
          leadKey
        });
      }
    } catch (error) {
      await releaseSend(claim.key);
      throw error;
    }

    if (!persistentReservation) {
      return {
        success: true,
        duplicate: true,
        confirmed: false,
        status: 'duplicate_ignored',
        finalStatus: 'duplicate_ignored',
        shouldMarkLead: 'pending',
        persistent: true,
        message: 'Este telefone ja recebeu uma abordagem desta conta. Novo envio bloqueado pelo historico persistente.'
      };
    }
  }

  try {
    if (activeProvider === 'meta_official') {
      const result = await sendViaMetaOfficial({
        sessionId,
        userId: sessionRow.user_id,
        to: claim.number,
        message,
        mediaUrl
      });
      if (persistentReservation) {
        await db.updateProspectingSend(sessionRow.user_id, claim.number, result.status || 'sent', result.messageId);
      }
      return result;
    }

    if (activeProvider === 'bot_conversa') {
      if (mediaUrl) {
        const err = new Error('BotConversa usa fluxo configurado e nao aceita midia direta neste disparo');
        err.status = 400;
        throw err;
      }
      const result = await sendViaBotConversa({
        sessionId,
        userId: sessionRow.user_id,
        to: claim.number,
        firstName,
        message
      });
      if (persistentReservation) {
        await db.updateProspectingSend(sessionRow.user_id, claim.number, result.status || 'sent', result.messageId);
      }
      return result;
    }

    const result = mediaUrl
      ? await whatsapp.sendMedia(sessionId, claim.number, mediaUrl, message)
      : await whatsapp.sendText(sessionId, claim.number, message, { delay: SEND_DELAY_MS });

    const messageId = result.messageId || crypto.randomUUID();
    await db.saveMessage({
      id: messageId,
      sessionId,
      contactPhone: result.to,
      messageType: mediaUrl ? 'media' : 'chat',
      body: message,
      mediaUrl,
      mediaMimetype: null,
      fromMe: true,
      timestamp: Date.now(),
      status: 'pending_confirmation'
    });
    await db.upsertContact(sessionId, result.to);
    if (persistentReservation) {
      await db.updateProspectingSend(sessionRow.user_id, claim.number, 'pending_confirmation', messageId);
    }

    return {
      success: true,
      provider: 'evolution',
      sessionId,
      to: result.to,
      messageId,
      confirmed: false,
      status: 'pending_confirmation',
      finalStatus: 'pending_confirmation',
      shouldMarkLead: 'pending',
      message: 'Mensagem aceita pela Evolution. A entrega sera confirmada por webhook/status, nao por tentativa local.',
      raw: result.raw
    };
  } catch (error) {
    if (isAmbiguousEvolutionSendError(error)) {
      if (persistentReservation) {
        await db.updateProspectingSend(sessionRow.user_id, claim.number, 'pending_confirmation').catch(updateError => {
          rememberError('prospecting-history-update', updateError, { userId: sessionRow.user_id, sessionId, to: claim.number });
        });
      }
      rememberError('send-ambiguous', error, { sessionId, to, lockKey: claim.key });
      return {
        success: true,
        provider: 'evolution',
        sessionId,
        to: claim.number,
        messageId: '',
        confirmed: false,
        status: 'pending_confirmation',
        finalStatus: 'pending_confirmation',
        shouldMarkLead: 'pending',
        duplicateGuarded: true,
        message: 'A Evolution nao confirmou a resposta local, mas o disparo pode ter sido aceito. Reenvio bloqueado pelo anti-duplicado.'
      };
    }
    if (error?.code === 'SESSION_STALE_CONNECTION') {
      await db.updateSessionStatus(sessionId, 'disconnected').catch(statusError => {
        rememberError('session-stale-status', statusError, { userId: sessionRow.user_id, sessionId });
      });
    }
    if (persistentReservation) {
      await db.releaseProspectingSend(sessionRow.user_id, claim.number).catch(releaseError => {
        rememberError('prospecting-history-release', releaseError, { userId: sessionRow.user_id, sessionId, to: claim.number });
      });
    }
    await releaseSend(claim.key);
    throw error;
  }
}

async function handleSessionMessage(req, res, explicitSessionId = null) {
  try {
    const sessionId = resolveTargetSessionId(req, explicitSessionId);
    await assertSessionAccess(req, sessionId);
    const result = await sendWhatsAppText({
      sessionId,
      to: req.body.to,
      message: req.body.message,
      mediaUrl: req.body.mediaUrl,
      providerOverride: req.body.provider,
      firstName: req.body.firstName || req.body.name || '',
      dispatchMode: resolveDispatchMode(req),
      leadKey: req.body.leadKey,
      allowResend: req.body.allowResend === true
    });
    res.status(result.confirmed ? 200 : 202).json(result);
  } catch (error) {
    rememberError('send-message', error, { sessionId: explicitSessionId || req.body?.sessionId, to: req.body?.to });
    return sendError(res, error, error.status || 500);
  }
}

function resolveTargetSessionId(req, explicitSessionId = null) {
  if (explicitSessionId && explicitSessionId !== 'auto') return explicitSessionId;
  if (req.body?.sessionId && req.body.sessionId !== 'auto') return req.body.sessionId;
  return `user_${req.userId}`;
}

io.on('connection', (socket) => {
  socket.emit('connected', { message: 'Conectado ao servidor ProspectFlow WhatsApp Evolution' });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, company } = req.body;
    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Email, senha e nome sao obrigatorios' });
    }

    const userId = await db.createUser(email, password, name, company);
    const sessionId = `user_${userId}`;
    await ensureDbSession(sessionId, userId);
    const token = generateToken(userId);

    res.json({
      success: true,
      token,
      user: { id: userId, email, name, company },
      sessionId,
      sessionStatus: 'qr_code',
      message: 'Usuario criado. O QR Code sera gerado pela Evolution quando a sessao for aberta.'
    });
  } catch (error) {
    if (error.code === 'USER_EMAIL_EXISTS') return sendError(res, error, 409);
    rememberError('register', error);
    return sendError(res, error, 500);
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha sao obrigatorios' });
    }

    const user = await db.getUserByEmail(email);
    if (!user || !db.verifyPassword(password, user.password)) {
      return res.status(401).json({ error: 'Credenciais invalidas' });
    }

    const token = generateToken(user.id);
    const sessionId = `user_${user.id}`;
    const skipWhatsApp = user.email === 'admin@flow.com';
    await ensureDbSession(sessionId, user.id);

    if (!skipWhatsApp) {
      whatsapp.getQr(sessionId, { waitMs: 1, user }).catch(error => rememberError('login-qr-warmup', error, { sessionId }));
    }

    const row = await db.getSession(sessionId);
    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name, company: user.company },
      sessionId,
      sessionStatus: skipWhatsApp ? row?.status || 'not_created' : 'initializing',
      reactivationStarted: !skipWhatsApp
    });
  } catch (error) {
    rememberError('login', error);
    return sendError(res, error, 500);
  }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserById(req.userId);
    if (!user) return res.status(404).json({ error: 'Usuario nao encontrado' });

    const sessionId = `user_${req.userId}`;
    const row = await ensureDbSession(sessionId, req.userId);
    const sessionInfo = user.email === 'admin@flow.com'
      ? publicSessionView(row)
      : await getSessionView(sessionId, row, { activate: false });

    res.json({ success: true, user, session: sessionInfo });
  } catch (error) {
    rememberError('auth-me', error);
    return sendError(res, error, 500);
  }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Acesso negado' });
    const users = await db.getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.delete('/api/users/:userId', authMiddleware, async (req, res) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Acesso negado' });
    const userId = parseInt(req.params.userId, 10);
    await whatsapp.deleteInstance(`user_${userId}`).catch(error => rememberError('delete-user-instance', error, { userId }));
    await db.deleteUser(userId);
    res.json({ success: true, message: 'Usuario e instancia WhatsApp removidos' });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    engine: 'evolution',
    evolutionConfigured: whatsapp.configured(),
    timestamp: new Date().toISOString()
  });
});

app.get('/api/health', async (req, res) => {
  const checks = {
    database: { ok: false },
    evolution: { ok: whatsapp.configured() }
  };

  try {
    checks.database = await db.healthCheck();
  } catch (error) {
    checks.database = { ok: false, error: error.message, code: error.code || null };
  }

  try {
    const evolutionStatus = whatsapp.configured() ? await whatsapp.request('get', '/instance/fetchInstances') : null;
    checks.evolution = {
      ok: whatsapp.configured(),
      reachable: true,
      instances: Array.isArray(evolutionStatus) ? evolutionStatus.length : null
    };
  } catch (error) {
    checks.evolution = { ok: false, reachable: false, error: error.message, code: error.code || null };
  }

  const healthy = checks.database.ok && checks.evolution.ok && checks.evolution.reachable !== false;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'healthy' : 'degraded',
    engine: 'evolution',
    evolution: {
      configured: whatsapp.configured(),
      baseUrl: whatsapp.baseUrl || null,
      instancePrefix: whatsapp.instancePrefix
    },
    checks,
    recentErrors,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/ping', (req, res) => res.json({ pong: true, engine: 'evolution' }));

app.get('/api/my-session', authMiddleware, async (req, res) => {
  try {
    const sessionId = `user_${req.userId}`;
    const row = await ensureDbSession(sessionId, req.userId);
    const view = await getSessionView(sessionId, row, { activate: req.query.activate === 'true', waitMs: 3000 });
    res.json({ success: true, session: view });
  } catch (error) {
    rememberError('my-session', error);
    return sendError(res, error, 500);
  }
});

app.get('/api/my-qr', authMiddleware, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    const sessionId = `user_${req.userId}`;
    const row = await ensureDbSession(sessionId, req.userId);
    const view = await getSessionView(sessionId, row, {
      activate: true,
      forceQr: req.query.forceQr === 'true',
      waitMs: parseInt(req.query.waitMs || '8000', 10),
      user
    });
    res.status(view.qrCode || view.status === 'connected' ? 200 : 202).json({ success: true, ...view, session: view });
  } catch (error) {
    rememberError('my-qr', error);
    return sendError(res, error, 500);
  }
});

app.post('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const admin = await isAdmin(req);
    const targetSessionId = req.body?.sessionId || `user_${req.userId}`;
    const targetUserId = admin && targetSessionId.startsWith('user_')
      ? parseInt(targetSessionId.replace('user_', ''), 10)
      : req.userId;
    const user = await db.getUserById(targetUserId);
    if (!user) return res.status(404).json({ error: 'Usuario alvo nao encontrado' });
    if (!admin && targetUserId !== req.userId) return res.status(403).json({ error: 'Acesso negado' });

    const row = await ensureDbSession(targetSessionId, targetUserId);
    const view = await getSessionView(targetSessionId, row, {
      activate: true,
      forceQr: req.body?.forceQr === true,
      waitMs: parseInt(req.body?.waitMs || '8000', 10),
      user
    });

    res.status(view.qrCode || view.status === 'connected' ? 200 : 202).json({
      success: true,
      status: view.status,
      sessionId: targetSessionId,
      session: view,
      qrCode: view.qrCode
    });
  } catch (error) {
    rememberError('create-session', error, { body: req.body });
    return sendError(res, error, 500);
  }
});

app.post('/api/sessions/:sessionId/reactivate', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    let row = await db.getSession(sessionId);
    if (!row && (await isAdmin(req)) && sessionId.startsWith('user_')) {
      const userId = parseInt(sessionId.replace('user_', ''), 10);
      row = await ensureDbSession(sessionId, userId);
    } else if (!row) {
      row = await ensureDbSession(sessionId, req.userId);
    }
    await assertSessionAccess(req, sessionId);

    const user = await db.getUserById(row.user_id);
    const view = await getSessionView(sessionId, row, {
      activate: true,
      forceQr: req.body?.forceQr === true,
      waitMs: parseInt(req.body?.waitMs || '8000', 10),
      user
    });

    res.status(view.qrCode || view.status === 'connected' ? 200 : 202).json({
      success: true,
      status: view.status,
      action: 'evolution_connect',
      session: view,
      qrCode: view.qrCode
    });
  } catch (error) {
    rememberError('reactivate', error, { sessionId: req.params.sessionId });
    return sendError(res, error, 500);
  }
});

app.get('/api/sessions', authMiddleware, async (req, res) => {
  try {
    const rows = (await isAdmin(req)) ? await db.getAllSessionsFromDB() : await db.getSessionsByUserId(req.userId);
    const sessions = await Promise.all(rows.map(async row => {
      try {
        return await getSessionView(row.id, row, { activate: false });
      } catch (error) {
        rememberError('list-session-state', error, { sessionId: row.id });
        return publicSessionView(row);
      }
    }));
    res.json({ success: true, sessions });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    let row = await db.getSession(sessionId);
    if (!row && sessionId === `user_${req.userId}`) row = await ensureDbSession(sessionId, req.userId);
    if (!row) return res.status(404).json({ error: 'Sessao nao encontrada' });
    await assertSessionAccess(req, sessionId);

    const user = await db.getUserById(row.user_id);
    const view = await getSessionView(sessionId, row, {
      activate: req.query.activate === 'true',
      waitMs: parseInt(req.query.waitMs || '0', 10),
      forceQr: req.query.forceQr === 'true',
      user
    });
    res.json({ success: true, session: view });
  } catch (error) {
    rememberError('get-session', error, { sessionId: req.params.sessionId });
    return sendError(res, error, 500);
  }
});

app.get('/api/sessions/:sessionId/qr', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    let row = await db.getSession(sessionId);
    if (!row && sessionId === `user_${req.userId}`) row = await ensureDbSession(sessionId, req.userId);
    if (!row) return res.status(404).json({ error: 'Sessao nao encontrada' });
    await assertSessionAccess(req, sessionId);

    const user = await db.getUserById(row.user_id);
    const view = await getSessionView(sessionId, row, {
      activate: true,
      waitMs: parseInt(req.query.waitMs || '8000', 10),
      forceQr: req.query.forceQr === 'true',
      user
    });

    res.status(view.qrCode || view.status === 'connected' ? 200 : 202).json({
      success: true,
      status: view.status,
      qrCode: view.qrCode,
      session: view
    });
  } catch (error) {
    rememberError('get-qr', error, { sessionId: req.params.sessionId });
    return sendError(res, error, 500);
  }
});

app.delete('/api/sessions/:sessionId', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    await assertSessionAccess(req, sessionId);
    await whatsapp.logout(sessionId);
    await db.resetSessionAuthForQr(sessionId, 'disconnected');
    res.json({ success: true, message: 'Sessao desconectada na Evolution' });
  } catch (error) {
    rememberError('delete-session', error, { sessionId: req.params.sessionId });
    return sendError(res, error, 500);
  }
});

app.post('/api/sessions/:sessionId/messages', authMiddleware, async (req, res) => {
  assertCurrentProspectFlowDispatchClient(req);
  return handleSessionMessage(req, res, req.params.sessionId);
});

app.post('/api/sessions/:sessionId/message', authMiddleware, async (req, res) => {
  assertCurrentProspectFlowDispatchClient(req);
  return handleSessionMessage(req, res, req.params.sessionId);
});

app.post('/api/messages/send', authMiddleware, async (req, res) => {
  let sessionId = req.body?.sessionId;
  try {
    assertCurrentProspectFlowDispatchClient(req);
    sessionId = resolveTargetSessionId(req, req.body?.sessionId);
    await assertSessionAccess(req, sessionId);
    const result = await sendWhatsAppText({
      sessionId,
      to: req.body.to,
      message: req.body.message,
      mediaUrl: req.body.mediaUrl,
      providerOverride: req.body.provider,
      firstName: req.body.firstName || req.body.name || '',
      dispatchMode: resolveDispatchMode(req),
      leadKey: req.body.leadKey,
      allowResend: req.body.allowResend === true
    });
    res.status(result.confirmed ? 200 : 202).json(result);
  } catch (error) {
    rememberError('send-auto', error, { userId: req.userId, sessionId, to: req.body?.to });
    return sendError(res, error, error.status || 500);
  }
});

app.post('/api/sessions/:sessionId/messages/media', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.params;
    await assertSessionAccess(req, sessionId);
    const result = await sendWhatsAppText({
      sessionId,
      to: req.body.to,
      message: req.body.caption || '',
      mediaUrl: req.body.mediaUrl,
      providerOverride: req.body.provider,
      firstName: req.body.firstName || req.body.name || '',
      dispatchMode: resolveDispatchMode(req),
      leadKey: req.body.leadKey
    });
    res.status(result.confirmed ? 200 : 202).json(result);
  } catch (error) {
    rememberError('send-media', error, { sessionId: req.params.sessionId, to: req.body?.to });
    return sendError(res, error, error.status || 500);
  }
});

app.post('/api/webhooks/evolution', async (req, res) => {
  try {
    const expected = process.env.EVOLUTION_WEBHOOK_SECRET;
    if (expected && req.get('x-prospectflow-secret') !== expected) {
      return res.status(401).json({ error: 'Webhook nao autorizado' });
    }

    const event = whatsapp.ingestWebhook(req.body);
    if (event?.instanceName) {
      const sessionId = event.instanceName.replace(new RegExp(`^${whatsapp.instancePrefix}_`), '');
      if (event.status === 'connected') {
        await db.markSessionReady(sessionId, null, null, true).catch(() => {});
      } else if (event.status === 'qr_code') {
        await db.updateSessionStatus(sessionId, 'qr_code').catch(() => {});
      } else if (event.status === 'disconnected') {
        await db.updateSessionStatus(sessionId, 'disconnected').catch(() => {});
      }
      io.emit('whatsapp_status', { sessionId, ...event });
    }

    const messageId = req.body?.data?.key?.id || req.body?.data?.id || req.body?.key?.id || req.body?.messageId || null;
    const rawStatus = String(req.body?.data?.status || req.body?.status || req.body?.event || '').toLowerCase();
    const deliveredStates = ['delivery_ack', 'delivered', 'read', 'played', 'server_ack', 'send.message', 'send_message'];
    const failedStates = ['error', 'failed', 'undelivered'];
    if (messageId && deliveredStates.some(state => rawStatus.includes(state))) {
      await db.updateMessageStatus(messageId, 'delivered').catch(() => {});
      io.emit('whatsapp_message_status', { messageId, status: 'delivered' });
    } else if (messageId && failedStates.some(state => rawStatus.includes(state))) {
      await db.updateMessageStatus(messageId, 'failed').catch(() => {});
      io.emit('whatsapp_message_status', { messageId, status: 'failed' });
    }

    res.json({ success: true });
  } catch (error) {
    rememberError('evolution-webhook', error);
    res.status(200).json({ success: false });
  }
});

app.put('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    await db.updateSessionWebhook(req.params.sessionId, req.body.webhookUrl || req.body.url || null);
    res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/sessions/:sessionId/webhook', authMiddleware, async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const webhookUrl = await db.getSessionWebhook(req.params.sessionId);
    res.json({ success: true, webhookUrl });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/sessions/:sessionId/contacts', authMiddleware, async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const contacts = await db.getContactsBySession(req.params.sessionId);
    res.json({ success: true, contacts });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/sessions/:sessionId/contacts/:contactPhone/messages', authMiddleware, async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const messages = await db.getMessagesByContact(req.params.sessionId, req.params.contactPhone, 100);
    res.json({ success: true, messages });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/sessions/:sessionId/alive', authMiddleware, async (req, res) => {
  try {
    await assertSessionAccess(req, req.params.sessionId);
    const view = await whatsapp.getState(req.params.sessionId);
    res.json({ success: true, alive: view.status === 'connected', status: view.status, engine: 'evolution' });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/debug/errors', authMiddleware, async (req, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Acesso negado' });
  res.json({ success: true, errors: recentErrors });
});

app.get('/api/debug/sessions', authMiddleware, async (req, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Acesso negado' });
  const rows = await db.getAllSessionsFromDB();
  res.json({
    success: true,
    engine: 'evolution',
    sessions: rows.map(row => ({
      ...row,
      instanceName: whatsapp.instanceNameForSession(row.id)
    }))
  });
});

app.get('/api/admin/users-export', authMiddleware, async (req, res) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Acesso negado' });
    const users = await db.getAllUsers();
    res.json({
      success: true,
      users: users.map(user => ({
        id: user.id,
        name: user.name,
        email: user.email,
        company: user.company || null,
        created_at: user.created_at
      }))
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.post('/api/admin/reset-whatsapp-sessions', authMiddleware, async (req, res) => {
  try {
    if (!(await isAdmin(req))) return res.status(403).json({ error: 'Acesso negado' });
    const rows = await db.getAllSessionsFromDB();
    const results = [];
    for (const row of rows) {
      try {
        await whatsapp.deleteInstance(row.id);
        await db.resetSessionAuthForQr(row.id, 'disconnected');
        results.push({ sessionId: row.id, success: true });
      } catch (error) {
        rememberError('admin-reset-session', error, { sessionId: row.id });
        results.push({ sessionId: row.id, success: false, error: error.message });
      }
    }
    await db.run('DROP TABLE IF EXISTS whatsapp_auth_session_backups CASCADE').catch(error => rememberError('drop-legacy-auth-backups', error));
    await db.run('DROP TABLE IF EXISTS whatsapp_auth_sessions CASCADE').catch(error => rememberError('drop-legacy-auth-sessions', error));
    res.json({
      success: true,
      engine: 'evolution',
      legacyAuthRemoved: true,
      results
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.post('/api/admin/cleanup-sessions', authMiddleware, async (req, res) => {
  if (!(await isAdmin(req))) return res.status(403).json({ error: 'Acesso negado' });
  await db.run('DROP TABLE IF EXISTS whatsapp_auth_session_backups CASCADE').catch(error => rememberError('cleanup-drop-auth-backups', error));
  await db.run('DROP TABLE IF EXISTS whatsapp_auth_sessions CASCADE').catch(error => rememberError('cleanup-drop-auth-sessions', error));
  res.json({ success: true, engine: 'evolution', cleaned: 0, legacyAuthRemoved: true, message: 'Motor antigo removido; credenciais legadas descartadas.' });
});

app.get('/api/admin/reactivate-session/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const row = await db.getSession(sessionId);
    if (!row) return res.status(404).json({ error: 'Sessao nao encontrada' });
    const user = await db.getUserById(row.user_id);
    const view = await getSessionView(sessionId, row, { activate: true, forceQr: true, waitMs: 8000, user });
    res.json({ success: true, action: 'evolution_connect', session: view, qrCode: view.qrCode });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.post('/api/admin/require-qr/:sessionId', async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    await whatsapp.logout(sessionId).catch(() => {});
    await db.resetSessionAuthForQr(sessionId, 'qr_code');
    const row = await db.getSession(sessionId);
    const user = row ? await db.getUserById(row.user_id) : null;
    const view = await whatsapp.getQr(sessionId, { waitMs: 8000, forceQr: true, resetInstance: true, user });
    if (row) await updateDbFromView(sessionId, view);
    res.json({ success: true, session: publicSessionView(row, view), qrCode: view.qrCode });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/provider/config', authMiddleware, async (req, res) => {
  try {
    const summary = await db.getProviderSummary(req.userId);
    res.json({ success: true, ...summary });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.put('/api/provider/config', authMiddleware, async (req, res) => {
  try {
    const provider = normalizeProvider(req.body?.provider);
    await db.setWhatsAppProvider(req.userId, provider);
    const summary = await db.getProviderSummary(req.userId);
    res.json({ success: true, ...summary });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.post('/api/meta/config', authMiddleware, async (req, res) => {
  try {
    const { accessToken, phoneNumberId, businessAccountId } = req.body;
    if (!accessToken || !phoneNumberId) return res.status(400).json({ error: 'accessToken e phoneNumberId sao obrigatorios' });
    await db.saveMetaConfig(req.userId, accessToken, phoneNumberId, businessAccountId);
    res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/meta/config', authMiddleware, async (req, res) => {
  try {
    const config = await db.getMetaConfig(req.userId);
    res.json({ success: true, configured: !!config, config: config ? { phoneNumberId: config.phone_number_id, businessAccountId: config.business_account_id } : null });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.post('/api/meta/send', authMiddleware, async (req, res) => {
  try {
    const config = await db.getMetaConfig(req.userId);
    if (!config) return res.status(400).json({ error: 'Configure a API do Meta primeiro em /api/meta/config' });
    const meta = new MetaWhatsAppAPI(config.access_token, config.phone_number_id, { graphVersion: META_GRAPH_VERSION });
    const result = await meta.sendMessage(req.body.to, req.body.message);
    res.json(result);
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.post('/api/bot-conversa/config', authMiddleware, async (req, res) => {
  try {
    const { apiKey, flowId, flowName } = req.body;
    if (!apiKey || !flowId) return res.status(400).json({ error: 'apiKey e flowId sao obrigatorios' });
    await db.saveBotConversaConfig(req.userId, apiKey, flowId, flowName || null);
    res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/bot-conversa/config', authMiddleware, async (req, res) => {
  try {
    const config = await db.getBotConversaConfig(req.userId);
    res.json({
      success: true,
      configured: !!config,
      config: config ? { flowId: config.flow_id, flowName: config.flow_name } : null
    });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.post('/api/bot-conversa/flows', authMiddleware, async (req, res) => {
  try {
    const apiKey = req.body?.apiKey;
    if (!apiKey) return res.status(400).json({ error: 'apiKey obrigatorio' });
    const bot = new BotConversaAPI(apiKey);
    const flows = await bot.listFlows();
    res.json({ success: true, flows });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.get('/api/prospecting/lists/:listId/statuses', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM prospecting_lead_status WHERE list_id = $1', [req.params.listId]);
    res.json({ success: true, statuses: rows });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.put('/api/prospecting/lists/:listId/leads/:leadKey/status', async (req, res) => {
  try {
    const { status, leadName, ownerName, notes } = req.body;
    await db.run(`
      INSERT INTO prospecting_lead_status (list_id, lead_key, lead_name, status, owner_name, notes, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
      ON CONFLICT (list_id, lead_key)
      DO UPDATE SET status = EXCLUDED.status, lead_name = EXCLUDED.lead_name, owner_name = EXCLUDED.owner_name, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
    `, [req.params.listId, req.params.leadKey, leadName || req.params.leadKey, status || 'pending', ownerName || null, notes || null]);
    res.json({ success: true });
  } catch (error) {
    return sendError(res, error, 500);
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint nao implementado na API Evolution limpa',
    engine: 'evolution'
  });
});

server.listen(PORT, HOST, () => {
  console.log(`ProspectFlow WhatsApp API Evolution rodando em http://${HOST}:${PORT}`);
  console.log(`Evolution configurada: ${whatsapp.configured() ? 'sim' : 'nao'}`);
});

process.on('SIGTERM', async () => {
  console.log('SIGTERM recebido. Encerrando servidor...');
  server.close(() => process.exit(0));
});

module.exports = { app, server, whatsapp };
