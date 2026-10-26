import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAppServer } from './index.mjs';
import { validateBackendConfig } from '../scripts/backend-config.mjs';

test('frontend configuration rejects secret and service-role credentials', () => {
  assert.doesNotThrow(() => validateBackendConfig('https://example.supabase.co', 'sb_publishable_example'));
  assert.throws(() => validateBackendConfig(undefined, undefined));
  assert.throws(() => validateBackendConfig('http://example.supabase.co', 'sb_publishable_example'));
  assert.throws(() => validateBackendConfig('https://example.supabase.co', 'sb_secret_example'));
  const privileged = `header.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.signature`;
  assert.throws(() => validateBackendConfig('https://example.supabase.co', privileged));
});

test('SPA routes, missing assets and private files have distinct responses', async () => {
  const root = await mkdtemp(join(tmpdir(), 'lar-feliz-'));
  await writeFile(join(root, 'index.html'), '<h1>Vanessa Simoni</h1>');
  await writeFile(join(root, '.env'), 'PRIVATE');
  const server = createAppServer(root);
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const route of ['/']) {
      const response = await fetch(base + route);
      assert.equal(response.status, 200);
      assert.match(await response.text(), /Vanessa Simoni/);
    }
    for (const route of ['/.env', '/%2eenv', '/assets/missing.js', '/api/missing', '/login', '/login/', '/admin', '/admin/imoveis', '/%61dmin', '/ADMIN']) {
      assert.equal((await fetch(base + route)).status, 404);
    }
    assert.equal((await fetch(base, { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/admin', { method: 'HEAD' })).status, 404);
    assert.equal((await fetch(base + '/healthz')).status, 200);
  } finally {
    await new Promise(done => server.close(done));
    await rm(root, { recursive: true, force: true });
  }
});
