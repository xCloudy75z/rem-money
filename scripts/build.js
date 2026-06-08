// scripts/build.js — inlines src/*.js and src/styles/*.css into one dist/index.html
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC  = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');

const VERSION = '2.0.0';

function read(p) { return fs.readFileSync(p, 'utf8'); }
function write(p, c) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, c, 'utf8');
}

function inlineModules(html) {
  const start = html.indexOf('<!-- MODULES:START -->');
  const end   = html.indexOf('<!-- MODULES:END -->');
  if (start < 0 || end < 0) throw new Error('MODULES markers missing in index.html');
  const block = html.slice(start, end);
  const srcs = [...block.matchAll(/<script src="([^"]+)"><\/script>/g)].map(m => m[1]);
  const inlined = srcs.map(rel => {
    const code = read(path.join(ROOT, rel));
    return '<script>\n' + code.trim() + '\n</script>';
  }).join('\n');
  return html.slice(0, start) + '<!-- MODULES:INLINED -->\n' + inlined + '\n' + html.slice(end);
}

function inlineStyles(html) {
  const start = html.indexOf('<!-- STYLES:START -->');
  const end   = html.indexOf('<!-- STYLES:END -->');
  if (start < 0 || end < 0) return html;
  const block = html.slice(start, end);
  const hrefs = [...block.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map(m => m[1]);
  const inlined = hrefs.map(rel => '<style>\n' + read(path.join(ROOT, rel)).trim() + '\n</style>').join('\n');
  return html.slice(0, start) + '<!-- STYLES:INLINED -->\n' + inlined + '\n' + html.slice(end);
}

function injectVersion(html) {
  return html.replace(/__VERSION__/g, VERSION);
}

const indexPath = path.join(ROOT, 'index.html');
let html = read(indexPath);
html = inlineStyles(html);
html = inlineModules(html);
html = injectVersion(html);

const distIndex = path.join(DIST, 'index.html');
write(distIndex, html);

const swSrc = path.join(SRC, 'sw.js');
if (fs.existsSync(swSrc)) {
  const sw = read(swSrc).replace(/__VERSION__/g, VERSION);
  write(path.join(DIST, 'sw.js'), sw);
}

// Copy icon assets + manifest into dist
const ICONS_SRC = path.join(ROOT, 'icons');
if (fs.existsSync(ICONS_SRC)) {
  fs.mkdirSync(path.join(DIST, 'icons'), { recursive: true });
  for (const f of fs.readdirSync(ICONS_SRC)) {
    if (f === 'manifest.webmanifest') {
      // Manifest goes to dist root so href="manifest.webmanifest" resolves correctly
      fs.copyFileSync(path.join(ICONS_SRC, f), path.join(DIST, f));
    } else {
      fs.copyFileSync(path.join(ICONS_SRC, f), path.join(DIST, 'icons', f));
    }
  }
}

const bytes = fs.statSync(distIndex).size;
console.log(`OK Built dist/index.html (${(bytes / 1024).toFixed(1)} KB)`);
