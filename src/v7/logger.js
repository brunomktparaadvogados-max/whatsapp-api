// logger.js — shim de logger compatível com Baileys/pino (sem adicionar dependência)
// Baileys e makeCacheableSignalKeyStore esperam um logger pino-like: métodos
// trace/debug/info/warn/error, .child() e .level. Este shim silencia debug/trace
// e encaminha info/warn/error para o console, com prefixo [v7].

function makeLogger(prefix = '[v7]') {
  const noop = () => {};
  const fmt = (level) => (...args) => {
    // Baileys chama logger.info({ ...ctx }, 'msg'); normaliza para algo legível.
    const parts = args.map((a) => (typeof a === 'object' ? safe(a) : a));
    console[level === 'warn' ? 'warn' : level === 'error' ? 'error' : 'log'](prefix, level.toUpperCase(), ...parts);
  };
  const logger = {
    level: 'info',
    trace: noop,
    debug: noop,
    info: fmt('info'),
    warn: fmt('warn'),
    error: fmt('error'),
    fatal: fmt('error'),
    child: () => logger,
  };
  return logger;
}

function safe(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return String(obj);
  }
}

module.exports = { makeLogger };
