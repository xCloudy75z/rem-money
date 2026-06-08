var Format = (function () {
  'use strict';

  function fmtMoney(amount, currency, locale) {
    locale = locale || 'en-US';
    currency = currency || 'AED';
    var n = Number(amount) || 0;
    var abs = Math.abs(n);
    var s = abs.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return (n < 0 ? '−' : '') + s + ' ' + currency;
  }

  function _parseISOToUTCParts(iso) {
    return {
      y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10),
      H: iso.length > 10 ? +iso.slice(11, 13) : 0,
      M: iso.length > 10 ? +iso.slice(14, 16) : 0
    };
  }

  // Zeller's congruence for weekday — pure arithmetic, no Date
  function _weekdayIndex(y, m, d) {
    if (m < 3) { m += 12; y -= 1; }
    var k = y % 100;
    var j = Math.floor(y / 100);
    var h = (d + Math.floor(13 * (m + 1) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) - 2 * j + 700) % 7;
    return (h + 6) % 7;  // 0=Sun..6=Sat
  }

  var WEEK = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  var MON  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  function fmtDateLong(iso) {
    if (!iso) return '';
    var p = _parseISOToUTCParts(iso);
    return WEEK[_weekdayIndex(p.y, p.m, p.d)] + ' ' + p.d + ' ' + MON[p.m - 1];
  }

  function fmtDateShort(iso) {
    if (!iso) return '';
    var p = _parseISOToUTCParts(iso);
    return p.d + ' ' + MON[p.m - 1];
  }

  function fmtTime(iso) {
    if (!iso) return '';
    var p = _parseISOToUTCParts(iso);
    return String(p.H).padStart(2, '0') + ':' + String(p.M).padStart(2, '0');
  }

  function escapeHTML(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch];
    });
  }

  function parseAmount(raw) {
    if (raw == null) return NaN;
    var s = String(raw).trim();
    s = s.replace(/[^\d.,\-]/g, '');
    if (s === '' || s === '-') return NaN;
    var lastDot = s.lastIndexOf('.');
    var lastComma = s.lastIndexOf(',');
    if (lastDot > -1 || lastComma > -1) {
      var dec = lastDot > lastComma ? lastDot : lastComma;
      var intPart = s.slice(0, dec).replace(/[.,]/g, '');
      var fracPart = s.slice(dec + 1).replace(/[.,]/g, '');
      s = intPart + '.' + fracPart;
    }
    var n = Number(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : NaN;
  }

  return {
    fmtMoney: fmtMoney,
    fmtDateLong: fmtDateLong, fmtDateShort: fmtDateShort, fmtTime: fmtTime,
    escapeHTML: escapeHTML,
    parseAmount: parseAmount
  };
})();
