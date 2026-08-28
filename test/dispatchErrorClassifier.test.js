const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isExplicitInvalidNumberError,
  normalizeExplicitInvalidNumberError
} = require('../src/dispatchErrorClassifier');

test('classifies Evolution GO not-registered response as an invalid recipient', () => {
  const error = new Error('number 5522986955808 is not registered on WhatsApp');
  error.code = 'EVOGO_HTTP_ERROR';

  assert.equal(isExplicitInvalidNumberError(error), true);
  normalizeExplicitInvalidNumberError(error);
  assert.equal(error.code, 'INVALID_NUMBER');
  assert.equal(error.status, 422);
  assert.equal(error.invalidNumber, true);
  assert.equal(error.details.recipientInvalid, true);
  assert.equal(error.details.retryNextPhone, true);
});

test('does not classify LID lookup failures as an invalid recipient', () => {
  const error = new Error('no LID found for 5556993847187@s.whatsapp.net from server');
  error.code = 'EVOGO_HTTP_ERROR';

  assert.equal(isExplicitInvalidNumberError(error), false);
  assert.equal(normalizeExplicitInvalidNumberError(error), error);
  assert.equal(error.code, 'EVOGO_HTTP_ERROR');
});

test('does not classify sender restriction 463 as an invalid recipient', () => {
  const error = new Error('server returned error 463 account_reachout_restricted');
  error.code = 'WHATSAPP_SERVER_463';

  assert.equal(isExplicitInvalidNumberError(error), false);
});
