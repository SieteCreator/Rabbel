'use strict';
/* Il menù pubblico è un file unico: qui si verifica la logica di esclusione
   degli allergeni e il contratto della tendina, senza bisogno di un DOM. */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function grabFunction(name) {
  const match = html.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
  assert.ok(match, 'funzione ' + name + ' non trovata in index.html');
  return match[0];
}

const allergenBlocked = eval('(' + grabFunction('allergenBlocked') + ')');

test('senza filtri nessun piatto viene escluso', () => {
  const none = new Set();
  assert.equal(allergenBlocked({ allergens: ['GL', 'LA'] }, none), false);
  assert.equal(allergenBlocked({ allergens: [] }, none), false);
});

test('un piatto sparisce solo se contiene un allergene escluso', () => {
  const excluded = new Set(['GL']);
  assert.equal(allergenBlocked({ allergens: ['GL', 'SE'] }, excluded), true);
  assert.equal(allergenBlocked({ allergens: ['LA', 'SE'] }, excluded), false);
});

test('più allergeni si sommano', () => {
  const excluded = new Set(['GL', 'LA']);
  assert.equal(allergenBlocked({ allergens: ['LA'] }, excluded), true);
  assert.equal(allergenBlocked({ allergens: ['GL'] }, excluded), true);
  assert.equal(allergenBlocked({ allergens: ['SE', 'UO'] }, excluded), false);
});

test('i piatti senza allergeni dichiarati restano sempre visibili', () => {
  const excluded = new Set(['GL', 'LA', 'SE']);
  assert.equal(allergenBlocked({ allergens: [] }, excluded), false);
  assert.equal(allergenBlocked({}, excluded), false);
  assert.equal(allergenBlocked(null, excluded), false);
});

test('il filtro ha sostituito i vecchi codici con la tendina', () => {
  assert.equal(html.includes('allergenChips'), false, 'la vecchia riga di codici non deve restare');
  assert.match(html, /id="allergenBtn"/);
  assert.match(html, /id="allergenPanel"/);
  assert.match(html, /function toggleAllergenPanel\(/);
  assert.match(html, /MENU\.allergenLegend\.map/, 'la tendina elenca TUTTI gli allergeni della legenda');
  assert.match(html, /class="acode"/, 'ogni voce mostra la sigla');
  assert.match(html, /exclude:"Escludi allergeni", allergenFilter:"Allergeni"/);
});
