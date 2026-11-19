'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'), vm=require('node:vm');
const {asCells}=require('../supabase-live.js');
test('info clearing removes links and delivery notes allow only safe bold tags',()=>{
  const html=fs.readFileSync('index.html','utf8');
  const start=html.indexOf('function applySheetInfo('),end=html.indexOf("let lang = 'it'",start);
  const link={href:'https://old.test',removeAttribute(name){if(name==='href')delete this.href;}};
  const ctx={MENU:{info:{}}, STR:{it:{},en:{}}, PRICE_NOTE:{},REG_NOTE:{},lang:'it',setLang(){},
    escAttr:s=>String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])),
    $$:selector=>selector.includes('instagram_url')?[link]:[]};
  vm.createContext(ctx); vm.runInContext(html.slice(start,end),ctx);
  const ok=ctx.applySheetInfo(asCells([['instagram_url',''],['tagline_it',''],['delivery_note_it','<strong>Just Eat</strong><img src=x onerror=alert(1)>']]));
  assert.equal(ok,true); assert.equal(link.href,undefined); assert.equal(ctx.STR.it.tagline,'');
  assert.equal(ctx.STR.it.deliveryNote,'<strong>Just Eat</strong>&lt;img src=x onerror=alert(1)&gt;');
});
