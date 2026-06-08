const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');

const Store = loadModule('store.js');
const Calc = loadModule('calc.js');

function buildState(txnCount) {
  let s = Store.empty();
  s = Store.addCategory(s, { id: 'cat-x', name: 'X', icon: '•', color: '#999', order: 0, isArchived: false, createdAt: '' });
  s = Store.addCycle(s, { id: 'c1', startDate: '2026-01-01', endDate: '2026-12-31', startBudget: 100000, archivedAt: null, createdAt: '' });
  s = Store.updateSettings(s, { activeCycleId: 'c1', lastUsedCategoryId: 'cat-x' });
  // Distribute txns across the 365-day cycle
  for (let i = 0; i < txnCount; i++) {
    const dayOfYear = (i % 365) + 1;
    const m = Math.floor((dayOfYear - 1) / 31) + 1;
    const d = ((dayOfYear - 1) % 31) + 1;
    s = Store.addTransaction(s, {
      id: 't' + i, cycleId: 'c1', categoryId: 'cat-x',
      date: '2026-' + String(Math.min(12, m)).padStart(2, '0') + '-' + String(Math.min(28, d)).padStart(2, '0'),
      amount: 10 + (i % 50), isRefund: false, isExcludedFromPace: false,
      note: '', createdAt: '', updatedAt: ''
    });
  }
  return s;
}

function timeIt(label, fn) {
  const t0 = process.hrtime.bigint();
  const result = fn();
  const elapsedMs = Number(process.hrtime.bigint() - t0) / 1e6;
  return { elapsedMs, result };
}

test('perf: cycleSummary on 5000 txns under 100ms', () => {
  const s = buildState(5000);
  const { elapsedMs } = timeIt('cycleSummary-5000', () => Calc.cycleSummary(s, 'c1'));
  assert.ok(elapsedMs < 100, 'cycleSummary 5000 txns took ' + elapsedMs.toFixed(1) + 'ms; budget is 100ms');
});

test('perf: historicalLimitsByDay on 5000 txns under 100ms', () => {
  const s = buildState(5000);
  const { elapsedMs } = timeIt('historical-5000', () => Calc.historicalLimitsByDay(s, 'c1'));
  assert.ok(elapsedMs < 100, 'historicalLimitsByDay 5000 txns took ' + elapsedMs.toFixed(1) + 'ms; budget is 100ms');
});

test('perf: historicalLimitsByDay scales sub-quadratically (10× input → ≤ 15× time)', () => {
  const sSmall = buildState(500);
  const sLarge = buildState(5000);
  const small = timeIt('h-500', () => Calc.historicalLimitsByDay(sSmall, 'c1'));
  const large = timeIt('h-5000', () => Calc.historicalLimitsByDay(sLarge, 'c1'));
  // Allow some noise floor; only assert ratio when small is non-trivial
  if (small.elapsedMs > 1) {
    const ratio = large.elapsedMs / small.elapsedMs;
    assert.ok(ratio <= 15, 'historicalLimitsByDay ratio 10× input → ' + ratio.toFixed(1) + '× time; budget ≤15×');
  }
});

test('perf: clone(state) on 5000 txns under 50ms', () => {
  const s = buildState(5000);
  const { elapsedMs } = timeIt('clone-5000', () => Store.clone(s));
  assert.ok(elapsedMs < 50, 'clone 5000 txns took ' + elapsedMs.toFixed(1) + 'ms; budget is 50ms');
});
