import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const assets = await readdir('dist/assets');
for (const file of assets.filter(file => /\.(js|css)$/.test(file))) {
  const source = await readFile(join('dist/assets', file), 'utf8');
  assert.ok(!/(?:lovable\.(?:dev|app)|__l5e\/|gpt-engineer-file-uploads|sb_secret_[a-z0-9_-]{20,})/i.test(source), `Dependencia indevida em ${file}`);
  assert.doesNotMatch(source, /Painel Admin|Meus im\u00f3veis|Fichas de clientes|Calend\u00e1rio de leads/, `Painel antigo incluido em ${file}`);
}
for (const name of ['vanessa', 'condominio-bg', 'bandeira-sp']) {
  const original = name === 'bandeira-sp' ? `${name}.svg` : `${name}.jpg`;
  const file = assets.find(file => file.startsWith(`${name}-`));
  assert.ok(file, `Asset ausente: ${name}`);
  const hash = buffer => createHash('sha256').update(buffer).digest('hex');
  assert.equal(hash(await readFile(join('src/assets', original))), hash(await readFile(join('dist/assets', file))), `Imagem original alterada: ${name}`);
}
const html = await readFile('dist/index.html', 'utf8');
assert.match(html, /Vanessa Simoni/);
assert.match(html, /\/social-cover\.png/);
assert.doesNotMatch(html, /lovable\.(?:dev|app)|gpt-engineer-file-uploads/);
assert.ok((await readFile('dist/social-cover.png')).length > 0);
console.log('Build independente: imagens originais preservadas e sem endpoints/assets Lovable.');
