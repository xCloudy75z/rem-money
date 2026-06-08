const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');

const Store = loadModule('store.js');
const Seed = loadModule('seed.js');
const Calc = loadModule('calc.js');
const Migrate = loadModule('migrate.js');
const Validate = loadModule('validate.js');

function mkOptions() {
  let i = 0;
  const idGen = (p) => p + '-' + (i++);
  return {
    now: '2026-05-30T00:00:00.000Z',
    idGen,
    defaultCategories: Seed.defaultCategories('2026-05-30T00:00:00.000Z', (p) => p + '-c' + (i++)),
    empty: Store.empty
  };
}

function seedFreshState() {
  let i = 0;
  const idGen = (p) => p + '-' + (i++);
  let s = Store.empty();
  const cats = Seed.defaultCategories('2026-05-25T00:00:00.000Z', idGen);
  s.categories = cats;
  const otherId = Object.values(cats).find(c => c.name === 'Other').id;
  const cycle = Seed.newCycle('2026-05-25', '2026-06-24', 12454.70, '2026-05-25T00:00:00.000Z', idGen);
  s = Store.addCycle(s, cycle);
  s = Store.updateSettings(s, { activeCycleId: cycle.id, lastUsedCategoryId: otherId });
  return { s, cycle, otherId, idGen };
}

test('integration: full happy path — onboard → add 5 → check hero → delete one → restore via undo', () => {
  let { s, cycle, otherId, idGen } = seedFreshState();
  const today = '2026-05-30';

  // Day-1 limit (cycle starts 25 May, today is 30 May — 26 days remaining including today)
  // Pre-spend before 30 May: 0; remaining = 12454.70; days remaining incl today = 26
  // limit = 12454.70 / 26 = 479.0269... → 479.03
  assert.strictEqual(Calc.todayLimit(s, today, cycle.id), 479.03);

  // Add 5 transactions today
  const ids = [];
  for (let k = 0; k < 5; k++) {
    const txn = {
      id: idGen('txn'), cycleId: cycle.id, categoryId: otherId,
      date: today, amount: 20, isRefund: false, isExcludedFromPace: false,
      note: 'lunch ' + k, createdAt: today + 'T1' + k + ':00:00.000Z', updatedAt: ''
    };
    ids.push(txn.id);
    s = Store.addTransaction(s, txn);
  }
  // 5 × 20 = 100 spent today
  assert.strictEqual(Calc.todaySpent(s, today, cycle.id), 100);
  // aedLeftToday = limit - spentToday = 479.03 - 100 = 379.03
  assert.strictEqual(Calc.aedLeftToday(s, today, cycle.id), 379.03);

  // Delete one transaction
  const deleted = s.transactions[ids[2]];
  s = Store.deleteTransaction(s, ids[2]);
  assert.strictEqual(Calc.todaySpent(s, today, cycle.id), 80);
  assert.strictEqual(Calc.aedLeftToday(s, today, cycle.id), 399.03);

  // Undo (re-add the deleted txn)
  s = Store.addTransaction(s, deleted);
  assert.strictEqual(Calc.todaySpent(s, today, cycle.id), 100);
  assert.strictEqual(Calc.aedLeftToday(s, today, cycle.id), 379.03);
});

test('integration: refund correctly subtracts from total', () => {
  let { s, cycle, otherId, idGen } = seedFreshState();
  const today = '2026-05-30';
  s = Store.addTransaction(s, {
    id: idGen('t'), cycleId: cycle.id, categoryId: otherId, date: today,
    amount: 100, isRefund: false, isExcludedFromPace: false, note: '', createdAt: '', updatedAt: ''
  });
  s = Store.addTransaction(s, {
    id: idGen('t'), cycleId: cycle.id, categoryId: otherId, date: today,
    amount: 30, isRefund: true, isExcludedFromPace: false, note: 'return', createdAt: '', updatedAt: ''
  });
  assert.strictEqual(Calc.cycleTotalSpent(s, cycle.id), 70);
});

