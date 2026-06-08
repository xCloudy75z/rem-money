// scripts/lint-pure.js — forbid time / randomness in pure modules
const fs = require('fs');
const path = require('path');

const PURE = ['calc.js', 'store.js', 'validate.js', 'migrate.js', 'seed.js', 'format.js'];
const FORBIDDEN = [/new\s+Date\s*\(/g, /Date\.now\s*\(/g, /Math\.random\s*\(/g, /crypto\.randomUUID\s*\(/g];

let failed = 0;
for (const file of PURE) {
  const p = path.join(__dirname, '..', 'src', file);
  if (!fs.existsSync(p)) continue;
  const src = fs.readFileSync(p, 'utf8');
  for (const re of FORBIDDEN) {
    re.lastIndex = 0;
    const m = src.match(re);
    if (m) {
      console.error(`FAIL ${file}: forbidden API '${m[0]}'`);
      failed++;
    }
  }
}
if (failed) { console.error(`\nLint failed: ${failed} violation(s)`); process.exit(1); }
console.log('OK Pure modules clean');
