/* Accesso con Supabase Auth (email + password).
   La chiave "publishable" è pubblica per progetto: i permessi sono applicati
   dalle RLS in base all'utente autenticato. Nessun segreto dentro la build. */
(function (root) {
  'use strict';
  const BASE = 'https://mpspdmjvjkqsssxgbxkm.supabase.co';
  const KEY = 'sb_publishable_DQmp56xX11ChgWZRMgA7Ng_c31EPH4w';
  const STORE = 'rabel-session';

  const read = () => { try { return JSON.parse(root.localStorage.getItem(STORE)); } catch (_) { return null; } };
  const save = session => {
    if (!session) root.localStorage.removeItem(STORE);
    else root.localStorage.setItem(STORE, JSON.stringify(session));
  };
  function normalize(session) {
    if (session && !session.expires_at) {
      session.expires_at = Math.floor(Date.now() / 1000) + (Number(session.expires_in) || 3600);
    }
    return session;
  }

  async function auth(path, body) {
    const response = await fetch(BASE + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const code = data && (data.error_code || data.error);
      const message = {
        invalid_credentials: 'Email o password non validi',
        email_not_confirmed: 'Email non confermata',
        over_request_rate_limit: 'Troppi tentativi, riprova tra qualche minuto'
      }[code] || (data && (data.msg || data.error_description || data.message)) || 'Accesso non riuscito';
      throw new Error(message);
    }
    return normalize(data);
  }

  async function login(email, password) {
    const session = await auth('token?grant_type=password', { email, password });
    save(session);
    const notOwner = 'Questo account non ha i permessi di gestione';
    try {
      if (await rpc('rabel_is_owner', {}) === false) { save(null); throw new Error(notOwner); }
    } catch (error) {
      if (error.message === notOwner) throw error;   // controllo non disponibile: non bloccare l'accesso
    }
    return session;
  }

  async function logout() {
    const session = read();
    save(null);
    if (session && session.access_token) {
      fetch(BASE + '/auth/v1/logout', {
        method: 'POST',
        headers: { apikey: KEY, Authorization: 'Bearer ' + session.access_token }
      }).catch(() => {});
    }
  }

  let pending = null;
  async function accessToken() {
    const session = read();
    if (!session || !session.access_token) throw new Error('Accedi per continuare');
    if (session.expires_at && session.expires_at - 120 > Date.now() / 1000) return session.access_token;
    pending ||= auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token })
      .then(next => { save(next); return next.access_token; })
      .catch(() => { save(null); throw new Error('Sessione scaduta: accedi di nuovo'); })
      .finally(() => { pending = null; });
    return pending;
  }

  async function request(path, options = {}) {
    const token = await accessToken();
    const response = await fetch(BASE + '/' + path, {
      ...options,
      headers: { apikey: KEY, Authorization: 'Bearer ' + token, ...options.headers },
      cache: 'no-store'
    });
    const text = await response.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (response.status === 401) { save(null); throw new Error('Sessione scaduta: accedi di nuovo'); }
    if (!response.ok) throw new Error((data && (data.message || data.error_description || data.error)) || 'Errore di rete (' + response.status + ')');
    return data;
  }

  function table(name, query = {}) { return request('rest/v1/' + name + '?' + new URLSearchParams(query)); }

  async function mutate(name, method, data, query = {}, upsert = false) {
    const result = await request('rest/v1/' + name + '?' + new URLSearchParams(query), {
      method,
      headers: { 'Content-Type': 'application/json', Prefer: (upsert ? 'resolution=merge-duplicates,' : '') + 'return=representation' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
    if (!Array.isArray(result) || result.length === 0) throw new Error('Nessuna modifica effettuata: ricarica i dati');
    return result;
  }

  function rpc(name, data) {
    return request('rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  }

  function photoUrl(path) {
    return path ? BASE + '/storage/v1/object/public/rabel-photos/' + path.split('/').map(encodeURIComponent).join('/') : '';
  }

  async function upload(file, dishId) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Usa un’immagine JPEG, PNG o WebP');
    if (file.size > 5 * 1024 * 1024) throw new Error('La foto supera 5 MB');
    const ext = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' }[file.type];
    const path = 'dishes/' + dishId + '/' + crypto.randomUUID() + '.' + ext;
    await request('storage/v1/object/rabel-photos/' + path, {
      method: 'POST',
      headers: { 'Content-Type': file.type, 'x-upsert': 'false' },
      body: file
    });
    try { await mutate('rabel_dishes', 'PATCH', { photo_path: path }, { id: 'eq.' + dishId }); }
    catch (e) { throw new Error('Foto caricata ma non associata al piatto: ' + e.message); }
    return path;
  }

  root.RabelClient = { login, logout, session: read, table, mutate, rpc, upload, photoUrl };
})(globalThis);
