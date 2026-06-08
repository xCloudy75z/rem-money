const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');
const Seed = loadModule('seed.js');

test('Seed.defaultCategories returns 5 seeded categories', () => {
  let i = 0;
  const idGen = (prefix) => prefix + '-' + (i++);
  const cats = Seed.defaultCategories('2026-05-30T00:00:00.000Z', idGen);
  const names = Object.values(cats).map(c => c.name).sort();
  assert.deepStrictEqual(names, ['Bills', 'Food', 'Fun', 'Other', 'Transport']);
  Object.values(cats).forEach(c => {
    assert.ok(c.id); assert.ok(c.icon); assert.ok(c.color);
    assert.strictEqual(c.isArchived, false);
    assert.strictEqual(c.createdAt, '2026-05-30T00:00:00.000Z');
  });
});

test('Seed.newCycle produces a valid cycle', () => {
  const c = Seed.newCycle('2026-05-25', '2026-06-24', 12454.70, '2026-05-25T00:00:00.000Z', (p) => p + '-x');
  assert.strictEqual(c.startDate, '2026-05-25');
  assert.strictEqual(c.endDate, '2026-06-24');
  assert.strictEqual(c.startBudget, 12454.70);
  assert.strictEqual(c.archivedAt, null);
});
