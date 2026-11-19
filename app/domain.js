/* Pure helpers shared by the future owner interface and its tests. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RabelDomain = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DAYS = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
  const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  function parseSlots(hours) {
    if (norm(hours) === 'chiuso') return [];
    const parts = String(hours).split('·');
    let previous = -1;
    return parts.map(part => {
      const match = part.trim().match(/^(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})$/);
      if (!match) throw new Error('Formato orario non valido');
      const [, ah, am, bh, bm] = match.map((x, i) => i ? Number(x) : x);
      if (ah > 23 || bh > 23 || am > 59 || bm > 59) throw new Error('Ora non valida');
      const start = ah * 60 + am, end = bh * 60 + bm;
      if (start >= end || start < previous) throw new Error('Fasce sovrapposte o non valide');
      previous = end;
      return [String(ah).padStart(2,'0') + ':' + String(am).padStart(2,'0'), String(bh).padStart(2,'0') + ':' + String(bm).padStart(2,'0')];
    });
  }
  function expandHours(rows) {
    const result = new Array(7).fill(null);
    for (const row of rows) {
      const group = String(row.days || '').split(/\s*[–—-]\s*/).map(norm);
      if (group.length > 2 || group.length < 1) throw new Error('Giorno non valido');
      const start = DAYS.findIndex(day => norm(day) === group[0]);
      const end = group.length === 2 ? DAYS.findIndex(day => norm(day) === group[1]) : start;
      if (start < 0 || end < 0 || end < start) throw new Error('Intervallo giorni non valido');
      const slots = parseSlots(row.hours);
      for (let i = start; i <= end; i++) {
        if (result[i]) throw new Error('Giorno duplicato');
        result[i] = {days:DAYS[i], slots:slots.map(slot => slot.slice())};
      }
    }
    if (result.some(x => x === null)) throw new Error('Orari incompleti');
    return result;
  }
  function serializeHours(days) {
    if (!Array.isArray(days) || days.length !== 7) throw new Error('Servono sette giorni');
    return days.map((day, i) => {
      if (day.days !== DAYS[i] || !Array.isArray(day.slots)) throw new Error('Giorno non valido');
      const raw = day.slots.length ? day.slots.map(slot => slot.join(' – ')).join(' · ') : 'Chiuso';
      const slots = parseSlots(raw);
      const hours = slots.length ? slots.map(slot => slot.join(' – ')).join(' · ') : 'Chiuso';
      return {days:day.days, hours};
    });
  }
  return {DAYS, parseSlots, expandHours, serializeHours};
});
