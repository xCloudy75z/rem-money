const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadModule } = require('./store.test.js');

const Migrate = loadModule('migrate.js');
const Store   = loadModule('store.js');
const Seed    = loadModule('seed.js');

function mkOptions() {
  let i = 0;
  const idGen = (p) => p + '-' + (i++);
  return {
    now: '2026-05-30T00:00:00.000Z',
    idGen: idGen,
    defaultCategories: Seed.defaultCategories('2026-05-30T00:00:00.000Z', (p) => p + '-z' + (i++)),
    empty: Store.empty
  };
}

test('Migrate identifies a v0 blob', () => {
  assert.strictEqual(Migrate.isV0({ startBudget: 12000, startDate: '2026-05-28', transactions: [] }), true);
  assert.strictEqual(Migrate.isV0({ schemaVersion: 1 }), false);
  assert.strictEqual(Migrate.isV0(null), false);
});

test('Migrate v0 → v1: creates a cycle, seeds categories, bucket=Other', () => {
  const v0 = {
    startBudget: 12454.70,
    startDate: '2026-05-28',
    endDate: '2026-06-25',
    transactions: [
      { id: 'old1', datetime: '2026-05-29T14:00:00.000Z', amount: 35, note: 'Lunch' }
    ]
  };
  const v1 = Migrate.migrate(v0, mkOptions());
  assert.strictEqual(v1.schemaVersion, 1);
  assert.strictEqual(Object.keys(v1.cycles).length, 1);
  assert.strictEqual(Object.keys(v1.transactions).length, 1);
  const txn = Object.values(v1.transactions)[0];
  assert.strictEqual(txn.amount, 35);
  assert.strictEqual(txn.note, 'Lunch');
  assert.strictEqual(txn.date, '2026-05-29');
  const cat = v1.categories[txn.categoryId];
  assert.strictEqual(cat.name, 'Other');
});

test('Migrate v1 with missing fields backfills', () => {
  const partial = { schemaVersion: 1, settings: { currency: 'AED' } };
  const m = Migrate.migrate(partial, mkOptions());
  assert.strictEqual(m.settings.salaryDay, 25);
  assert.strictEqual(m.settings.theme, 'system');
  assert.deepStrictEqual(m.categories, {});
});

// Deterministic stub standing in for app.js's localizeISO (which uses Date).
// Marks the value so we can assert it was applied exactly once.
function mkOptionsWithLocalize() {
  const o = mkOptions();
  o.localizeISO = (iso) => 'LOCAL:' + iso;
  return o;
}

test('Migrate localizes transaction timestamps once and sets the flag', () => {
  const v1 = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, activeCycleId: 'c1' },
    categories: {},
    cycles: {},
    transactions: {
      t1: { id: 't1', cycleId: 'c1', categoryId: 'x', date: '2026-05-30', amount: 10,
            createdAt: '2026-05-30T10:00:00.000Z', updatedAt: '2026-05-30T10:00:00.000Z' }
    }
  };
  const m = Migrate.migrate(v1, mkOptionsWithLocalize());
  assert.strictEqual(m.transactions.t1.createdAt, 'LOCAL:2026-05-30T10:00:00.000Z');
  assert.strictEqual(m.transactions.t1.updatedAt, 'LOCAL:2026-05-30T10:00:00.000Z');
  assert.strictEqual(m.settings.localTimestamps, true);
});

test('Migrate does NOT re-localize when the flag is already set (no double-shift)', () => {
  const already = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {}, cycles: {},
    transactions: {
      t1: { id: 't1', cycleId: 'c1', categoryId: 'x', date: '2026-05-30', amount: 10,
            createdAt: '2026-05-30T14:00:00.000Z', updatedAt: '2026-05-30T14:00:00.000Z' }
    }
  };
  const m = Migrate.migrate(already, mkOptionsWithLocalize());
  assert.strictEqual(m.transactions.t1.createdAt, '2026-05-30T14:00:00.000Z');
  assert.strictEqual(m.transactions.t1.updatedAt, '2026-05-30T14:00:00.000Z');
});

test('Migrate skips localization entirely when no localizeISO is provided', () => {
  const v1 = {
    schemaVersion: 1, settings: { currency: 'AED', salaryDay: 25 }, categories: {}, cycles: {},
    transactions: { t1: { id: 't1', createdAt: '2026-05-30T10:00:00.000Z', updatedAt: '' } }
  };
  const m = Migrate.migrate(v1, mkOptions());
  assert.strictEqual(m.transactions.t1.createdAt, '2026-05-30T10:00:00.000Z');
  assert.strictEqual(m.settings.localTimestamps, undefined);
});

test('Migrate of the real v0 fixture round-trips without throwing', () => {
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'v0-existing-app.json'), 'utf8'));
  const v0 = fixture.state || fixture;
  const v1 = Migrate.migrate(v0, mkOptions());
  assert.strictEqual(v1.schemaVersion, 1);
  assert.ok(v1.settings.activeCycleId);
  assert.strictEqual(Object.keys(v1.transactions).length, 3);
  // Arabic note round-trips
  const arabicTxn = Object.values(v1.transactions).find(t => t.note === 'قهوة');
  assert.ok(arabicTxn, 'Arabic note preserved');
});

test('migrate initializes wifePayments when absent', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {}, cycles: {}, transactions: {}
  };
  const out = Migrate.migrate(input, { now: '2026-06-12T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.deepStrictEqual(out.wifePayments, {});
});

test('migrate preserves existing wifePayments', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {}, cycles: {}, transactions: {},
    wifePayments: { wp1: { id: 'wp1', amount: 100, date: '2026-06-10', note: '', createdAt: '' } }
  };
  const out = Migrate.migrate(input, { now: '2026-06-12T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.strictEqual(out.wifePayments.wp1.amount, 100);
});

test('migrate backfills byWife:false on legacy transactions', () => {
  const input = {
    schemaVersion: 1,
    settings: { currency: 'AED', salaryDay: 25, localTimestamps: true },
    categories: {}, cycles: {},
    transactions: { t1: { id: 't1', date: '2026-06-01', amount: 50, categoryId: 'c', cycleId: 'cy' } }
  };
  const out = Migrate.migrate(input, { now: '2026-06-12T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty });
  assert.strictEqual(out.transactions.t1.byWife, false);
});

test('migrate back-fills budget/budgetPeriod on categories', () => {
  const opts = {
    now: '2026-01-01T00:00:00.000Z',
    idGen: (p) => p + '-1',
    empty: Store.empty,
    get defaultCategories() { return {}; }
  };
  const state = {
    schemaVersion: 1,
    settings: { salaryDay: 25, currency: 'AED' },
    categories: { a: { id: 'a', name: 'A' } },
    cycles: {}, transactions: {}
  };
  const out = Migrate.migrate(state, opts);
  assert.strictEqual(out.categories.a.budget, 0);
  assert.strictEqual(out.categories.a.budgetPeriod, 'monthly');
});

test('migrate does not overwrite an existing category budget', () => {
  const opts = { now: '2026-01-01T00:00:00.000Z', idGen: (p) => p + '-1', empty: Store.empty, get defaultCategories() { return {}; } };
  const state = {
    schemaVersion: 1,
    settings: { salaryDay: 25, currency: 'AED' },
    categories: { a: { id: 'a', name: 'A', budget: 2000, budgetPeriod: 'yearly' } },
    cycles: {}, transactions: {}
  };
  const out = Migrate.migrate(state, opts);
  assert.strictEqual(out.categories.a.budget, 2000);
  assert.strictEqual(out.categories.a.budgetPeriod, 'yearly');
});
