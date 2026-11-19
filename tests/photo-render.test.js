'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {asCells, menuRows, photoUrl} = require('../supabase-live.js');

test('live photo replacement and removal never resurrect the snapshot image', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const start = html.indexOf('const BADGE_FROM_TEXT =');
  const end = html.indexOf('/* ===== Sincronizzazione live ORARI', start);
  assert.ok(start >= 0 && end > start);
  const ctx = {window: {}, MENU: {categories: [{items: [{name:{it:'BeefBurger'}, photo:'snapshot.jpg'}]}]}, CATEGORY_META: {}, activeCat:'all', renderPills(){}, renderSections(){}};
  vm.createContext(ctx);
  vm.runInContext(html.slice(start,end), ctx);
  const dish = {category:'Burgers',name:'BeefBurger',available:true,photo_path:'new/unique.jpg'};
  assert.equal(ctx.applySheetMenu(menuRows([dish])), true);
  assert.equal(ctx.MENU.categories[0].items[0].photo, photoUrl('new/unique.jpg'));
  dish.photo_path = null;
  assert.equal(ctx.applySheetMenu(menuRows([dish])), true);
  assert.equal(ctx.MENU.categories[0].items[0].photo, undefined);
  assert.equal(ctx.applySheetMenu(asCells([])), false);
  assert.equal(ctx.MENU.categories[0].items[0].photo, undefined);
});
