/* Supabase owner client. Only the publishable key is bundled; RLS enforces writes. */
(function (root) {
  'use strict';
  const BASE = 'https://mpspdmjvjkqsssxgbxkm.supabase.co';
  const KEY = 'sb_publishable_DQmp56xX11ChgWZRMgA7Ng_c31EPH4w';
  const OWNER_EMAIL = 'proprietario@rabel.invalid';
  const SESSION_KEY = 'rabel_owner_session_v1';
  let session = null, refreshPending = null;
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch (_) {}
  function store(value) {
    session = value;
    if (value) localStorage.setItem(SESSION_KEY, JSON.stringify(value));
    else localStorage.removeItem(SESSION_KEY);
  }
  async function auth(body, grant) {
    const r = await fetch(BASE + '/auth/v1/token?grant_type=' + grant, {
      method:'POST', headers:{apikey:KEY,'Content-Type':'application/json'}, body:JSON.stringify(body)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(d.error_description || d.msg || d.message || 'Accesso non riuscito'); e.status = r.status; throw e; }
    return {access_token:d.access_token, refresh_token:d.refresh_token, expires_at:Math.floor(Date.now()/1000) + d.expires_in};
  }
  async function refresh() {
    if (!session || !session.refresh_token) throw new Error('Effettua l’accesso');
    if (!refreshPending) refreshPending = (async () => {
      try { store(await auth({refresh_token:session.refresh_token}, 'refresh_token')); }
      catch (e) { if (e.status === 400 || e.status === 401) store(null); throw e; }
      finally { refreshPending = null; }
    })();
    return refreshPending;
  }
  async function request(path, options = {}, retry = true) {
    if (!session) throw new Error('Effettua l’accesso');
    if (session.expires_at <= Math.floor(Date.now()/1000) + 30) await refresh();
    const headers = {apikey:KEY,Authorization:'Bearer '+session.access_token,...options.headers};
    const response = await fetch(BASE+path, {...options,headers,cache:'no-store'});
    if (response.status === 401 && retry) { await refresh(); return request(path, options, false); }
    const text = await response.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) throw new Error((data && (data.message || data.error_description || data.error)) || 'Errore di rete ('+response.status+')');
    return data;
  }
  async function login(password) {
    store(await auth({email:OWNER_EMAIL,password}, 'password'));
    try {
      const owner = await request('/rest/v1/rpc/rabel_is_owner',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
      if (owner !== true) throw new Error('Account non autorizzato come proprietario');
    } catch (e) { store(null); throw e; }
  }
  async function logout() {
    try { if (session) await request('/auth/v1/logout', {method:'POST'}); } finally { store(null); }
  }
  function table(name, query = {}) {
    return request('/rest/v1/'+name+'?'+new URLSearchParams(query));
  }
  async function mutate(name, method, data, query = {}, upsert = false) {
    const result = await request('/rest/v1/'+name+'?'+new URLSearchParams(query), {
      method, headers:{'Content-Type':'application/json',Prefer:(upsert ? 'resolution=merge-duplicates,' : '')+'return=representation'}, body:data === undefined ? undefined : JSON.stringify(data)
    });
    if (!Array.isArray(result) || result.length === 0) throw new Error('Nessuna modifica effettuata: verifica i permessi o ricarica i dati');
    return result;
  }
  function rpc(name, data) { return request('/rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); }
  function photoUrl(path) { return path ? BASE+'/storage/v1/object/public/rabel-photos/'+path.split('/').map(encodeURIComponent).join('/') : ''; }
  async function upload(file, dishId) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Usa un’immagine JPEG, PNG o WebP');
    if (file.size > 5*1024*1024) throw new Error('La foto supera 5 MB');
    const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
    const id = crypto.randomUUID();
    const path = 'dishes/'+dishId+'/'+id+'.'+ext;
    await request('/storage/v1/object/rabel-photos/'+path,{method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
    try { await mutate('rabel_dishes','PATCH',{photo_path:path},{id:'eq.'+dishId}); }
    catch (e) {
      // No referenced photo is deleted on failure. A later maintenance job can clean orphans.
      throw new Error('Foto caricata ma non associata al piatto: '+e.message);
    }
    return path;
  }
  root.RabelClient = {login,logout,table,mutate,rpc,upload,photoUrl,hasSession:()=>!!session};
})(globalThis);
