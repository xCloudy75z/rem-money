var SmsParse = (function () {
  'use strict';

  function _num(x) {
    return Math.round(parseFloat(String(x).replace(/,/g, '')) * 100) / 100;
  }

  // "Trx. of AED40.00 ... at <SHOP>, <COUNTRY> is <Status>. ... Trx Date: DD/MM/YY HH:MM"
  function _matchPurchase(s) {
    var m = s.match(/Trx\.\s*of\s*AED\s?([\d,]+(?:\.\d{1,2})?)\b.*?\bat\s+(.+?),\s*[A-Za-z.\s]+?\bis\s+(\w+)\b/i);
    if (!m) return null;
    var status = /^approved$/i.test(m[3]) ? 'approved' : 'not-approved';
    var d = s.match(/Trx\s*Date:\s*(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})/i);
    return {
      raw: s, kind: 'purchase', status: status,
      amount: _num(m[1]), note: m[2].trim(),
      dateISO: d ? ('20' + d[3] + '-' + d[2] + '-' + d[1]) : null,
      timeHHMM: d ? (d[4] + ':' + d[5]) : null,
      repeatOfIndex: null
    };
  }

  function _matchDebit(s) {
    var m = s.match(/AED\s?([\d,]+(?:\.\d{1,2})?)\s+was\s+debited\s+from\s+your\s+account/i);
    if (!m) return null;
    return {
      raw: s, kind: 'debit', status: 'approved',
      amount: _num(m[1]), note: '', dateISO: null, timeHHMM: null, repeatOfIndex: null
    };
  }

  function _key(row) {
    if (row.kind === 'purchase') {
      return Number(row.amount).toFixed(2) + '|' + row.note.toUpperCase() + '|' + (row.dateISO || '') + '|' + (row.timeHHMM || '');
    }
    return Number(row.amount).toFixed(2) + '|' + row.raw;
  }

  function parse(text) {
    var lines = String(text || '').split(/\r?\n/);
    var rows = [];
    var unrecognized = [];
    var seen = {};
    for (var i = 0; i < lines.length; i++) {
      var s = lines[i].trim();
      if (!s) continue;
      var row = _matchPurchase(s) || _matchDebit(s);
      if (!row) { unrecognized.push(s); continue; }
      var k = _key(row);
      if (Object.prototype.hasOwnProperty.call(seen, k)) row.repeatOfIndex = seen[k];
      else seen[k] = rows.length;
      rows.push(row);
    }
    return { rows: rows, unrecognized: unrecognized };
  }

  return { parse: parse };
})();
