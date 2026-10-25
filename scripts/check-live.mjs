import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'https:');
const get = path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000), cache: 'no-store' });
let html;
for (const path of ['/', '/login', '/admin', '/healthz']) {
  const response = await get(path);
  assert.equal(response.status, 200, `Rota indisponivel: ${path}`);
  if (path === '/') html = await response.text();
  console.log(`HTTPS ${path}: 200`);
}
const dom = new JSDOM(html);
const doc = dom.window.document;
assert.match(doc.title, /Vanessa Simoni/);
const script = doc.querySelector('script[type="module"][src]')?.getAttribute('src');
assert.ok(script, 'Bundle nao referenciado.');
const bundleResponse = await get(script);
assert.equal(bundleResponse.status, 200);
const bundle = await bundleResponse.text();
assert.ok(!/lovable\.(dev|app)|__l5e\/|gpt-engineer-file-uploads/i.test(bundle), 'Bundle depende da Lovable.');
const assets = [...new Set(bundle.match(/\/assets\/[a-zA-Z0-9_.-]+\.(?:jpg|svg)/g) ?? [])];
for (const name of ['vanessa-', 'condominio-bg-', 'bandeira-sp-']) {
  const asset = assets.find(asset => asset.includes(name));
  assert.ok(asset, `Imagem ausente: ${name}`);
  const response = await get(asset);
  assert.equal(response.status, 200, `Imagem indisponivel: ${name}`);
  const contentType = response.headers.get('content-type');
  assert.ok(contentType?.startsWith('image/'), `Resposta nao e uma imagem: ${name}`);
  assert.ok((await response.arrayBuffer()).byteLength > 100);
}
for (const path of ['/.env', '/assets/missing.js']) assert.equal((await get(path)).status, 404);
dom.window.close();
console.log('Publicacao HTTPS, rotas e imagens originais verificadas sem navegador.');
