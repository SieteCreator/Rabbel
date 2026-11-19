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

test('live categories determine English name and display order, including an empty menu', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const ctx = {window: {}, MENU: {categories: []}, CATEGORY_META: {}, activeCat:'all', renderPills(){}, renderSections(){}};
  vm.createContext(ctx);
  vm.runInContext(html.slice(html.indexOf('const BADGE_FROM_TEXT ='), html.indexOf('/* ===== Sincronizzazione live ORARI')), ctx);
  const dishes = [{category:'Prima',name:'A',available:true},{category:'Seconda',name:'B',available:true}];
  const categories = [{id:2,name:'Seconda',name_en:'Second'}, {id:1,name:'Prima',name_en:'First'}];
  assert.equal(ctx.applySheetMenu(menuRows(dishes), categories), true);
  assert.deepEqual(Array.from(ctx.MENU.categories, c => [c.it,c.en,c.id]), [['Seconda','Second','custom-2'],['Prima','First','custom-1']]);
  assert.equal(ctx.applySheetMenu(asCells([]), categories), true);
  assert.equal(ctx.MENU.categories.length, 0);
});
