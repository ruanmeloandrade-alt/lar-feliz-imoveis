import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, sep } from 'node:path';

const dir = resolve(process.argv[2] || '/data');
const text = await readFile(join(dir, 'import/catalog.json'), 'utf8');
assert.doesNotMatch(text, /https?:\/\/|supabase|lovable|token=/i);
const seed = JSON.parse(text);
const unique = [...new Map(seed.files.map(file => [file.path, file])).values()];
let bytes = 0;
for (const file of unique) {
  const path = resolve(dir, file.disk);
  assert.ok(path.startsWith(dir + sep));
  assert.equal((await stat(path)).size, file.size);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  assert.equal(hash.digest('hex'), file.path.slice(0, 64));
  bytes += file.size;
}
console.log(JSON.stringify({ properties: seed.properties.length, leads: seed.leads.length, uniqueMedia: unique.length, hashesMatched: unique.length, bytes, externalReferences: 0 }));
