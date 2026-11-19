/* Accesso automatico tramite la chiave tecnica inclusa nella build privata.
   Chi possiede una copia dell'APK può estrarre questa chiave e modificarne i dati. */
(function (root) {
  'use strict';
  const BASE = 'https://mpspdmjvjkqsssxgbxkm.supabase.co';
  const ENDPOINT = BASE + '/functions/v1/rabel-app/';
  async function request(path, options = {}) {
    const token = root.RABEL_APP_KEY;
    if (!token || !/^[0-9a-f]{64}$/.test(token)) throw new Error('Questa build non contiene la chiave tecnica. Occorre creare un APK privato.');
    const response = await fetch(ENDPOINT+path, {...options,headers:{...options.headers,'x-rabel-app-key':token},cache:'no-store'});
    const text = await response.text();
    let data = null; try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
    if (!response.ok) throw new Error((data && (data.message || data.error)) || 'Errore di rete ('+response.status+')');
    return data;
  }
  function table(name, query = {}) { return request('rest/v1/'+name+'?'+new URLSearchParams(query)); }
  async function mutate(name, method, data, query = {}, upsert = false) {
    const result = await request('rest/v1/'+name+'?'+new URLSearchParams(query), {
      method, headers:{'Content-Type':'application/json',Prefer:(upsert ? 'resolution=merge-duplicates,' : '')+'return=representation'}, body:data === undefined ? undefined : JSON.stringify(data)
    });
    if (!Array.isArray(result) || result.length === 0) throw new Error('Nessuna modifica effettuata: ricarica i dati');
    return result;
  }
  function rpc(name, data) { return request('rest/v1/rpc/'+name,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}); }
  function photoUrl(path) { return path ? BASE+'/storage/v1/object/public/rabel-photos/'+path.split('/').map(encodeURIComponent).join('/') : ''; }
  async function upload(file, dishId) {
    if (!file || !['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Usa un’immagine JPEG, PNG o WebP');
    if (file.size > 5*1024*1024) throw new Error('La foto supera 5 MB');
    const ext = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[file.type];
    const path = 'dishes/'+dishId+'/'+crypto.randomUUID()+'.'+ext;
    await request('storage/v1/object/rabel-photos/'+path,{method:'POST',headers:{'Content-Type':file.type,'x-upsert':'false'},body:file});
    try { await mutate('rabel_dishes','PATCH',{photo_path:path},{id:'eq.'+dishId}); }
    catch (e) { throw new Error('Foto caricata ma non associata al piatto: '+e.message); }
    return path;
  }
  root.RabelClient = {table,mutate,rpc,upload,photoUrl};
})(globalThis);