test('integration: restore round-trip — export → migrate → validate → state matches', () => {
  let { s, cycle, otherId, idGen } = seedFreshState();
  s = Store.addTransaction(s, {
    id: idGen('t'), cycleId: cycle.id, categoryId: otherId, date: '2026-05-30',
    amount: 35.80, isRefund: false, isExcludedFromPace: false, note: 'Lunch', createdAt: '', updatedAt: ''
  });

  // Simulate JSON envelope export
  const envelope = { app: 'spending-tracker', schemaVersion: 1, exportedAt: '2026-05-30T00:00:00.000Z', state: s };
  const serialized = JSON.stringify(envelope);

  // Simulate import flow: parse → unwrap → migrate → validate
  const parsed = JSON.parse(serialized);
  const restoredState = parsed.state;
  const migrated = Migrate.migrate(restoredState, mkOptions());
  const v = Validate.validate(migrated);

  assert.strictEqual(v.ok, true, 'restored state must validate; errors: ' + JSON.stringify(v.errors));
  assert.deepStrictEqual(migrated.transactions, s.transactions);
  assert.deepStrictEqual(migrated.cycles, s.cycles);
});

test('integration: cycle rollover — archive old, start new, txns stay with old cycle', () => {
  let { s, cycle, otherId, idGen } = seedFreshState();
  const oldCycleId = cycle.id;

  // Add a txn in the old cycle
  s = Store.addTransaction(s, {
    id: idGen('t'), cycleId: oldCycleId, categoryId: otherId, date: '2026-06-10',
    amount: 50, isRefund: false, isExcludedFromPace: false, note: '', createdAt: '', updatedAt: ''
  });

  // Archive old cycle, add new cycle, switch active pointer
  s = Store.archiveCycle(s, oldCycleId, '2026-06-25T00:00:00.000Z');
  const newCycle = Seed.newCycle('2026-06-25', '2026-07-24', 13000, '2026-06-25T00:00:00.000Z', idGen);
  s = Store.addCycle(s, newCycle);
  s = Store.updateSettings(s, { activeCycleId: newCycle.id });

  // Old txn still belongs to old cycle
  const oldTxn = Object.values(s.transactions)[0];
  assert.strictEqual(oldTxn.cycleId, oldCycleId);
  assert.notStrictEqual(oldTxn.cycleId, newCycle.id);

  // New cycle's total = 0 (no txns yet)
  assert.strictEqual(Calc.cycleTotalSpent(s, newCycle.id), 0);
  // Old cycle's total = 50
  assert.strictEqual(Calc.cycleTotalSpent(s, oldCycleId), 50);

  // Old cycle is archived; new cycle is active
  assert.ok(s.cycles[oldCycleId].archivedAt);
  assert.strictEqual(s.cycles[newCycle.id].archivedAt, null);
  assert.strictEqual(s.settings.activeCycleId, newCycle.id);
});

test('integration: category delete blocked by transactions; reassign clears the block', () => {
  let { s, cycle, otherId, idGen } = seedFreshState();
  const foodId = Object.values(s.categories).find(c => c.name === 'Food').id;
  s = Store.addTransaction(s, {
    id: idGen('t'), cycleId: cycle.id, categoryId: foodId, date: '2026-05-30',
    amount: 20, isRefund: false, isExcludedFromPace: false, note: '', createdAt: '', updatedAt: ''
  });
  assert.throws(() => Store.deleteCategory(s, foodId), /reassign/);
  s = Store.reassignCategory(s, foodId, otherId);
  s = Store.deleteCategory(s, foodId);
  assert.strictEqual(s.categories[foodId], undefined);
  assert.strictEqual(Object.values(s.transactions)[0].categoryId, otherId);
});

test('integration: corrupt JSON falls back to empty + recovered flag', () => {
  const r = Store.parse('not json at all');
  assert.strictEqual(r.recovered, true);
  assert.strictEqual(r.state.schemaVersion, 1);
  assert.deepStrictEqual(r.state.transactions, {});
});

test('integration: v0 backup imports cleanly (the cutover path)', () => {
  const v0 = {
    startBudget: 12454.70,
    startDate: '2026-05-28',
    endDate: '2026-06-25',
    transactions: [
      { id: 'a', datetime: '2026-05-29T14:00:00.000Z', amount: 35, note: 'Lunch' },
      { id: 'b', datetime: '2026-05-29T19:00:00.000Z', amount: 120, note: 'Fuel' }
    ]
  };
  const v1 = Migrate.migrate(v0, mkOptions());
  const v = Validate.validate(v1);
  assert.strictEqual(v.ok, true, 'v0→v1 migration must validate; errors: ' + JSON.stringify(v.errors));
  assert.strictEqual(Object.keys(v1.transactions).length, 2);
  assert.strictEqual(v1.settings.salaryDay, 25);
});
