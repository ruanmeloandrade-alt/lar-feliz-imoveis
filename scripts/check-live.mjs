import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'https:');
const get = path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000), cache: 'no-store' });
let html;
for (const path of ['/', '/healthz', '/admin', '/admin/produtos', '/admin/clientes', '/plataforma', '/plataforma/clientes', '/plataforma/negociacoes', '/plataforma/imoveis', '/plataforma/agenda', '/plataforma/propostas', '/plataforma/automacoes']) {
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
const platformChunk = bundle.match(/(?:\.\/|\/assets\/)(Platform-[a-zA-Z0-9_-]+\.js)/)?.[1];
assert.ok(platformChunk, 'Modulo da plataforma nao referenciado pelo aplicativo.');
const platformResponse = await get(`/assets/${platformChunk}`);
assert.equal(platformResponse.status, 200, 'Modulo da plataforma indisponivel.');
assert.match(await platformResponse.text(), /vanessa_proposals/);
assert.doesNotMatch(bundle, /Painel Admin|Meus im\u00f3veis|Fichas de clientes|Calend\u00e1rio de leads/, 'Painel antigo ainda incluido na publicacao.');
assert.ok(!/lovable\.(dev|app)|supabase|VITE_SUPABASE|__l5e\/|gpt-engineer-file-uploads/i.test(bundle), 'Bundle contem dependencia externa bloqueada.');
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
for (const path of ['/.env', '/assets/missing.js', '/login']) {
  assert.equal((await get(path)).status, 404, `Rota retirada ainda acessivel: ${path}`);
  console.log(`HTTPS ${path}: 404`);
}
dom.window.close();
console.log('Publicacao HTTPS, rotas e imagens originais verificadas sem navegador.');
