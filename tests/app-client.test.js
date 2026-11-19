'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync('app/client.js', 'utf8');
const EMAIL = 'site3793@gmail.com';
const json = (data, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  text: async () => JSON.stringify(data),
  json: async () => data
});
const future = () => Math.floor(Date.now() / 1000) + 3600;

function memoryStorage() {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key)
  };
}

function setup(fetchImpl, session) {
  const localStorage = memoryStorage();
  if (session) localStorage.setItem('rabel-session', JSON.stringify(session));
  const ctx = { fetch: fetchImpl, localStorage, URLSearchParams, console, crypto: { randomUUID: () => 'test-uuid' } };
  vm.createContext(ctx);
  vm.runInContext(source, ctx);
  return { api: ctx.RabelClient, localStorage };
}

const validSession = overrides => ({
  access_token: 'jwt-1',
  refresh_token: 'rt-1',
  expires_at: future(),
  user: { id: 'u1', email: EMAIL },
  ...overrides
});

test('il login salva la sessione e verifica i permessi di gestione', async () => {
  const calls = [];
  const { api, localStorage } = setup(async (url, options) => {
    calls.push([String(url), options]);
    if (String(url).includes('/auth/v1/token?grant_type=password')) {
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).email, EMAIL);
      return json({ access_token: 'jwt-1', refresh_token: 'rt-1', expires_in: 3600, token_type: 'bearer', user: { id: 'u1', email: EMAIL } });
    }
    if (String(url).includes('/rest/v1/rpc/rabel_is_owner')) {
      assert.equal(options.headers.Authorization, 'Bearer jwt-1');
      assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
      return json(true);
    }
    throw new Error('URL inatteso: ' + url);
  });

  const session = await api.login(EMAIL, '11223344');
  assert.equal(session.access_token, 'jwt-1');
  assert.ok(session.expires_at > Math.floor(Date.now() / 1000));
  assert.equal(JSON.parse(localStorage.getItem('rabel-session')).access_token, 'jwt-1');
  assert.equal(calls.length, 2);
});

test('credenziali errate e account senza permessi sono rifiutati', async () => {
  const wrong = setup(async () => json({ error_code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400));
  await assert.rejects(wrong.api.login(EMAIL, 'sbagliata'), /Email o password non validi/);

  const stranger = setup(async url => {
    if (String(url).includes('/auth/v1/token')) return json({ access_token: 'jwt-2', refresh_token: 'rt-2', expires_in: 3600 });
    return json(false);
  });
  await assert.rejects(stranger.api.login(EMAIL, '11223344'), /permessi/);
  assert.equal(stranger.localStorage.getItem('rabel-session'), null);
});

test('le richieste usano il JWT e mai la vecchia chiave tecnica', async () => {
  const calls = [];
  const { api } = setup(async (url, options) => {
    calls.push([String(url), options]);
    return json([{ id: 1 }]);
  }, validSession());

  await api.mutate('rabel_dishes', 'PATCH', { name: 'Test' }, { id: 'eq.1' });
  const [url, options] = calls[0];
  assert.match(url, /^https:\/\/[a-z]+\.supabase\.co\/rest\/v1\/rabel_dishes\?id=eq\.1$/);
  assert.equal(options.headers.Authorization, 'Bearer jwt-1');
  assert.ok(options.headers.apikey.startsWith('sb_publishable_'));
  assert.equal(options.headers['x-rabel-app-key'], undefined);
  assert.match(options.headers.Prefer, /return=representation/);
});

test('senza sessione si viene rimandati al login', async () => {
  const { api } = setup(async () => json([]));
  await assert.rejects(api.table('rabel_dishes'), /Accedi per continuare/);
});

test('il token scaduto viene rinnovato una sola volta anche con più richieste', async () => {
  let refreshes = 0;
  const { api, localStorage } = setup(async (url, options) => {
    if (String(url).includes('grant_type=refresh_token')) {
      refreshes++;
      assert.equal(JSON.parse(options.body).refresh_token, 'rt-old');
      return json({ access_token: 'jwt-new', refresh_token: 'rt-new', expires_in: 3600 });
    }
    assert.equal(options.headers.Authorization, 'Bearer jwt-new');
    return json([]);
  }, validSession({ access_token: 'jwt-old', refresh_token: 'rt-old', expires_at: Math.floor(Date.now() / 1000) - 10 }));

  await Promise.all([api.table('rabel_dishes'), api.table('rabel_categories'), api.table('rabel_hours')]);
  assert.equal(refreshes, 1);
  assert.equal(JSON.parse(localStorage.getItem('rabel-session')).refresh_token, 'rt-new');
});

test('refresh fallito chiude la sessione e una scrittura vuota è un errore', async () => {
  const expired = setup(async () => json({ error: 'invalid_grant' }, 400),
    validSession({ expires_at: Math.floor(Date.now() / 1000) - 10 }));
  await assert.rejects(expired.api.table('rabel_dishes'), /Sessione scaduta/);
  assert.equal(expired.localStorage.getItem('rabel-session'), null);

  const empty = setup(async () => json([]), validSession());
  await assert.rejects(empty.api.mutate('rabel_dishes', 'PATCH', { name: 'A' }, { id: 'eq.9' }), /Nessuna modifica/);
});

test('il logout elimina la sessione locale', async () => {
  const { api, localStorage } = setup(async () => json(null, 204), validSession());
  await api.logout();
  assert.equal(localStorage.getItem('rabel-session'), null);
  assert.equal(api.session(), null);
});
