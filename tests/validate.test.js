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

test('validate accepts a well-formed wifePayment', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.settings.activeCycleId = 'cy';
  s.wifePayments['wp1'] = { id: 'wp1', amount: 100, date: '2026-06-12', note: 'ok', createdAt: '2026-06-12T10:00:00.000Z' };
  assert.strictEqual(Validate.validate(s).ok, true, JSON.stringify(Validate.validate(s).errors));
});

test('validate rejects a wifePayment with non-positive amount', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.wifePayments['wp1'] = { id: 'wp1', amount: 0, date: '2026-06-12', note: '', createdAt: '' };
  assert.strictEqual(Validate.validate(s).ok, false);
});

test('validate rejects a wifePayment with malformed date', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.wifePayments['wp1'] = { id: 'wp1', amount: 50, date: 'June 12', note: '', createdAt: '' };
  assert.strictEqual(Validate.validate(s).ok, false);
});

test('validate rejects a transaction whose byWife is not boolean', () => {
  const s = Store.empty();
  s.categories['c'] = { id: 'c', name: 'Other' };
  s.cycles['cy'] = { id: 'cy', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 1000 };
  s.transactions['t1'] = { id: 't1', date: '2026-06-12', amount: 10, categoryId: 'c', cycleId: 'cy', byWife: 'yes' };
  assert.strictEqual(Validate.validate(s).ok, false);
});

(function () {
  const Validate2 = loadModule('validate.js');
  const Store2 = loadModule('store.js');

  function validBudgetState() {
    let s = Store2.empty();
    s = Store2.addCategory(s, { id: 'c', name: 'C', icon: '•', color: '#999', order: 0, isArchived: false, createdAt: '', budget: 100, budgetPeriod: 'monthly' });
    s = Store2.addCycle(s, { id: 'cy', startDate: '2026-01-01', endDate: '2026-01-31', startBudget: 1000, archivedAt: null, createdAt: '' });
    s = Store2.updateSettings(s, { activeCycleId: 'cy' });
    return s;
  }

  test('validate: a valid category budget passes', () => {
    assert.strictEqual(Validate2.validate(validBudgetState()).ok, true);
  });
  test('validate: negative budget fails', () => {
    let s = validBudgetState();
    s.categories.c.budget = -1;
    assert.strictEqual(Validate2.validate(s).ok, false);
  });
  test('validate: bad budgetPeriod fails', () => {
    let s = validBudgetState();
    s.categories.c.budgetPeriod = 'weekly';
    assert.strictEqual(Validate2.validate(s).ok, false);
  });
})();
