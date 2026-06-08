const test = require('node:test');
const assert = require('node:assert');

test('node --test runs and assertions work', () => {
  assert.strictEqual(1 + 1, 2);
});

test('build script exists', () => {
  const fs = require('fs');
  const path = require('path');
  const p = path.join(__dirname, '..', 'scripts', 'build.js');
  assert.ok(fs.existsSync(p));
});
