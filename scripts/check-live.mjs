import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const origin = new URL(process.argv[2]);
assert.equal(origin.protocol, 'https:');
const get = path => fetch(new URL(path, origin), { signal: AbortSignal.timeout(20000), cache: 'no-store' });
let html;
for (const path of ['/', '/healthz', '/admin', '/painel', '/crm/produtos', '/crm/funis-de-venda', '/crm/automacoes', '/crm/agente-ia', '/inbox/leads']) {
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
const adminHtml = await (await get('/admin')).text();
assert.match(adminHtml,/Vanessa Simoni/);
assert.match(adminHtml,/\/system-assets\/assets\//);
const nativeScript=adminHtml.match(/src="(\/system-assets\/assets\/[^" ]+\.js)"/);
assert.ok(nativeScript,'Bundle completo não referenciado.');
assert.equal((await get(nativeScript[1])).status,200);
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
