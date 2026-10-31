import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from './index.mjs';
import { request } from 'node:http';

test('SPA routes, missing assets and private files have distinct responses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lar-feliz-'));
  await writeFile(join(root, 'index.html'), '<h1>Vanessa Simoni</h1>');
  await writeFile(join(root, '.env'), 'PRIVATE');
  const server = createAppServer(root);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/', '/admin', '/admin/produtos', '/admin/clientes', '/plataforma', '/plataforma/clientes', '/plataforma/propostas']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Vanessa Simoni/);
      const policy=response.headers.get('content-security-policy');
      assert.equal(policy.includes('https://connect.facebook.net'),route==='/');
      assert.equal(policy.includes('https://www.facebook.com'),route==='/');
      assert.doesNotMatch(policy,/unsafe-eval|script-src[^;]*unsafe-inline/);
    }
    for (const route of ['/.env', '/%2eenv', '/assets/missing.js', '/api/missing', '/login', '/login/']) {
      assert.equal((await fetch(base + route)).status, 404);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/admin', { method: 'HEAD' })).status, 200);
    assert.equal((await fetch(base + '/healthz')).status, 200);
  } finally {
    await new Promise(done => server.close(done));
    await rm(root, { recursive: true, force: true });
  }
});

test('the certified www host serves the site and apex redirects without losing the private path', async () => {
  const root = await mkdtemp(join(tmpdir(), 'vanessa-domain-'));
  await writeFile(join(root, 'index.html'), '<h1>Vanessa Simoni</h1>');
  const server = createAppServer(root, { fullPlatform: true });
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const read = (host, path) => new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: server.address().port, path, headers: { Host: host } }, res => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, location: res.headers.location, body }));
    });
    req.on('error', reject); req.end();
  });
  try {
    const redirected = await read('corretoravanessasimoni.com', '/admin?next=%2Fcrm%2Fprodutos');
    assert.equal(redirected.status, 308);
    assert.equal(redirected.location, 'https://www.corretoravanessasimoni.com/admin?next=%2Fcrm%2Fprodutos');
    const primary = await read('www.corretoravanessasimoni.com', '/');
    assert.equal(primary.status, 200);
    assert.equal(primary.location, undefined);
    assert.match(primary.body, /Vanessa Simoni/);
  } finally {
    await new Promise(done => server.close(done));
    await rm(root, { recursive: true, force: true });
  }
});
