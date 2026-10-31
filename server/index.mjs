import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.mjs';
import { createApi } from './api.mjs';
import { createFullPlatform,startFullPlatform } from './full-platform.mjs';
import { reconcileLegacyLeads } from './reconcile-legacy-leads.mjs';

const defaultRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8' };

export function createAppServer(root = defaultRoot, options = {}) {
  const api = options.store ? createApi(options.store, options) : null;
  const fullPlatform=options.fullPlatform?createFullPlatform():null;
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const metaScripts = url.pathname === '/' ? ' https://connect.facebook.net' : '';
    const metaEvents = url.pathname === '/' ? ' https://www.facebook.com' : '';
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'${metaScripts}; connect-src 'self'${metaScripts}${metaEvents}; img-src 'self' data: blob:${metaEvents}; media-src 'self' blob:; frame-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`);
    if(fullPlatform&&await fullPlatform(req,res,url))return;
    if (api && await api(req, res, url)) return;
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
      res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', service: 'lar-feliz-imoveis', backend: options.store ? 'independent' : 'static' }));
      return;
    }
    if (path.split(/[\\/]/).some(part => part.startsWith('.')) || path.includes('\0')) {
      res.writeHead(404).end(); return;
    }
    if (/^\/login(?:\/|$)/i.test(path)) {
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
  if (process.env.RAILWAY_PROJECT_ID && process.env.RAILWAY_VOLUME_MOUNT_PATH !== '/data') throw new Error('Volume persistente /data obrigatorio. Publicacao interrompida para proteger os dados.');
  const store = new Store(process.env.RAILWAY_VOLUME_MOUNT_PATH || process.env.VANESSA_DATA_DIR || resolve('.local-data'));
  const fullPlatform=process.env.VANESSA_FULL_PLATFORM==='1';
  if(fullPlatform)console.log('Vanessa cutover:',await reconcileLegacyLeads(store));
  const child=fullPlatform?startFullPlatform():null;
  child?.on('exit',()=>process.exit(1));
  const server = createAppServer(defaultRoot, { store, fullPlatform, bootstrapToken: process.env.BOOTSTRAP_TOKEN || '' });
  server.listen(port, '0.0.0.0', () => console.log(`Lar Feliz Imoveis: http://localhost:${port}`));
  process.on('SIGTERM', () => server.close(() => { child?.kill('SIGTERM'); store.close(); process.exit(0); }));
}
