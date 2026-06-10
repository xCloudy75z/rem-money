const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');

const Calc = loadModule('calc.js');
const Store = loadModule('store.js');
const Migrate = loadModule('migrate.js');

function mkTxn(id, amount, opts) {
  return Object.assign({
    id: id, cycleId: 'c1', categoryId: 'cat', date: '2026-06-01', amount: amount,
    isRefund: false, isExcludedFromPace: false,
    isCredit: false, liabilitySettled: false, settledAt: null,
    note: '', createdAt: '', updatedAt: ''
  }, opts || {});
}

function stateWith(txns) {
  var s = Store.empty();
  txns.forEach(function (t) { s.transactions[t.id] = t; });
  return s;
}

// ---- liabilitySummary ----
test('liabilitySummary sums unpaid credit across cycles, excludes non-credit and settled', () => {
  const s = stateWith([
    mkTxn('t1', 100, { isCredit: true, cycleId: 'c1' }),
    mkTxn('t2', 50,  { isCredit: false, cycleId: 'c1' }),
    mkTxn('t3', 200, { isCredit: true, cycleId: 'c2' }),
    mkTxn('t4', 30,  { isCredit: true, liabilitySettled: true, settledAt: '2026-06-05T10:00:00.000Z', cycleId: 'c2' })
  ]);
  const sum = Calc.liabilitySummary(s);
  assert.strictEqual(sum.outstanding, 300);
  assert.strictEqual(sum.unpaidCount, 2);
  assert.strictEqual(sum.items.length, 2);
  assert.strictEqual(sum.paidItems.length, 1);
  assert.strictEqual(sum.paidItems[0].id, 't4');
});

test('liabilitySummary: a credit refund reduces the outstanding total', () => {
  const s = stateWith([
    mkTxn('t1', 100, { isCredit: true }),
    mkTxn('t2', 25,  { isCredit: true, isRefund: true })
  ]);
  assert.strictEqual(Calc.liabilitySummary(s).outstanding, 75);
});

test('liabilitySummary is empty when nothing is on credit', () => {
  const s = stateWith([mkTxn('t1', 100, { isCredit: false })]);
  const sum = Calc.liabilitySummary(s);
  assert.strictEqual(sum.outstanding, 0);
  assert.strictEqual(sum.unpaidCount, 0);
  assert.strictEqual(sum.items.length, 0);
});

test('marking a credit item paid removes it from outstanding', () => {
  let s = stateWith([mkTxn('t1', 100, { isCredit: true })]);
  assert.strictEqual(Calc.liabilitySummary(s).outstanding, 100);
  s = Store.updateTransaction(s, 't1', { liabilitySettled: true, settledAt: '2026-06-10T00:00:00.000Z' });
  const sum = Calc.liabilitySummary(s);
  assert.strictEqual(sum.outstanding, 0);
  assert.strictEqual(sum.unpaidCount, 0);
  assert.strictEqual(sum.paidItems.length, 1);
});

// ---- migration backfill ----
test('migrate backfills credit fields on spends recorded before the feature', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {},
    cycles: {},
    transactions: { t1: { id: 't1', date: '2026-06-01', amount: 50, categoryId: 'c', cycleId: 'cy' } }
  };
  const out = Migrate.migrate(input, { now: '2026-06-10T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.strictEqual(out.transactions.t1.isCredit, false);
  assert.strictEqual(out.transactions.t1.liabilitySettled, false);
  assert.strictEqual(out.transactions.t1.settledAt, null);
});

test('migrate leaves already-tagged credit spends untouched', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {},
    cycles: {},
    transactions: { t1: { id: 't1', date: '2026-06-01', amount: 50, categoryId: 'c', cycleId: 'cy', isCredit: true, liabilitySettled: true, settledAt: '2026-06-02T00:00:00.000Z' } }
  };
  const out = Migrate.migrate(input, { now: '2026-06-10T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.strictEqual(out.transactions.t1.isCredit, true);
  assert.strictEqual(out.transactions.t1.liabilitySettled, true);
  assert.strictEqual(out.transactions.t1.settledAt, '2026-06-02T00:00:00.000Z');
});
