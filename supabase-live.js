/* La chiave publishable identifica il progetto: i permessi sono applicati da RLS. */
(function (root) {
  'use strict';
  const base = 'https://mpspdmjvjkqsssxgbxkm.supabase.co';
  const key = 'sb_publishable_DQmp56xX11ChgWZRMgA7Ng_c31EPH4w';
  const badgeLabels = {pop:'Il più ordinato', combo:'Combo', spicy:'Piccante', raw:'Crudo', veg:'Vegetariano', banco:'Solo al banco'};
  const asCells = rows => ({table: {rows: rows.map(row => ({c: row.map(v => ({v}))}))}});
  function photoUrl(path) {
    if (!path || typeof path !== 'string' || path.startsWith('/') || path.split('/').some(p => !p || p === '.' || p === '..')) return '';
    return base + '/storage/v1/object/public/rabel-photos/' + path.split('/').map(encodeURIComponent).join('/');
  }
  function menuRows(dishes) {
    return asCells(dishes.map(d => [d.category, d.name, d.name_en, d.description, d.description_en, d.price,
      (d.allergens || []).join(', '), (d.badges || []).map(b => badgeLabels[b] || '').filter(Boolean).join(', '),
      d.available ? 'Sì' : 'No', photoUrl(d.photo_path)]));
  }
  async function readTable(name, order) {
    const url = new URL(base + '/rest/v1/' + name);
    url.searchParams.set('select', '*');
    if (order) url.searchParams.set('order', order);
    const response = await root.fetch(url, {headers: {apikey: key}, cache: 'no-store'});
    if (!response.ok) throw new Error('Supabase: HTTP ' + response.status);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Risposta Supabase non valida');
    return data;
  }
  async function refresh() {
    const results = await Promise.allSettled([
      readTable('rabel_dishes', 'position.asc,id.asc'),
      readTable('rabel_hours', 'position.asc,id.asc'),
      readTable('rabel_info'),
      readTable('rabel_categories', 'position.asc,id.asc')
    ]);
    const [menu, hours, info, categories] = results;
    // Tabelle ancora vuote: manteniamo lo snapshot, non mostriamo un menu vuoto.
    const liveCategories = categories.status === 'fulfilled' ? categories.value : null;
    if (menu.status === 'fulfilled' && (menu.value.length || Array.isArray(liveCategories))) {
      // Una categoria nascosta sparisce dal sito insieme a tutti i suoi piatti.
      const hidden = new Set((liveCategories || [])
        .filter(c => c && c.hidden === true && typeof c.name === 'string')
        .map(c => c.name.trim()));
      const published = hidden.size
        ? menu.value.filter(d => !hidden.has(String(d.category == null ? '' : d.category).trim()))
        : menu.value;
      applySheetMenu(menuRows(published), liveCategories);
    }
    if (hours.status === 'fulfilled' && hours.value.length) applySheetHours(asCells(hours.value.map(h => [h.days, h.hours])));
    if (info.status === 'fulfilled' && info.value.length) applySheetInfo(asCells(info.value.map(i => [i.key, i.value])));
    results.forEach(r => { if (r.status === 'rejected') console.warn('Aggiornamento menù non riuscito:', r.reason); });
  }
  let running = false;
  async function refreshOnce() {
    if (running) return;
    running = true;
    try { await refresh(); } finally { running = false; }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = {asCells, menuRows, photoUrl, refresh};
  if (root.document) {
    refreshOnce();
    root.setInterval(() => { if (!root.document.hidden) refreshOnce(); }, 30000);
    root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) refreshOnce(); });
  }
})(typeof window !== 'undefined' ? window : globalThis);
