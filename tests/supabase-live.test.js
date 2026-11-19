'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {asCells, menuRows, photoUrl, refresh} = require('../supabase-live.js');

test('photo paths remain within the public image bucket', () => {
  assert.match(photoUrl('piatti/panino 1.jpg'), /piatti\/panino%201.jpg$/);
  for (const path of ['/a.jpg', '../secret', 'a/../b', 'https://example.com/a']) assert.equal(photoUrl(path), '');
});
test('menu conversion retains fields, order, badges and availability', () => {
  const result = menuRows([{category:'Panini', name:'Test', name_en:'Test EN', description:'IT', description_en:'EN', price:8.5, allergens:['GL','LA'], badges:['pop','veg'], available:false, photo_path:'test.jpg'}]);
  assert.deepEqual(result.table.rows[0].c.map(x => x.v), ['Panini','Test','Test EN','IT','EN',8.5,'GL, LA','Il più ordinato, Vegetariano','No',photoUrl('test.jpg')]);
  assert.deepEqual(asCells([['Lunedì','Chiuso']]).table.rows[0].c.map(x=>x.v), ['Lunedì','Chiuso']);
});
test('refresh applies nonempty tables and uses public API key', async () => {
  const called = [];
  global.applySheetMenu = x => called.push(['menu',x]);
  global.applySheetHours = x => called.push(['hours',x]);
  global.applySheetInfo = x => called.push(['info',x]);
  global.fetch = async (url, options) => {
    assert.match(options.headers.apikey, /^sb_publishable_/);
    assert.equal(options.cache, 'no-store');
    const data = url.pathname.endsWith('rabel_dishes') ? [{category:'Panini', name:'Test', available:true}] : url.pathname.endsWith('rabel_hours') ? [{days:'Lunedì',hours:'Chiuso'}] : [{key:'phone',value:'123'}];
    return {ok:true,json:async()=>data};
  };
  await refresh();
  assert.deepEqual(called.map(x=>x[0]), ['menu','hours','info']);
  assert.equal(called[0][1].table.rows[0].c[1].v, 'Test');
});
test('empty or failed tables do not replace the existing snapshot', async () => {
  const called=[]; global.applySheetMenu=()=>called.push('menu'); global.applySheetHours=()=>called.push('hours'); global.applySheetInfo=()=>called.push('info');
  global.fetch=async url => (url.pathname.endsWith('rabel_hours') || url.pathname.endsWith('rabel_categories')) ? {ok:false,status:503} : {ok:true,json:async()=>[]};
  const warn=console.warn; console.warn=()=>{};
  try { await refresh(); } finally {console.warn=warn;}
  assert.deepEqual(called,[]);
});

test('a hidden category disappears from the menu together with its dishes', async () => {
  const calls = [];
  global.applySheetMenu = (resp, cats) => calls.push({ names: resp.table.rows.map(r => r.c[1].v), cats: (cats || []).map(c => c.name) });
  global.applySheetHours = () => {}; global.applySheetInfo = () => {};
  const dishes = [
    {category:'Panini', name:'Visibile', available:true},
    {category:'Dolci', name:'Cannolo', available:true},
    {category:'Dolci', name:'Tiramisù', available:true}
  ];
  const categories = [{id:5,name:'Panini',hidden:false},{id:3,name:'Dolci',hidden:true}];
  global.fetch = async url => url.pathname.endsWith('rabel_dishes')
    ? {ok:true,json:async()=>dishes}
    : url.pathname.endsWith('rabel_categories')
      ? {ok:true,json:async()=>categories}
      : {ok:true,json:async()=>[]};
  await refresh();
  assert.deepEqual(calls[0].names, ['Visibile'], 'i piatti della categoria nascosta non vengono pubblicati');
  assert.deepEqual(calls[0].cats, ['Panini','Dolci'], 'in gestione la categoria resta disponibile');
});

test('visible categories are published unchanged', async () => {
  const calls = [];
  global.applySheetMenu = (resp) => calls.push(resp.table.rows.map(r => r.c[1].v));
  global.applySheetHours = () => {}; global.applySheetInfo = () => {};
  global.fetch = async url => url.pathname.endsWith('rabel_dishes')
    ? {ok:true,json:async()=>[{category:'Panini', name:'A'},{category:'Dolci', name:'B'}]}
    : url.pathname.endsWith('rabel_categories')
      ? {ok:true,json:async()=>[{id:1,name:'Panini',hidden:false},{id:2,name:'Dolci',hidden:false}]}
      : {ok:true,json:async()=>[]};
  await refresh();
  assert.deepEqual(calls[0], ['A','B']);
});
