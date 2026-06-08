// scripts/dev.js — static server with auto-rebuild on src/ changes
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 5173;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.ico':  'image/x-icon'
};

function rebuild() {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'build.js')], { stdio: 'inherit' });
  if (r.status !== 0) console.error('Build failed');
}

rebuild();

const watchPaths = [path.join(ROOT, 'src'), path.join(ROOT, 'index.html')];
watchPaths.forEach(p => {
  try {
    fs.watch(p, { recursive: true }, () => {
      console.log('Change detected — rebuilding');
      rebuild();
    });
  } catch (e) {
    console.warn('Could not watch ' + p + ': ' + e.message);
  }
});

const server = http.createServer((req, res) => {
  let rel = req.url.split('?')[0];
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.join(ROOT, 'dist', rel);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
});
server.listen(PORT, () => console.log(`Dev server: http://localhost:${PORT}`));
