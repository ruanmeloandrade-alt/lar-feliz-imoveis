export function validateBackendConfig(url, key) {
  if (!url || !key) throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.');
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(endpoint.hostname)) {
    throw new Error('O backend de producao exige HTTPS.');
  }
  if (key.startsWith('sb_publishable_')) return;
  try {
    if (key.split('.').length === 3 && JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role === 'anon') return;
  } catch { /* Reject invalid or privileged credentials below. */ }
  throw new Error('Somente chave publica/anon pode ser usada no frontend.');
}
