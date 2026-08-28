function isExplicitInvalidNumberError(error) {
  const code = String(error?.code || '').toUpperCase();
  const message = `${error?.message || ''} ${JSON.stringify(error?.details || {})}`.toLowerCase();
  return [
    'INVALID_NUMBER',
    'NUMBER_NOT_FOUND',
    'NOT_ON_WHATSAPP',
    'RECIPIENT_NOT_FOUND'
  ].includes(code) || [
    'not on whatsapp',
    'not registered on whatsapp',
    'numero invalido',
    'número inválido',
    'invalid number',
    'recipient not found'
  ].some(fragment => message.includes(fragment));
}

function normalizeExplicitInvalidNumberError(error) {
  if (!isExplicitInvalidNumberError(error)) return error;
  error.code = 'INVALID_NUMBER';
  error.status = 422;
  error.invalidNumber = true;
  error.details = {
    ...(error?.details && typeof error.details === 'object' ? error.details : {}),
    recipientInvalid: true,
    retryNextPhone: true
  };
  return error;
}

module.exports = {
  isExplicitInvalidNumberError,
  normalizeExplicitInvalidNumberError
};
