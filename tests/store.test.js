const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

// Load IIFE modules in Node by evaluating them and returning the global.
function loadModule(file) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  const globalName = path.basename(file, '.js').replace(/^./, c => c.toUpperCase());
  // Map filename → expected global name (PascalCase, handles edge cases)
  const map = {
    'format':'Format','i18n':'I18n','seed':'Seed','validate':'Validate',
    'migrate':'Migrate','calc':'Calc','store':'Store'
  };
  const name = map[path.basename(file, '.js')] || globalName;
  const fn = new Function(code + '; return ' + name + ';');
  return fn();
}

const Store = loadModule('store.js');

function fakeStorage() {
  var m = {};
  return {
    getItem(k) { return Object.prototype.hasOwnProperty.call(m, k) ? m[k] : null; },
    setItem(k, v) { m[k] = String(v); },
    removeItem(k) { delete m[k]; }
  };
}

test('Store.empty() returns canonical empty shape', () => {
  const s = Store.empty();
  assert.strictEqual(s.schemaVersion, 1);
  assert.strictEqual(s.settings.currency, 'AED');
  assert.strictEqual(s.settings.salaryDay, 25);
  assert.deepStrictEqual(s.categories, {});
  assert.deepStrictEqual(s.cycles, {});
  assert.deepStrictEqual(s.transactions, {});
});

test('Store.clone is a deep copy', () => {
  const a = Store.empty();
  a.transactions['t1'] = { id: 't1', amount: 50 };
  const b = Store.clone(a);
  b.transactions['t1'].amount = 999;
  assert.strictEqual(a.transactions['t1'].amount, 50);
});

test('Store.parse handles empty / null / corrupt / non-object', () => {
  assert.deepStrictEqual(Store.parse(null).recovered, false);
  assert.deepStrictEqual(Store.parse('').recovered, false);
  assert.deepStrictEqual(Store.parse('not json').recovered, true);
  assert.deepStrictEqual(Store.parse('"a string"').recovered, true);
  assert.deepStrictEqual(Store.parse('[1,2,3]').recovered, true);
  assert.strictEqual(Store.parse('{"schemaVersion":1}').state.schemaVersion, 1);
});

test('Store.save round-trips through load', () => {
  const s = fakeStorage();
  const state = Store.empty();
  state.settings.currency = 'AED';
  assert.strictEqual(Store.save(state, s).ok, true);
  const loaded = Store.load(s);
  assert.strictEqual(loaded.recovered, false);
  assert.strictEqual(loaded.state.settings.currency, 'AED');
});

test('Store.save reports quota errors', () => {
  const s = {
    setItem() { const e = new Error('q'); e.name = 'QuotaExceededError'; throw e; },
    getItem() { return null; }, removeItem() {}
  };
  const r = Store.save(Store.empty(), s);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'quota');
});

test('Store.snapshot + restoreSnapshot round-trip', () => {
  const s = fakeStorage();
  const original = Store.empty();
  original.settings.currency = 'USD';
  Store.snapshot(original, s);
  const restored = Store.restoreSnapshot(s);
  assert.strictEqual(restored.settings.currency, 'USD');
  Store.clearSnapshot(s);
  assert.strictEqual(Store.restoreSnapshot(s), null);
});

test('addTransaction is immutable', () => {
  const a = Store.empty();
  const txn = { id: 't1', amount: 35, categoryId: 'cat-food', cycleId: 'c1', date: '2026-05-30', isRefund: false };
  const b = Store.addTransaction(a, txn);
  assert.strictEqual(Object.keys(a.transactions).length, 0);
  assert.strictEqual(Object.keys(b.transactions).length, 1);
  assert.deepStrictEqual(b.transactions['t1'], txn);
});

test('updateTransaction patches one txn', () => {
  let s = Store.addTransaction(Store.empty(), { id: 't1', amount: 35 });
  s = Store.updateTransaction(s, 't1', { amount: 50 });
  assert.strictEqual(s.transactions['t1'].amount, 50);
});

test('deleteTransaction removes the key', () => {
  let s = Store.addTransaction(Store.empty(), { id: 't1', amount: 35 });
  s = Store.deleteTransaction(s, 't1');
  assert.strictEqual(s.transactions['t1'], undefined);
});

