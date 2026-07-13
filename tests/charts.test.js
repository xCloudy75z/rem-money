const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');

const Calc = loadModule('calc.js');
const Store = loadModule('store.js');

function seedCycle(start, end, budget) {
  let s = Store.empty();
  s = Store.addCategory(s, { id: 'a', name: 'A', icon: '•', color: '#111', order: 0, isArchived: false, createdAt: '' });
  s = Store.addCategory(s, { id: 'b', name: 'B', icon: '•', color: '#222', order: 1, isArchived: false, createdAt: '' });
  s = Store.addCategory(s, { id: 'c', name: 'C', icon: '•', color: '#333', order: 2, isArchived: false, createdAt: '' });
  s = Store.addCycle(s, { id: 'c1', startDate: start, endDate: end, startBudget: budget, archivedAt: null, createdAt: '' });
  s = Store.updateSettings(s, { activeCycleId: 'c1', lastUsedCategoryId: 'a' });
  return s;
}

function tx(id, date, amount, catId, opts) {
  return Object.assign({
    id: id, cycleId: 'c1', categoryId: catId || 'a', date: date, amount: amount,
    isRefund: false, isExcludedFromPace: false, note: '', createdAt: '', updatedAt: ''
  }, opts || {});
}

// ---------- paceSeries ----------
test('paceSeries: one point per cycle day, cumulative and ideal are correct', () => {
  let s = seedCycle('2026-06-01', '2026-06-30', 3000); // 30 days, ideal = 100/day
  s = Store.addTransaction(s, tx('t1', '2026-06-01', 100));
  s = Store.addTransaction(s, tx('t2', '2026-06-02', 50));
  s = Store.addTransaction(s, tx('t3', '2026-06-05', 200));
  const p = Calc.paceSeries(s, 'c1', '2026-06-05');

  assert.strictEqual(p.totalDays, 30);
  assert.strictEqual(p.budget, 3000);
  assert.strictEqual(p.days.length, 30);
  assert.strictEqual(p.days[0].cumulative, 100);   // day 1
  assert.strictEqual(p.days[0].ideal, 100);
  assert.strictEqual(p.days[1].cumulative, 150);   // day 2
  assert.strictEqual(p.days[1].ideal, 200);
  assert.strictEqual(p.days[4].cumulative, 350);   // day 5 (today)
  assert.strictEqual(p.days[4].ideal, 500);
  assert.strictEqual(p.days[4].isToday, true);
  assert.strictEqual(p.todayIndex, 5);
  assert.strictEqual(p.spentToDate, 350);
  assert.strictEqual(p.idealToDate, 500);
});

test('paceSeries: days after today have a null cumulative (line stops at today)', () => {
  let s = seedCycle('2026-06-01', '2026-06-30', 3000);
  s = Store.addTransaction(s, tx('t1', '2026-06-01', 100));
  const p = Calc.paceSeries(s, 'c1', '2026-06-03');
  assert.strictEqual(p.days[2].cumulative, 100); // day 3 = today
  assert.strictEqual(p.days[3].cumulative, null); // day 4 = future
  assert.strictEqual(p.days[29].cumulative, null); // last day = future
  assert.strictEqual(p.days[29].ideal, 3000); // ideal still drawn to full budget
});

test('paceSeries: excluded-from-pace spends do not move the line', () => {
  let s = seedCycle('2026-06-01', '2026-06-30', 3000);
  s = Store.addTransaction(s, tx('t1', '2026-06-01', 100, 'a', { isExcludedFromPace: true }));
  s = Store.addTransaction(s, tx('t2', '2026-06-01', 40));
  const p = Calc.paceSeries(s, 'c1', '2026-06-01');
  assert.strictEqual(p.spentToDate, 40);
});

test('paceSeries: null for a missing cycle', () => {
  const s = seedCycle('2026-06-01', '2026-06-30', 3000);
  assert.strictEqual(Calc.paceSeries(s, 'nope', '2026-06-01'), null);
});

// ---------- categoryBreakdown ----------
test('categoryBreakdown: top-N wedges with the rest lumped into other', () => {
  let s = seedCycle('2026-06-01', '2026-06-30', 3000);
  s = Store.addTransaction(s, tx('t1', '2026-06-02', 300, 'a'));
  s = Store.addTransaction(s, tx('t2', '2026-06-02', 200, 'b'));
  s = Store.addTransaction(s, tx('t3', '2026-06-02', 100, 'c'));
  const b = Calc.categoryBreakdown(s, 'c1', 2);
  assert.strictEqual(b.slices.length, 2);
  assert.strictEqual(b.slices[0].categoryId, 'a');
  assert.strictEqual(b.slices[0].amount, 300);
  assert.strictEqual(b.slices[1].amount, 200);
  assert.strictEqual(b.otherAmount, 100);
  assert.strictEqual(b.otherCount, 1);
  assert.strictEqual(b.donutTotal, 600);
  assert.strictEqual(b.total, 600);
});

test('categoryBreakdown: net-negative (refund-heavy) categories are dropped from wedges', () => {
  let s = seedCycle('2026-06-01', '2026-06-30', 3000);
  s = Store.addTransaction(s, tx('t1', '2026-06-02', 300, 'a'));
  s = Store.addTransaction(s, tx('t2', '2026-06-02', 50, 'b', { isRefund: true })); // net -50 for b
  const b = Calc.categoryBreakdown(s, 'c1', 5);
  assert.strictEqual(b.slices.length, 1);       // only 'a' survives
  assert.strictEqual(b.slices[0].categoryId, 'a');
  assert.strictEqual(b.donutTotal, 300);        // wedges divide the positive sum
  assert.strictEqual(b.total, 250);             // signed cycle total (300 − 50)
});

// ---------- categoryTransactions ----------
test('categoryTransactions: only that category, this cycle, newest first, signed total', () => {
  let s = seedCycle('2026-06-01', '2026-06-30', 3000);
  s = Store.addTransaction(s, tx('t1', '2026-06-03', 100, 'a'));
  s = Store.addTransaction(s, tx('t2', '2026-06-10', 40, 'a', { isRefund: true }));
  s = Store.addTransaction(s, tx('t3', '2026-06-07', 25, 'a'));
  s = Store.addTransaction(s, tx('t4', '2026-06-08', 999, 'b')); // other category
  const r = Calc.categoryTransactions(s, 'a', 'c1');
  assert.strictEqual(r.count, 3);
  assert.deepStrictEqual(r.txns.map((t) => t.id), ['t2', 't3', 't1']); // date desc
  assert.strictEqual(r.total, 85); // 100 − 40 + 25
});

test('categoryTransactions: empty when the category has nothing this cycle', () => {
  const s = seedCycle('2026-06-01', '2026-06-30', 3000);
  const r = Calc.categoryTransactions(s, 'a', 'c1');
  assert.strictEqual(r.count, 0);
  assert.strictEqual(r.total, 0);
  assert.deepStrictEqual(r.txns, []);
});
