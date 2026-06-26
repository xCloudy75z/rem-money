const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');

const Calc = loadModule('calc.js');
const Store = loadModule('store.js');

function seedStateWithCycle(start, end, budget) {
  let s = Store.empty();
  s = Store.addCategory(s, { id: 'cat-x', name: 'X', icon: '•', color: '#999', order: 0, isArchived: false, createdAt: '' });
  s = Store.addCycle(s, { id: 'c1', startDate: start, endDate: end, startBudget: budget, archivedAt: null, createdAt: '' });
  s = Store.updateSettings(s, { activeCycleId: 'c1', lastUsedCategoryId: 'cat-x' });
  return s;
}

function mkTxn(id, date, amount, opts) {
  return Object.assign({
    id: id, cycleId: 'c1', categoryId: 'cat-x', date: date, amount: amount,
    isRefund: false, isExcludedFromPace: false, note: '', createdAt: '', updatedAt: ''
  }, opts || {});
}

// ---- Date helpers ----
test('daysBetweenInclusive: 28 May → 25 Jun = 29', () => {
  assert.strictEqual(Calc.daysBetweenInclusive('2026-05-28', '2026-06-25'), 29);
});

test('daysBetweenInclusive: same day = 1', () => {
  assert.strictEqual(Calc.daysBetweenInclusive('2026-05-30', '2026-05-30'), 1);
});

test('daysLeftIncludingToday respects cycle bounds', () => {
  const cycle = { startDate: '2026-05-25', endDate: '2026-06-24' };
  assert.strictEqual(Calc.daysLeftIncludingToday(cycle, '2026-05-25'), 31);
  assert.strictEqual(Calc.daysLeftIncludingToday(cycle, '2026-06-24'), 1);
  assert.strictEqual(Calc.daysLeftIncludingToday(cycle, '2026-06-25'), 0);
  assert.strictEqual(Calc.daysLeftIncludingToday(cycle, '2026-05-20'), 31);
});

// ---- Limit math (LOCKED includes-today) ----
test('Day-1 limit = budget / total cycle days = 12,454.70 / 31 = 401.76', () => {
  const s = seedStateWithCycle('2026-05-25', '2026-06-24', 12454.70);
  const limit = Calc.todayLimit(s, '2026-05-25', 'c1');
  assert.strictEqual(limit, 401.76);
  assert.strictEqual(Calc.aedLeftToday(s, '2026-05-25', 'c1'), 401.76);
});

test('Underspend yesterday → tomorrow limit goes up', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 12454.70);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-25', 100));
  // Day 2: (12454.70 - 100) / 30 = 411.82
  const limit2 = Calc.todayLimit(s, '2026-05-26', 'c1');
  assert.strictEqual(limit2, Math.round((12354.70 / 30) * 100) / 100);
});

test('Refund subtracts from total spent', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 12454.70);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 100));
  s = Store.addTransaction(s, mkTxn('t2', '2026-05-26', 30, { isRefund: true }));
  assert.strictEqual(Calc.cycleTotalSpent(s, 'c1'), 70);
});

test('isExcludedFromPace removes txn from totals', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 12454.70);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 999, { isExcludedFromPace: true }));
  assert.strictEqual(Calc.cycleTotalSpent(s, 'c1'), 0);
});

// ---- Pace ----
test('pace returns "unknown" with fewer than 4 entries', () => {
  let s = seedStateWithCycle('2026-05-01', '2026-05-31', 3000);
  for (let i = 0; i < 3; i++) s = Store.addTransaction(s, mkTxn('t' + i, '2026-05-29', 100));
  assert.strictEqual(Calc.pace(s, '2026-05-29', 'c1'), 'unknown');
});

test('pace returns "on-track" when recent window matches prior window', () => {
  let s = seedStateWithCycle('2026-05-01', '2026-05-31', 3000);
  for (let day = 24; day <= 29; day++) {
    for (let n = 0; n < 2; n++) {
      s = Store.addTransaction(s, mkTxn('d' + day + '-' + n, '2026-05-' + String(day).padStart(2, '0'), 50));
    }
  }
  assert.strictEqual(Calc.pace(s, '2026-05-29', 'c1'), 'on-track');
});

// ---- Historical reconstruction ----
test('historicalLimitsByDay matches todayLimit single-day call', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 12454.70);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-25', 100));
  s = Store.addTransaction(s, mkTxn('t2', '2026-05-26', 50));
  const byDay = Calc.historicalLimitsByDay(s, 'c1');
  assert.strictEqual(byDay['2026-05-25'].limit, 401.76);
  assert.strictEqual(byDay['2026-05-26'].limit, Math.round((12354.70 / 30) * 100) / 100);
  assert.strictEqual(byDay['2026-05-26'].limit, Calc.todayLimit(s, '2026-05-26', 'c1'));
});

