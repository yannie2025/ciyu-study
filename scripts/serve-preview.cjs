const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

require('./build-preview.cjs');

const root = path.join(__dirname, '..', 'preview');
const port = Number(process.env.PORT || 5173);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url || '/', `http://127.0.0.1:${port}`).pathname;
  const rel = urlPath === '/' ? '/index.html' : urlPath;
  const safePath = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const fullPath = path.join(root, safePath);

  if (!fullPath.startsWith(root) || !fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  const stat = fs.statSync(fullPath);
  const ext = path.extname(fullPath);
  res.writeHead(200, {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': stat.size,
  });
  fs.createReadStream(fullPath).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`词屿 UI 预览已启动: http://127.0.0.1:${port}/`);
});
