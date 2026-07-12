const test = require('node:test');
const assert = require('node:assert');
const { loadModule } = require('./store.test.js');
const SmsParse = loadModule('smsParse.js');

const APPROVED = 'Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Approved. Avl. card bal is 97083.14. Trx Date: 12/07/26 17:35';
const DEBIT = 'Dear Customer, AED 250.00 was debited from your account *147. Your available account balance is AED 13730.38';
const DECLINED = 'Trx. of AED40.00 on your card ending *124 at QASR AL KHARAZ TAILORI, UAE is Declined. Trx Date: 12/07/26 17:36';

test('parses an approved card purchase', () => {
  const { rows } = SmsParse.parse(APPROVED);
  assert.strictEqual(rows.length, 1);
  const r = rows[0];
  assert.strictEqual(r.kind, 'purchase');
  assert.strictEqual(r.status, 'approved');
  assert.strictEqual(r.amount, 40);
  assert.strictEqual(r.note, 'QASR AL KHARAZ TAILORI');
  assert.strictEqual(r.dateISO, '2026-07-12');
  assert.strictEqual(r.timeHHMM, '17:35');
  assert.strictEqual(r.repeatOfIndex, null);
});

test('a declined line is recognized but not an addable purchase', () => {
  const { rows } = SmsParse.parse(DECLINED);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'purchase');
  assert.strictEqual(rows[0].status, 'not-approved');
});

test('parses an account debit with no shop/date', () => {
  const { rows } = SmsParse.parse(DEBIT);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].kind, 'debit');
  assert.strictEqual(rows[0].amount, 250);
  assert.strictEqual(rows[0].dateISO, null);
  assert.strictEqual(rows[0].timeHHMM, null);
});

test('handles AED with and without a space, and comma thousands', () => {
  const noSpace = SmsParse.parse('Trx. of AED1,250.00 on your card ending *1 at SHOP, UAE is Approved. Trx Date: 01/07/26 09:00').rows[0];
  assert.strictEqual(noSpace.amount, 1250);
  const spaced = SmsParse.parse(DEBIT).rows[0];
  assert.strictEqual(spaced.amount, 250);
});

test('keeps within-paste repeats (never drops) and marks the 2nd', () => {
  const { rows } = SmsParse.parse(APPROVED + '\n' + APPROVED);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].repeatOfIndex, null);
  assert.strictEqual(rows[1].repeatOfIndex, 0);
});

test('keeps two identical debits (no collapse)', () => {
  const { rows } = SmsParse.parse(DEBIT + '\n' + DEBIT);
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[1].repeatOfIndex, 0);
});

test('unrecognized non-blank lines are returned as raw text, not in rows', () => {
  const { rows, unrecognized } = SmsParse.parse('hello world\n\n' + APPROVED);
  assert.strictEqual(rows.length, 1);
  assert.deepStrictEqual(unrecognized, ['hello world']);
});

test('merchant name containing a comma still parses', () => {
  const r = SmsParse.parse('Trx. of AED10.00 on your card ending *1 at ALBAIK, DUBAI, UAE is Approved. Trx Date: 02/07/26 10:00').rows[0];
  assert.strictEqual(r.note, 'ALBAIK, DUBAI');
  assert.strictEqual(r.amount, 10);
});
