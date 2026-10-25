import { spawnSync } from 'node:child_process';
import { validateBackendConfig } from './backend-config.mjs';

process.loadEnvFile('.env.local');
const executable = process.env.RAILWAY_CLI || 'railway';
const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'];
validateBackendConfig(process.env[names[0]], process.env[names[1]]);
const values = names.map(name => {
  const value = process.env[name];
  if (!value) throw new Error(`Configuracao ausente: ${name}`);
  return `${name}=${value}`;
});
const result = spawnSync(executable, ['variable', 'set', ...values, '--service', 'lar-feliz-web', '--skip-deploys', '--json'], { encoding: 'utf8' });
if (result.status !== 0) throw new Error('Falha ao configurar variaveis no Railway. Valores omitidos.');
console.log(`Railway configurado: ${names.join(', ')}. Valores nao exibidos.`);