test('addTransaction without id throws', () => {
  assert.throws(() => Store.addTransaction(Store.empty(), { amount: 1 }));
});

test('addCategory rejects duplicate name (case-insensitive)', () => {
  let s = Store.addCategory(Store.empty(), { id: 'cat-food', name: 'Food' });
  assert.throws(() => Store.addCategory(s, { id: 'cat-food-2', name: 'food' }), /duplicate/);
});

test('deleteCategory blocked when transactions reference it', () => {
  let s = Store.addCategory(Store.empty(), { id: 'cat-food', name: 'Food' });
  s = Store.addTransaction(s, { id: 't1', categoryId: 'cat-food', amount: 10 });
  assert.throws(() => Store.deleteCategory(s, 'cat-food'), /reassign/);
});

test('reassignCategory updates all referencing transactions', () => {
  let s = Store.addCategory(Store.empty(), { id: 'cat-food', name: 'Food' });
  s = Store.addCategory(s, { id: 'cat-other', name: 'Other' });
  s = Store.addTransaction(s, { id: 't1', categoryId: 'cat-food', amount: 10 });
  s = Store.addTransaction(s, { id: 't2', categoryId: 'cat-food', amount: 20 });
  s = Store.reassignCategory(s, 'cat-food', 'cat-other');
  assert.strictEqual(s.transactions['t1'].categoryId, 'cat-other');
  assert.strictEqual(s.transactions['t2'].categoryId, 'cat-other');
});

test('updateSettings clamps salaryDay to 1-28', () => {
  let s = Store.updateSettings(Store.empty(), { salaryDay: 31 });
  assert.strictEqual(s.settings.salaryDay, 28);
  s = Store.updateSettings(s, { salaryDay: 0 });
  assert.strictEqual(s.settings.salaryDay, 1);
});

test('Store.empty() includes an empty wifePayments map', () => {
  assert.deepStrictEqual(Store.empty().wifePayments, {});
});

test('addWifePayment adds immutably; original unchanged', () => {
  const a = Store.empty();
  const p = { id: 'wp1', amount: 100, date: '2026-06-12', note: '', createdAt: '2026-06-12T10:00:00.000Z' };
  const b = Store.addWifePayment(a, p);
  assert.strictEqual(Object.keys(a.wifePayments).length, 0);
  assert.deepStrictEqual(b.wifePayments['wp1'], p);
});

test('addWifePayment throws without id or with non-positive amount', () => {
  const a = Store.empty();
  assert.throws(() => Store.addWifePayment(a, { amount: 10 }));
  assert.throws(() => Store.addWifePayment(a, { id: 'wp1', amount: 0 }));
  assert.throws(() => Store.addWifePayment(a, { id: 'wp1', amount: -5 }));
});

test('deleteWifePayment removes the key', () => {
  let s = Store.addWifePayment(Store.empty(), { id: 'wp1', amount: 100, date: '2026-06-12', note: '', createdAt: '' });
  s = Store.deleteWifePayment(s, 'wp1');
  assert.strictEqual(s.wifePayments['wp1'], undefined);
});

test('addTransaction forces isCredit + isExcludedFromPace when byWife is true', () => {
  const txn = { id: 't1', amount: 50, categoryId: 'c', cycleId: 'cy', date: '2026-06-12', byWife: true };
  const b = Store.addTransaction(Store.empty(), txn);
  assert.strictEqual(b.transactions['t1'].byWife, true);
  assert.strictEqual(b.transactions['t1'].isCredit, true);
  assert.strictEqual(b.transactions['t1'].isExcludedFromPace, true);
  // input object must NOT be mutated
  assert.strictEqual(txn.isCredit, undefined);
});

test('updateTransaction toggling byWife on forces the flags', () => {
  let s = Store.addTransaction(Store.empty(), { id: 't1', amount: 50, categoryId: 'c', cycleId: 'cy', date: '2026-06-12', isCredit: false, isExcludedFromPace: false });
  s = Store.updateTransaction(s, 't1', { byWife: true });
  assert.strictEqual(s.transactions['t1'].isCredit, true);
  assert.strictEqual(s.transactions['t1'].isExcludedFromPace, true);
});

module.exports = { loadModule };
