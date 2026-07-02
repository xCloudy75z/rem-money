const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');

const Calc = loadModule('calc.js');
const Store = loadModule('store.js');

function mkTxn(id, amount, opts) {
  return Object.assign({
    id: id, cycleId: 'c1', categoryId: 'cat', date: '2026-06-01', amount: amount,
    isRefund: false, isExcludedFromPace: false,
    isCredit: false, liabilitySettled: false, settledAt: null,
    byWife: false, note: '', createdAt: '', updatedAt: ''
  }, opts || {});
}

function stateWith(txns, payments) {
  var s = Store.empty();
  (txns || []).forEach(function (t) { s.transactions[t.id] = t; });
  (payments || []).forEach(function (p) { s.wifePayments[p.id] = p; });
  return s;
}

function pay(id, amount, date) {
  return { id: id, amount: amount, date: date || '2026-06-05', note: '', createdAt: '' };
}

test('wifeSummary: charged minus paid = balance', () => {
  const s = stateWith(
    [mkTxn('t1', 100, { byWife: true, isCredit: true }), mkTxn('t2', 50, { byWife: true, isCredit: true })],
    [pay('p1', 80)]
  );
  const sum = Calc.wifeSummary(s);
  assert.strictEqual(sum.charged, 150);
  assert.strictEqual(sum.paid, 80);
  assert.strictEqual(sum.balance, 70);
  assert.strictEqual(sum.purchases.length, 2);
  assert.strictEqual(sum.payments.length, 1);
});

test('wifeSummary: a wife refund reduces charged', () => {
  const s = stateWith(
    [mkTxn('t1', 100, { byWife: true, isCredit: true }), mkTxn('t2', 25, { byWife: true, isCredit: true, isRefund: true })],
    []
  );
  assert.strictEqual(Calc.wifeSummary(s).charged, 75);
  assert.strictEqual(Calc.wifeSummary(s).balance, 75);
});

test('wifeSummary: overpayment yields a negative balance', () => {
  const s = stateWith([mkTxn('t1', 100, { byWife: true, isCredit: true })], [pay('p1', 150)]);
  assert.strictEqual(Calc.wifeSummary(s).balance, -50);
});

test('wifeSummary: ignores non-wife transactions', () => {
  const s = stateWith([mkTxn('t1', 100, { isCredit: true }), mkTxn('t2', 40, { byWife: true, isCredit: true })], []);
  assert.strictEqual(Calc.wifeSummary(s).charged, 40);
});

test('wifeSummary: empty state is zero', () => {
  const sum = Calc.wifeSummary(Store.empty());
  assert.strictEqual(sum.charged, 0);
  assert.strictEqual(sum.paid, 0);
  assert.strictEqual(sum.balance, 0);
});

test('wifeSummary: handles a state with no wifePayments key (defensive)', () => {
  const s = Store.empty();
  delete s.wifePayments;
  s.transactions['t1'] = mkTxn('t1', 60, { byWife: true, isCredit: true });
  assert.strictEqual(Calc.wifeSummary(s).balance, 60);
});

// ---- Per-item settle (the "She paid" button marks THAT purchase reimbursed) ----

test('wifeSummary: a settled purchase leaves the owed list and drops the balance', () => {
  const s = stateWith([
    mkTxn('t1', 50.40, { byWife: true, isCredit: true, wifeSettled: true }),
    mkTxn('t2', 22.00, { byWife: true, isCredit: true })
  ], []);
  const sum = Calc.wifeSummary(s);
  // only the unsettled purchase is still owed:
  assert.strictEqual(sum.purchases.length, 1);
  assert.strictEqual(sum.purchases[0].id, 't2');
  // the settled one moves into its own list:
  assert.strictEqual(sum.settledPurchases.length, 1);
  assert.strictEqual(sum.settledPurchases[0].id, 't1');
  // balance reflects only what is still owed — no duplication:
  assert.strictEqual(sum.balance, 22.00);
});

test('wifeSummary: settling every purchase yields a zero balance with no payment records', () => {
  const s = stateWith([
    mkTxn('t1', 50.40, { byWife: true, isCredit: true, wifeSettled: true })
  ], []);
  const sum = Calc.wifeSummary(s);
  assert.strictEqual(sum.balance, 0);
  // settling does NOT spawn a wifePayment (that was the duplication bug):
  assert.strictEqual(sum.payments.length, 0);
});

test('Store.setWifeSettled marks a purchase reimbursed and back', () => {
  let s = stateWith([mkTxn('t1', 50.40, { byWife: true, isCredit: true })], []);
  s = Store.setWifeSettled(s, 't1', true, '2026-07-01T10:00:00.000Z');
  assert.strictEqual(s.transactions['t1'].wifeSettled, true);
  assert.strictEqual(s.transactions['t1'].wifeSettledAt, '2026-07-01T10:00:00.000Z');
  assert.strictEqual(Calc.wifeSummary(s).balance, 0);
  s = Store.setWifeSettled(s, 't1', false, '2026-07-01T10:00:00.000Z');
  assert.strictEqual(s.transactions['t1'].wifeSettled, false);
  assert.strictEqual(s.transactions['t1'].wifeSettledAt, null);
  assert.strictEqual(Calc.wifeSummary(s).balance, 50.40);
});

test('invariant: a byWife credit spend counts in liabilitySummary but is excluded from pace', () => {
  // byWife spends are stored via Store.addTransaction, which forces the flags.
  let s = Store.empty();
  s.cycles['c1'] = { id: 'c1', startDate: '2026-06-01', endDate: '2026-06-30', startBudget: 3000 };
  s = Store.addTransaction(s, { id: 't1', cycleId: 'c1', categoryId: 'cat', date: '2026-06-01', amount: 200, byWife: true });
  // counts toward what is owed to the bank:
  assert.strictEqual(Calc.liabilitySummary(s).outstanding, 200);
  // but NOT toward cycle spend / pace (isExcludedFromPace forced true):
  assert.strictEqual(Calc.cycleTotalSpent(s, 'c1'), 0);
});
