'use strict';
const api = RabelClient, domain = RabelDomain;
const $ = (s, root=document) => root.querySelector(s);
const $$ = (s, root=document) => [...root.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ALLERGENS = ['GL','LA','UO','PE','SO','SE','SO2','FG'];
const BADGES = [{id:'pop',label:'★ Più ordinato'},{id:'combo',label:'Combo'},{id:'spicy',label:'🌶 Piccante'},{id:'raw',label:'Crudo'},{id:'veg',label:'Vegetariano'},{id:'banco',label:'Solo al banco'}];
const FIELDS = [['i-phone','phone'],['i-phonehref','phone_href'],['i-address','address'],['i-cap','cap'],['i-city','city'],['i-district','district'],['i-maps','maps_url'],['i-review','review_url'],['i-justeat','justeat_url'],['i-glovo','glovo_url'],['i-deliveroo','deliveroo_url'],['i-ig','instagram_url'],['i-ighandle','instagram_handle'],['i-fb','facebook_url'],['i-rating','rating'],['i-reviews','reviews'],['i-taglineit','tagline_it'],['i-taglineen','tagline_en'],['i-priceit','price_note_it'],['i-priceen','price_note_en'],['i-regit','reg_note_it'],['i-regen','reg_note_en'],['i-delit','delivery_note_it'],['i-delen','delivery_note_en']];
let state = {dishes:[],categories:[],hours:[],info:{}};
let photoTarget = null;
function banner(text) { const el=$('#banner'); el.textContent=text||''; el.style.display=text?'block':'none'; }
function toast(text) { const el=$('#toast'); el.textContent=text; el.style.display='block'; setTimeout(()=>el.style.display='none',3000); }
async function busy(fn) { $$('.btn').forEach(x=>x.disabled=true); banner(''); try { await fn(); } catch(e) { const m=(e && e.message) || 'Errore di connessione'; if (/Accedi|Sessione scaduta|permessi/.test(m)) showLogin(m); else { banner(m); if (!$('#view-login').hidden) $('#login-status').textContent = m; } } finally { $$('.btn').forEach(x=>x.disabled=false); } }
async function load() {
  const [dishes,categories,hours,info] = await Promise.all([
    api.table('rabel_dishes',{select:'*',order:'position.asc,id.asc'}),
    api.table('rabel_categories',{select:'*',order:'position.asc,id.asc'}),
    api.table('rabel_hours',{select:'*',order:'position.asc,id.asc'}),
    api.table('rabel_info',{select:'*'})
  ]);
  let parsedHours;
  try { parsedHours = domain.expandHours(hours); }
  catch (e) { if (hours.length) throw e; parsedHours = domain.DAYS.map(days => ({days, slots:[]})); }
  state={dishes,categories,hours:parsedHours,info:Object.fromEntries(info.map(x=>[x.key,x.value]))};
  renderAll();
}
function chipHTML(list,selected=[]) { return list.map(item=>{const id=typeof item==='string'?item:item.id, label=typeof item==='string'?item:item.label; return `<button type="button" class="chip${selected.includes(id)?' on':''}" data-val="${esc(id)}">${esc(label)}</button>`;}).join(''); }
function options(selected) { return state.categories.map(c=>`<option value="${esc(c.name)}"${c.name===selected?' selected':''}>${esc(c.name)}</option>`).join(''); }
function formatPrice(p) { return p == null ? 'AL BANCO' : Number(p).toFixed(2).replace('.',',')+'€'; }
function price(v) { v=v.trim().replace(',','.'); if (!v) return null; if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error('Prezzo non valido'); const n=Number(v); if (n>99999999.99) throw new Error('Prezzo troppo alto'); return n; }
function renderAll() { renderControls(); renderDishes(); renderPhotos(); renderHours(); renderInfo(); renderCategories(); }
function renderControls() { const selected=$('#dish-cat').value; $('#dish-cat').innerHTML='<option value="">Tutte le categorie</option>'+options(selected); $('#n-cat').innerHTML=options(); }
function dishHTML(d, hiddenCat) { return `<div class="dish" data-id="${d.id}"><div class="dish-head"><div class="nm">${esc(d.name)}${hiddenCat?'<span class="cat-hidden-note">CATEGORIA NASCOSTA</span>':''}</div>${d.available?'':'<span class="unavail">ESAURITO</span>'}<span class="pr">${esc(formatPrice(d.price))}</span><div class="switch"><input type="checkbox" class="sw-avail" ${d.available?'checked':''} aria-label="Disponibile"><span class="track"></span><span class="thumb"></span></div></div><div class="dish-body">
<label>Nome (IT) *</label><input class="f-name" type="text" value="${esc(d.name)}"><label>Nome (EN)</label><input class="f-nameen" type="text" value="${esc(d.name_en)}"><label>Prezzo € (vuoto = al banco)</label><input class="f-price" type="text" inputmode="decimal" value="${esc(d.price ?? '')}"><label>Categoria</label><select class="f-cat">${options(d.category)}</select><label>Descrizione (IT)</label><textarea class="f-desc">${esc(d.description)}</textarea><label>Descrizione (EN)</label><textarea class="f-descen">${esc(d.description_en)}</textarea><label>Allergeni</label><div class="chips f-allergens">${chipHTML(ALLERGENS,d.allergens)}</div><label>Badge</label><div class="chips f-badges">${chipHTML(BADGES,d.badges)}</div><div class="actions"><button class="btn small f-save">💾 Salva</button><button class="btn small red f-delete">🗑 Elimina</button></div></div></div>`; }
function hiddenCategories() { return new Set(state.categories.filter(c => c.hidden).map(c => c.name)); }
function groupTitle(c, count, label) { return `<div class="group-title">${esc(c.name)} <span class="muted">(${count})</span>${c.hidden?`<span class="cat-hidden-note inline">${label||'NASCOSTA'}</span>`:''}</div>`; }
function renderDishes() {
  const q=$('#dish-search').value.trim().toLowerCase(), cat=$('#dish-cat').value, hidden=hiddenCategories();
  let html=''; for (const c of state.categories) { const dishes=state.dishes.filter(d=>d.category===c.name && (!cat||c.name===cat) && (!q||[d.name,d.name_en,d.description,d.description_en].join(' ').toLowerCase().includes(q))); if (!dishes.length) continue; html+=groupTitle(c,dishes.length)+dishes.map(d=>dishHTML(d,hidden.has(d.category))).join(''); }
  $('#dish-list').innerHTML=html||'<div class="card">Nessun piatto trovato.</div>';
}
function dishValues(root) { const name=$('.f-name',root).value.trim(); if(!name) throw new Error('Nome obbligatorio'); return {name,name_en:$('.f-nameen',root).value.trim(),category:$('.f-cat',root).value,price:price($('.f-price',root).value),description:$('.f-desc',root).value.trim(),description_en:$('.f-descen',root).value.trim(),allergens:$$('.f-allergens .on',root).map(x=>x.dataset.val),badges:$$('.f-badges .on',root).map(x=>x.dataset.val)}; }
function renderPhotos() {
  let html=''; for (const c of state.categories) { const ds=state.dishes.filter(d=>d.category===c.name); if(!ds.length) continue; html+=groupTitle(c,ds.length)+ds.map(d=>`<div class="foto-item" data-id="${d.id}"><div class="foto-thumb">${d.photo_path?`<img src="${esc(api.photoUrl(d.photo_path))}" alt="${esc(d.name)}">`:'🍽️'}</div><div class="foto-meta"><div class="nm">${esc(d.name)}</div><div class="pr">${esc(formatPrice(d.price))}</div><div class="foto-actions"><button class="btn small photo-camera">📷 Scatta</button><button class="btn small ghost photo-pick">🖼 Scegli</button>${d.photo_path?'<button class="btn small red photo-remove">Rimuovi</button>':''}</div></div></div>`).join(''); }
  $('#foto-list').innerHTML=html||'<div class="card">Nessun piatto.</div>';
}
function catCardHTML(c, i) {
  const n = state.dishes.filter(d => d.category === c.name).length;
  const targets = state.categories.filter(x => x.id !== c.id).map(x => {
    const k = state.dishes.filter(d => d.category === x.name).length;
    return `<label class="radio-row"><input type="radio" class="cat-target" name="tgt-${c.id}" value="move:${x.id}"><span>Sposta in «${esc(x.name)}»<small>${k} ${k===1?'piatto':'piatti'}</small></span></label>`;
  }).join('');
  const panel = n === 0 ? '' : `<div class="cat-del-panel" hidden>
      <p class="muted" style="font-weight:800">Cosa fare ${n===1?'del piatto':'dei '+n+' piatti'} di «${esc(c.name)}»?</p>
      <div class="radio-list">${targets}<label class="radio-row danger"><input type="radio" class="cat-target" name="tgt-${c.id}" value="delete"><span>Elimina anche ${n===1?'il piatto':n+' piatti'}<small>Definitivo, non si può annullare</small></span></label></div>
      <div class="actions"><button class="btn small red cat-del-confirm" disabled>Conferma</button><button class="btn small ghost cat-del-cancel">Annulla</button></div>
    </div>`;
  return `<div class="dish cat" data-id="${c.id}">
    <div class="dish-head cat-head">
      <div class="nm">${esc(c.name)}${c.hidden?'<span class="cat-hidden-note">NASCOSTA SUL SITO</span>':''}</div>
      <span class="cnt">${n}</span>
      <div class="switch"><input type="checkbox" class="sw-visible" ${c.hidden?'':'checked'} aria-label="Visibile sul sito"><span class="track"></span><span class="thumb"></span></div>
      <span class="chev">▾</span>
    </div>
    <div class="dish-body">
      ${c.hidden?'<p class="warn">Nascosta: sul sito non compaiono né questa categoria né i suoi piatti.</p>':''}
      <label>Nome (IT)</label><input class="cat-it" type="text" value="${esc(c.name)}">
      <label>Nome (EN)</label><input class="cat-en" type="text" value="${esc(c.name_en)}">
      <div class="actions"><button class="btn small cat-save">💾 Salva</button><button class="btn small ghost cat-up" ${i===0?'disabled':''}>↑</button><button class="btn small ghost cat-down" ${i===state.categories.length-1?'disabled':''}>↓</button><button class="btn small red cat-delete">🗑 Elimina</button></div>
      ${panel}
    </div>
  </div>`;
}
function renderCategories() { $('#categories-list').innerHTML = state.categories.map(catCardHTML).join('') || '<div class="card">Nessuna categoria.</div>'; }
function renderHours() {
  $('#hours-rows').innerHTML=state.hours.map((day,i)=>`<div class="card day" data-index="${i}"><h2>${esc(day.days)}</h2><label><input type="checkbox" class="day-closed" ${!day.slots.length?'checked':''}> Chiuso</label><div class="day-slots">${day.slots.map(slotHTML).join('')}</div><button class="btn small ghost slot-add">+ Fascia</button></div>`).join('');
}
function slotHTML(slot=['','']) { return `<div class="hour-row"><input type="time" class="start" value="${esc(slot[0])}" aria-label="Dalle"><span>–</span><input type="time" class="end" value="${esc(slot[1])}" aria-label="Alle"><button class="btn small ghost slot-remove" aria-label="Elimina fascia">✕</button></div>`; }
function renderInfo() { for(const [id,key] of FIELDS) $('#'+id).value=state.info[key] || ''; }
$('#btn-reload').addEventListener('click',()=>busy(load));
$('#dish-search').addEventListener('input',renderDishes); $('#dish-cat').addEventListener('change',renderDishes);
$('#btn-add-toggle').onclick=()=>$('#add-dish-card').hidden=!$('#add-dish-card').hidden;
$('#btn-add-cancel').onclick=()=>$('#add-dish-card').hidden=true;
$('#n-allergens').innerHTML=chipHTML(ALLERGENS); $('#n-badges').innerHTML=chipHTML(BADGES);
$('#btn-add-save').onclick=()=>busy(async()=>{const name=$('#n-name').value.trim(); if(!name||!$('#n-cat').value) throw new Error('Nome e categoria obbligatori'); const d={name,name_en:$('#n-nameen').value.trim(),category:$('#n-cat').value,price:price($('#n-price').value),description:$('#n-desc').value.trim(),description_en:$('#n-descen').value.trim(),available:$('#n-avail').checked,allergens:$$('#n-allergens .on').map(x=>x.dataset.val),badges:$$('#n-badges .on').map(x=>x.dataset.val),position:Math.max(-1,...state.dishes.map(x=>x.position))+1}; await api.mutate('rabel_dishes','POST',d); for(const id of ['n-name','n-nameen','n-price','n-desc','n-descen']) $('#'+id).value=''; $('#n-allergens').innerHTML=chipHTML(ALLERGENS); $('#n-badges').innerHTML=chipHTML(BADGES); $('#n-avail').checked=true; $('#add-dish-card').hidden=true; await load(); toast('Piatto salvato');});
$('#cat-add').onclick=()=>busy(async()=>{const name=$('#cat-new-it').value.trim(),name_en=$('#cat-new-en').value.trim(); if(!name||!name_en) throw new Error('Inserisci entrambi i nomi'); await api.mutate('rabel_categories','POST',{name,name_en,position:Math.max(-1,...state.categories.map(c=>c.position))+1}); $('#cat-new-it').value=''; $('#cat-new-en').value=''; await load(); toast('Categoria aggiunta');});
$('#btn-save-hours').onclick=()=>busy(async()=>{const days=$$('.day').map((el,i)=>({days:domain.DAYS[i],slots:$('.day-closed',el).checked?[]:$$('.hour-row',el).map(r=>[$('.start',r).value,$('.end',r).value])})); if(days.some((d,i)=>!$('.day-closed',$$('.day')[i]).checked&&!d.slots.length)) throw new Error('Aggiungi una fascia oppure seleziona Chiuso'); await api.rpc('rabel_replace_hours',{rows:domain.serializeHours(days)}); await load(); toast('Orari salvati');});
$('#btn-save-info').onclick=()=>busy(async()=>{const data=FIELDS.map(([id,key])=>({key,value:$('#'+id).value.trim()})); for(const x of data.filter(x=>x.key.endsWith('_url')&&x.value)) { let u; try {u=new URL(x.value);} catch(_) {throw new Error('Link non valido: '+x.key);} if(!['http:','https:'].includes(u.protocol)) throw new Error('Link non valido: '+x.key); } await api.mutate('rabel_info','POST',data,{on_conflict:'key'},true); await load(); toast('Info salvate');});
$$('.tab').forEach(tab=>tab.onclick=()=>{$$('.tab').forEach(t=>t.classList.toggle('active',t===tab)); for(const name of ['piatti','categorie','foto','orari','info','aiuto']) $('#tab-'+name).hidden=(name!==tab.dataset.tab);});
document.addEventListener('click', e=>{const chip=e.target.closest('.chip'); if(chip){chip.classList.toggle('on');return;} const head=e.target.closest('.dish-head'); if(head&&!e.target.closest('.switch')){head.closest('.dish').classList.toggle('open');return;}
 const card=e.target.closest('.dish'); if(card && e.target.closest('.f-save')) return void busy(async()=>{await api.mutate('rabel_dishes','PATCH',dishValues(card),{id:'eq.'+card.dataset.id}); await load(); toast('Salvato');});
 if(card && e.target.closest('.f-delete')) return void busy(async()=>{const d=state.dishes.find(x=>x.id===Number(card.dataset.id)); if(!confirm('Eliminare «'+d.name+'»?')) return; await api.mutate('rabel_dishes','DELETE',undefined,{id:'eq.'+d.id}); await load(); toast('Piatto eliminato');});
 const day=e.target.closest('.day'); if(day && e.target.closest('.slot-add')) { $('.day-closed',day).checked=false; $('.day-slots',day).insertAdjacentHTML('beforeend',slotHTML()); return; } if(day && e.target.closest('.slot-remove')) {e.target.closest('.hour-row').remove();return;}
 const photo=e.target.closest('.foto-item'); if(photo && e.target.closest('.photo-camera,.photo-pick')) {photoTarget=Number(photo.dataset.id); const input=$('#foto-input'); if(e.target.closest('.photo-camera')) input.setAttribute('capture','environment'); else input.removeAttribute('capture'); input.value=''; input.click(); return;}
 if(photo && e.target.closest('.photo-remove')) return void busy(async()=>{if(!confirm('Rimuovere la foto?')) return; await api.mutate('rabel_dishes','PATCH',{photo_path:null},{id:'eq.'+photo.dataset.id}); await load(); toast('Foto rimossa');});
 const catCard=e.target.closest('.cat'); if(!catCard) return;
 const catId=Number(catCard.dataset.id), current=state.categories.find(x=>x.id===catId);
 if(e.target.closest('.cat-save')) return void busy(async()=>{const name=$('.cat-it',catCard).value.trim(),name_en=$('.cat-en',catCard).value.trim(); if(!name||!name_en) throw new Error('Inserisci entrambi i nomi'); await api.mutate('rabel_categories','PATCH',{name,name_en},{id:'eq.'+catId}); await load(); toast('Categoria salvata');});
 if(e.target.closest('.cat-del-cancel')) { $('.cat-del-panel',catCard).hidden=true; return; }
 if(e.target.closest('.cat-delete')) {
   const n=state.dishes.filter(d=>d.category===current.name).length, panel=$('.cat-del-panel',catCard);
   if(!n) return void busy(async()=>{ if(!confirm('Eliminare la categoria «'+current.name+'»?\nÈ vuota: nessun piatto verrà toccato.')) return; await api.rpc('rabel_delete_category',{source_id:catId,delete_dishes:true,target_id:null}); await load(); toast('Categoria eliminata'); });
   panel.hidden=!panel.hidden; if(!panel.hidden){ $$('.cat-target',panel).forEach(r=>r.checked=false); $$('.radio-row',panel).forEach(r=>r.classList.remove('sel')); const b=$('.cat-del-confirm',panel); if(b){b.disabled=true;b.textContent='Conferma';} }
   return;
 }
 if(e.target.closest('.cat-del-confirm')) {
   const chosen=$('.cat-target:checked',catCard); if(!chosen) throw new Error('Scegli dove spostare i piatti o se eliminarli');
   const n=state.dishes.filter(d=>d.category===current.name).length, [kind,target]=chosen.value.split(':');
   if(kind==='delete') {
     if(!confirm('Eliminare la categoria «'+current.name+'» e TUTTI i suoi '+n+' piatti?\n\nL’operazione non si può annullare.')) return;
   } else {
     const t=state.categories.find(x=>x.id===Number(target));
     if(!t) throw new Error('Categoria di destinazione non trovata');
     if(!confirm('Spostare i '+n+' piatti in «'+t.name+'» ed eliminare la categoria «'+current.name+'»?')) return;
   }
   return void busy(async()=>{
     await api.rpc('rabel_delete_category',{source_id:catId,delete_dishes:kind==='delete',target_id:kind==='delete'?null:Number(target)});
     await load(); toast(kind==='delete'?'Categoria e piatti eliminati':'Categoria eliminata, piatti spostati');
   });
 }
 const up=e.target.closest('.cat-up'),down=e.target.closest('.cat-down'); if(up||down) return void busy(async()=>{const ids=state.categories.map(x=>x.id),i=ids.indexOf(catId),j=i+(up?-1:1); if(j<0||j>=ids.length)return; [ids[i],ids[j]]=[ids[j],ids[i]]; await api.rpc('rabel_reorder_categories',{ids}); await load(); toast('Ordine salvato');});
});
document.addEventListener('change',e=>{
  if(e.target.matches('.sw-avail')) {const card=e.target.closest('.dish'),value=e.target.checked; busy(async()=>{try {await api.mutate('rabel_dishes','PATCH',{available:value},{id:'eq.'+card.dataset.id}); await load(); toast('Disponibilità aggiornata');} catch(err) {e.target.checked=!value;throw err;}}); return;}
  if(e.target.matches('.sw-visible')) {const card=e.target.closest('.cat'),visible=e.target.checked; busy(async()=>{try {await api.mutate('rabel_categories','PATCH',{hidden:!visible},{id:'eq.'+card.dataset.id}); await load(); toast(visible?'Categoria visibile sul sito':'Categoria nascosta dal sito');} catch(err) {e.target.checked=!visible;throw err;}}); return;}
  if(e.target.matches('.cat-target')) {const panel=e.target.closest('.cat-del-panel'); $$('.radio-row',panel).forEach(r=>r.classList.remove('sel')); e.target.closest('.radio-row').classList.add('sel'); const b=$('.cat-del-confirm',panel); if(b){b.disabled=false; b.textContent=e.target.value==='delete'?'Elimina tutto':'Sposta ed elimina';} return;}
});
async function preparePhoto(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Usa un’immagine JPEG, PNG o WebP');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Impossibile preparare la foto');
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) throw new Error('Impossibile preparare la foto');
    return new File([blob], 'foto.jpg', {type:'image/jpeg'});
  } finally { bitmap.close(); }
}
$('#foto-input').addEventListener('change',()=>{const file=$('#foto-input').files[0]; if(file&&photoTarget) busy(async()=>{await api.upload(await preparePhoto(file),photoTarget); await load(); toast('Foto salvata');});});
function showLogin(message) {
  $('#view-app').hidden = true;
  $('#view-login').hidden = false;
  $('#btn-logout').hidden = true;
  $('#login-status').textContent = message || '';
  $('#connDot').textContent = '● non connesso';
  $('#connDot').classList.add('off');
}
async function enterApp() {
  $('#view-login').hidden = true;
  $('#view-app').hidden = false;
  $('#btn-logout').hidden = false;
  await load();
  $('#connDot').textContent = '● connesso';
  $('#connDot').classList.remove('off');
}
$('#btn-login').onclick = () => busy(async () => {
  await api.login($('#l-email').value.trim(), $('#l-password').value);
  $('#l-password').value = '';
  await enterApp();
});
$('#l-email').addEventListener('keydown', e => { if (e.key === 'Enter') $('#l-password').focus(); });
$('#l-password').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-login').click(); });
$('#btn-logout').onclick = () => {
  if (!confirm('Uscire dall’account?')) return;
  api.logout(); showLogin(); banner('');
};
if (location.hostname === 'appassets.androidplatform.net') $('#site-link').hidden = true;
if (api.session()) enterApp().catch(e => { if (/Accedi|Sessione scaduta|permessi/.test(e.message || '')) showLogin(e.message); else banner(e.message); });
else showLogin();