// ---- Cycle summary ----
test('cycleSummary computes biggest day + top categories', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 12454.70);
  s = Store.addCategory(s, { id: 'cat-y', name: 'Y', icon: '•', color: '#999', order: 1, isArchived: false, createdAt: '' });
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 100));
  s = Store.addTransaction(s, mkTxn('t2', '2026-05-26', 200));
  s = Store.addTransaction(s, mkTxn('t3', '2026-05-27', 50, { categoryId: 'cat-y' }));
  const sum = Calc.cycleSummary(s, 'c1');
  assert.strictEqual(sum.total, 350);
  assert.strictEqual(sum.biggestDay.date, '2026-05-26');
  assert.strictEqual(sum.biggestDay.amount, 300);
  assert.strictEqual(sum.biggestTxn.id, 't2');
  assert.strictEqual(sum.topCategories[0].categoryId, 'cat-x');
});

// ---- Category budgets ----
test('monthlyBudget: monthly passes through', () => {
  assert.strictEqual(Calc.monthlyBudget({ budget: 2000, budgetPeriod: 'monthly' }), 2000);
});
test('monthlyBudget: yearly divides by 12', () => {
  assert.strictEqual(Calc.monthlyBudget({ budget: 6000, budgetPeriod: 'yearly' }), 500);
});
test('monthlyBudget: yearly rounds to 2dp', () => {
  assert.strictEqual(Calc.monthlyBudget({ budget: 1000, budgetPeriod: 'yearly' }), Math.round((1000 / 12) * 100) / 100);
});
test('monthlyBudget: missing/zero budget is 0', () => {
  assert.strictEqual(Calc.monthlyBudget({ budgetPeriod: 'monthly' }), 0);
  assert.strictEqual(Calc.monthlyBudget({ budget: 0, budgetPeriod: 'yearly' }), 0);
});
test('categorySpentThisCycle: signed sum for one category in one cycle', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 100));
  s = Store.addTransaction(s, mkTxn('t2', '2026-05-27', 40, { isRefund: true }));
  assert.strictEqual(Calc.categorySpentThisCycle(s, 'cat-x', 'c1'), 60);
});
test('categorySpentThisCycle: includes excluded-from-pace items (e.g. byWife)', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 100, { isExcludedFromPace: true, byWife: true }));
  assert.strictEqual(Calc.categorySpentThisCycle(s, 'cat-x', 'c1'), 100);
});
test('planSummary: spent/budget/over/pct and total', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);
  s = Store.updateCategory(s, 'cat-x', { budget: 2000, budgetPeriod: 'monthly' });
  s = Store.addCategory(s, { id: 'cat-y', name: 'Y', icon: '•', color: '#abc', order: 1, isArchived: false, createdAt: '', budget: 6000, budgetPeriod: 'yearly' });
  s = Store.addTransaction(s, mkTxn('t1', '2026-05-26', 1500));
  s = Store.addTransaction(s, mkTxn('t2', '2026-05-27', 700, { categoryId: 'cat-y' }));
  const sum = Calc.planSummary(s, 'c1');
  const rx = sum.rows.find(r => r.categoryId === 'cat-x');
  const ry = sum.rows.find(r => r.categoryId === 'cat-y');
  assert.strictEqual(rx.spent, 1500);
  assert.strictEqual(rx.monthlyBudget, 2000);
  assert.strictEqual(rx.pct, 75);
  assert.strictEqual(rx.over, false);
  assert.strictEqual(ry.monthlyBudget, 500);
  assert.strictEqual(ry.pct, 100);
  assert.strictEqual(ry.over, true);
  assert.strictEqual(sum.totalMonthlyPlanned, 2500);
});
test('planSummary: zero-budget excluded from total, archived skipped', () => {
  let s = seedStateWithCycle('2026-05-25', '2026-06-24', 10000);
  s = Store.addCategory(s, { id: 'cat-z', name: 'Z', icon: '•', color: '#abc', order: 1, isArchived: true, createdAt: '', budget: 999, budgetPeriod: 'monthly' });
  const sum = Calc.planSummary(s, 'c1');
  assert.strictEqual(sum.totalMonthlyPlanned, 0);
  assert.ok(!sum.rows.some(r => r.categoryId === 'cat-z'));
});
