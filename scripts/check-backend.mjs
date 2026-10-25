import assert from 'node:assert/strict';
import { validateBackendConfig } from './backend-config.mjs';

process.loadEnvFile('.env.local');
const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
validateBackendConfig(url, key);
const headers = { apikey: key, ...(key.startsWith('eyJ') ? { Authorization: `Bearer ${key}` } : {}) };
for (const [name, path, privateRead] of [
  ['auth', '/auth/v1/settings', false],
  ['catalogo', '/rest/v1/properties?select=id&published=eq.true&limit=1', false],
  ['fichas protegidas', '/rest/v1/leads?select=id&limit=1', true],
]) {
  const response = await fetch(new URL(path, url), { headers, signal: AbortSignal.timeout(20000) });
  if (privateRead) {
    if (response.ok) assert.deepEqual(await response.json(), [], 'Leitura anonima de fichas deve permanecer bloqueada.');
    else assert.ok([401, 403].includes(response.status), 'Resposta inesperada ao conferir protecao das fichas.');
  } else assert.equal(response.status, 200, `Backend indisponivel: ${name}`);
  console.log(`Backend ${name}: OK (HTTP ${response.status}). Nenhum registro gravado.`);
}
