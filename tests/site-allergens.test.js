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

test('il pannello segue la struttura richiesta: titolo, Azzera, chip compatte', () => {
  assert.equal(html.includes('allergenChips'), false, 'la vecchia riga di codici non deve restare');
  assert.match(html, /id="allergenBtn"/);
  assert.match(html, /id="allergenPanel"/);
  assert.match(html, /function toggleAllergenPanel\(/);
  assert.match(html, /class="allergen-title"/, 'titolo del pannello');
  assert.match(html, /class="allergen-reset"/, 'link Azzera');
  assert.match(html, /class="allergen-sub"/, 'sottotitolo con il Regolamento UE');
  assert.match(html, /Regolamento UE 1169\/2011/, 'riferimento normativo');
  assert.match(html, /class="allergen-grid"/, 'chip disposte a griglia');
  assert.match(html, /class="allergen-chip"/, 'singola chip');
  assert.match(html, /MENU\.allergenLegend\.map/, 'la tendina elenca TUTTI gli allergeni della legenda');
  assert.equal(/class="allergen-option"/.test(html), false, 'il vecchio elenco a righe non deve restare');
});

test('ogni allergene della legenda ha un nome breve in italiano e inglese', () => {
  const legend = JSON.parse(html.match(/"allergenLegend":(\[.*?\])/)[1]);
  const line = html.match(/const ALLERGEN_SHORT = \{.*?\};/)[0];
  const short = eval('(' + line.replace(/^const ALLERGEN_SHORT = /, '').replace(/;$/, '') + ')');
  assert.equal(legend.length, 8, 'la legenda contiene gli 8 allergeni usati dai piatti');
  for (const allergen of legend) {
    const label = short[allergen.code];
    assert.ok(label, 'manca il nome breve per ' + allergen.code);
    assert.ok(label.it && label.en, 'nome breve incompleto per ' + allergen.code);
    assert.ok(label.it.length <= allergen.it.length, 'il nome breve di ' + allergen.code + ' non può essere più lungo della descrizione');
  }
});
