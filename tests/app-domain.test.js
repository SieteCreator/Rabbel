'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {parseSlots, expandHours, serializeHours} = require('../app/domain.js');
const source = [
  {days:'Lunedì',hours:'Chiuso'}, {days:'Martedì',hours:'Chiuso'},
  {days:'Mercoledì – Venerdì',hours:'12:00 – 15:30 · 18:30 – 20:30'},
  {days:'Sabato – Domenica',hours:'12:00 – 20:30'}
];
test('expand the existing opening hours and serialize seven complete days', () => {
  const days = expandHours(source);
  assert.equal(days.length, 7);
  assert.deepEqual(days[0].slots, []);
  assert.deepEqual(days[2].slots, [['12:00','15:30'],['18:30','20:30']]);
  assert.deepEqual(days[6].slots, [['12:00','20:30']]);
  assert.equal(serializeHours(days)[2].hours, '12:00 – 15:30 · 18:30 – 20:30');
});
test('reject invalid, overlapping and incomplete hours', () => {
  for (const value of ['24:00 – 25:00', '12:00 – 11:00', '', '12:00 – 15:00 · 14:00 – 16:00']) assert.throws(() => parseSlots(value));
  assert.throws(() => expandHours(source.slice(0,3)));
  assert.throws(() => expandHours([...source, {days:'Lunedì',hours:'Chiuso'}]));
  assert.throws(() => serializeHours([]));
});
