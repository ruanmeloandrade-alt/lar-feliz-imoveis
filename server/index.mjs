import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

export function createAppServer(root = defaultRoot) {
  return createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    let path;
    try { path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (path === '/healthz') {
      const built = await stat(resolve(root, 'index.html')).catch(() => null);
      if (!built?.isFile()) { res.writeHead(503).end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', service: 'lar-feliz-imoveis' }));
      return;
    }
    if (path.split(/[\\/]/).some(part => part.startsWith('.')) || path.includes('\0')) {
      res.writeHead(404).end(); return;
    }
    if (/^\/(?:admin|login)(?:\/|$)/i.test(path)) {
      res.writeHead(404, { 'Cache-Control': 'no-store' }).end(); return;
    }
    // Only the build directory is public; SPA routes fall back to index.html.
    try {
      const base = await realpath(root);
      let file = resolve(base, '.' + path);
      if (!file.startsWith(base + sep) && file !== base) { res.writeHead(404).end(); return; }
      let info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        if (extname(path) || path.startsWith('/assets/') || path.startsWith('/api/')) {
          res.writeHead(404).end(); return;
        }
        file = resolve(base, 'index.html');
        info = await stat(file);
      }
      const actual = await realpath(file);
      if (!actual.startsWith(base + sep)) { res.writeHead(404).end(); return; }
      res.writeHead(200, {
        'Content-Type': types[extname(file)] || 'application/octet-stream',
        'Content-Length': info.size,
        'Cache-Control': path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      if (req.method === 'HEAD') res.end();
      else createReadStream(actual).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(503).end('Aplicacao indisponivel.'); }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8080);
  const server = createAppServer();
  server.listen(port, '0.0.0.0', () => console.log(`Lar Feliz Imoveis: http://localhost:${port}`));
  process.on('SIGTERM', () => server.close(() => process.exit(0)));
}
