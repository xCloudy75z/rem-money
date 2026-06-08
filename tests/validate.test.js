const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');
const Validate = loadModule('validate.js');
const Store    = loadModule('store.js');

test('Validate accepts a freshly seeded state with one cycle + categories', () => {
  let s = Store.empty();
  s = Store.addCycle(s, { id: 'c1', startDate: '2026-05-25', endDate: '2026-06-24', startBudget: 12454.70, archivedAt: null, createdAt: '2026-05-25T00:00:00.000Z' });
  s = Store.updateSettings(s, { activeCycleId: 'c1' });
  s = Store.addCategory(s, { id: 'cat-food', name: 'Food', icon: '🍔', color: '#e67e22', order: 0, isArchived: false, createdAt: '2026-05-25T00:00:00.000Z' });
  const r = Validate.validate(s);
  assert.deepStrictEqual(r, { ok: true, errors: [] });
});

test('Validate flags overlapping cycles', () => {
  let s = Store.empty();
  s = Store.addCycle(s, { id: 'c1', startDate: '2026-05-01', endDate: '2026-05-31', startBudget: 1000, archivedAt: null, createdAt: '' });
  s = Store.addCycle(s, { id: 'c2', startDate: '2026-05-15', endDate: '2026-06-14', startBudget: 1000, archivedAt: null, createdAt: '' });
  const r = Validate.validate(s);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.some(e => /overlap/.test(e)));
});

test('Validate flags transactions with invalid FKs', () => {
  let s = Store.empty();
  s = Store.addTransaction(s, { id: 't1', cycleId: 'missing', categoryId: 'missing', date: '2026-05-30', amount: 10, isRefund: false, note: '', createdAt: '', updatedAt: '' });
  const r = Validate.validate(s);
  assert.strictEqual(r.ok, false);
  assert.ok(r.errors.length >= 2);
});

test('Validate flags salaryDay out of range', () => {
  let s = Store.empty();
  s.settings.salaryDay = 30;
  const r = Validate.validate(s);
  assert.ok(r.errors.some(e => /salaryDay/.test(e)));
});
