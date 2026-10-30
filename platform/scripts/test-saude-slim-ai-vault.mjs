import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Execute the real TypeScript source. Only resolve its extensionless local import;
// no production dependency or provider network request is needed for these tests.
const root = new URL('../', import.meta.url);
const temp = await mkdtemp(join(tmpdir(), 'slim-ai-vault-test-'));
const vaultUrl = new URL('src/lib/integration-vault.ts', root).href;
const originalSource = await readFile(new URL('src/lib/workspace-ai-key.server.ts', root), 'utf8');
assert.ok(originalSource.includes('"./integration-vault"'));
await writeFile(join(temp, 'package.json'), '{"type":"module"}');
await writeFile(join(temp, 'resolver.ts'), originalSource.replace('"./integration-vault"', JSON.stringify(vaultUrl)));
const { resolveWorkspaceAiKey } = await import(pathToFileURL(join(temp, 'resolver.ts')).href);
const { integrationVaultFailure, INTEGRATION_VAULT_UNAVAILABLE_MESSAGE } = await import(vaultUrl);
const workspaceId = 'd16bc364-a874-4a69-8f0f-bbc8cf41e3f6';
const envNames = ['INTEGRATION_ENCRYPTION_KEY', 'LOVABLE_API_KEY', 'INTERNAL_AI_WORKSPACE_ID'];
const originalEnv = Object.fromEntries(envNames.map((name) => [name, process.env[name]]));
const originalError = console.error;
const logs = [];
console.error = (...args) => logs.push(args);
let passed = 0;
function fake(responses) {
  const calls = [];
  return {
    calls,
    from() { throw new Error('Unexpected table or inherited-account lookup'); },
    async rpc(name, args) {
      calls.push({ name, args });
      const next = responses[calls.length - 1];
      if (next instanceof Error) throw next;
      assert.ok(next, 'Unexpected credential request');
      return next;
    },
  };
}
async function check(name, run) {
  await run();
  passed++;
  console.log(`PASS ${name}`);
}
try {
  process.env.INTEGRATION_ENCRYPTION_KEY = 'test-only-encryption-key';
  await check('OpenAI uses only this workspace and trims the stored key', async () => {
    const sb = fake([{ data: { api_key: ' test-openai-key ' }, error: null }]);
    const result = await resolveWorkspaceAiKey(sb, workspaceId);
    assert.equal(result.provider, 'openai');
    assert.equal(result.apiKey, 'test-openai-key');
    assert.equal(sb.calls.length, 1);
    assert.deepEqual(sb.calls[0], { name: 'get_integration_secret', args: {
      _workspace_id: workspaceId, _provider: 'openai', _key: 'test-only-encryption-key',
    } });
  });
  await check('Gemini is allowed only after a successful absent OpenAI result', async () => {
    const sb = fake([{ data: null, error: null }, { data: { api_key: 'test-gemini-key' }, error: null }]);
    assert.equal((await resolveWorkspaceAiKey(sb, workspaceId)).provider, 'gemini');
    assert.deepEqual(sb.calls.map((call) => call.args._provider), ['openai', 'gemini']);
    assert.ok(sb.calls.every((call) => call.args._workspace_id === workspaceId));
  });
  await check('Missing RPC is a vault failure and never a provider fallback', async () => {
    const sb = fake([{ data: null, error: { code: 'PGRST202', message: 'test-secret-must-not-be-logged' } }]);
    await assert.rejects(resolveWorkspaceAiKey(sb, workspaceId), { message: INTEGRATION_VAULT_UNAVAILABLE_MESSAGE });
    assert.equal(sb.calls.length, 1);
  });
  await check('Decryption and authorization errors are not hidden', async () => {
    for (const code of ['22023', '42501']) {
      const sb = fake([{ data: null, error: { code } }]);
      await assert.rejects(resolveWorkspaceAiKey(sb, workspaceId), { message: INTEGRATION_VAULT_UNAVAILABLE_MESSAGE });
      assert.equal(sb.calls.length, 1);
    }
  });
  await check('Transport exception is sanitized and stops resolution', async () => {
    const sb = fake([new Error('test-secret-must-not-be-logged')]);
    await assert.rejects(resolveWorkspaceAiKey(sb, workspaceId), { message: INTEGRATION_VAULT_UNAVAILABLE_MESSAGE });
    assert.equal(sb.calls.length, 1);
  });
  await check('Incomplete stored credential is explicit and not silently replaced', async () => {
    const sb = fake([{ data: { api_key: '   ' }, error: null }]);
    await assert.rejects(resolveWorkspaceAiKey(sb, workspaceId), /credencial OpenAI salva está incompleta/);
    assert.equal(sb.calls.length, 1);
  });
  await check('No credentials never borrows an inherited account key', async () => {
    process.env.LOVABLE_API_KEY = 'test-forbidden-inherited-key';
    process.env.INTERNAL_AI_WORKSPACE_ID = workspaceId;
    const sb = fake([{ data: null, error: null }, { data: null, error: null }]);
    await assert.rejects(resolveWorkspaceAiKey(sb, workspaceId), /IA não conectada neste workspace/);
    assert.equal(sb.calls.length, 2);
  });
  await check('Missing encryption configuration fails before a database request', async () => {
    delete process.env.INTEGRATION_ENCRYPTION_KEY;
    const sb = fake([]);
    await assert.rejects(resolveWorkspaceAiKey(sb, workspaceId), { message: INTEGRATION_VAULT_UNAVAILABLE_MESSAGE });
    assert.equal(sb.calls.length, 0);
  });
  await check('Diagnostics contain no supplied plaintext or raw exception', async () => {
    integrationVaultFailure('test', { code: 'PGRST202', api_key: 'test-secret-must-not-be-logged' });
    integrationVaultFailure('test', 'test-secret-must-not-be-logged');
    assert.ok(!JSON.stringify(logs).includes('test-secret-must-not-be-logged'));
    assert.ok(!JSON.stringify(logs).includes('test-only-encryption-key'));
    assert.ok(INTEGRATION_VAULT_UNAVAILABLE_MESSAGE.includes('Saúde Slim'));
    assert.ok(!INTEGRATION_VAULT_UNAVAILABLE_MESSAGE.includes('MKTOn'));
  });
  console.log(`${passed}/${passed} IA vault regression checks passed.`);
} finally {
  console.error = originalError;
  await rm(temp, { recursive: true, force: true });
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}
