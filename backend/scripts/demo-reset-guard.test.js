// Run with `npm run test:guard` (node:test, no database needed).
const test = require('node:test');
const assert = require('node:assert/strict');
const { databaseName, demoResetRefusal } = require('./demo-reset-guard');

const demo = 'postgresql://sneaker-drop:pw@postgres:5432/sneaker-drop';

test('databaseName reads the URL path', () => {
  assert.equal(databaseName(demo), 'sneaker-drop');
  assert.equal(databaseName('postgres://u:p%2Fw@postgres/sneaker-drop?sslmode=disable'), 'sneaker-drop');
  assert.equal(databaseName('postgresql://u:p@postgres:5432/'), '');
  assert.equal(databaseName('not a url'), '');
});

test('refuses unless DEMO_RESET_ALLOWED is exactly true', () => {
  for (const allowed of [undefined, '', 'false', '1', 'TRUE']) {
    assert.match(demoResetRefusal({ DEMO_RESET_ALLOWED: allowed, DATABASE_URL: demo }), /DEMO_RESET_ALLOWED/);
  }
});

test('refuses databases outside the allowlist', () => {
  for (const url of [
    'postgresql://other_app:pw@postgres:5432/other_app',
    'postgresql://u:p@postgres:5432/sneaker_drop',
    'postgresql://u:p@postgres:5432/',
    undefined,
  ]) {
    assert.match(demoResetRefusal({ DEMO_RESET_ALLOWED: 'true', DATABASE_URL: url }), /allowed: sneaker-drop/);
  }
});

test('allows the demo database', () => {
  assert.equal(demoResetRefusal({ DEMO_RESET_ALLOWED: 'true', DATABASE_URL: demo }), null);
});
