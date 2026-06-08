const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');
const Format = loadModule('format.js');

test('fmtMoney formats AED with 2dp', () => {
  assert.strictEqual(Format.fmtMoney(12454.7, 'AED'), '12,454.70 AED');
  assert.strictEqual(Format.fmtMoney(-35.8, 'AED'), '−35.80 AED');
  assert.strictEqual(Format.fmtMoney(0, 'AED'), '0.00 AED');
});

test('fmtDateLong returns "Sat 30 May" for 2026-05-30', () => {
  assert.strictEqual(Format.fmtDateLong('2026-05-30'), 'Sat 30 May');
});

test('fmtDateShort omits weekday', () => {
  assert.strictEqual(Format.fmtDateShort('2026-05-30'), '30 May');
});

test('fmtTime extracts HH:MM from full ISO', () => {
  assert.strictEqual(Format.fmtTime('2026-05-30T14:32:00.000Z'), '14:32');
});

// Regression: createdAt is stored as a LOCAL wall-clock ISO (see App.nowISO),
// so fmtTime must echo the local hour entered — not shift it by the UTC offset.
// This mirrors how nowISO() builds the string from local Date components.
test('fmtTime echoes the local wall-clock time it was stamped with', () => {
  var d = new Date(2026, 4, 30, 14, 32, 0); // 2:32 PM local, any timezone
  var p = function (n) { return String(n).padStart(2, '0'); };
  var localISO = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
    + 'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) + '.000Z';
  assert.strictEqual(Format.fmtTime(localISO), '14:32');
});

test('escapeHTML neutralises XSS payloads', () => {
  assert.strictEqual(Format.escapeHTML('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
  assert.strictEqual(Format.escapeHTML('a&b"c\'d'), 'a&amp;b&quot;c&#39;d');
});

test('parseAmount handles formatted input', () => {
  assert.strictEqual(Format.parseAmount('1,234.50'), 1234.50);
  assert.strictEqual(Format.parseAmount('AED 35.80'), 35.80);
  assert.strictEqual(Format.parseAmount('  100 '), 100);
  assert.ok(isNaN(Format.parseAmount('abc')));
  assert.ok(isNaN(Format.parseAmount('')));
});
