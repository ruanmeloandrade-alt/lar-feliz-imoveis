import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { createDecipheriv, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';

// Works only from the existing encrypted local backup. No network access.
const [backup, destination] = process.argv.slice(2);
if (!backup || !destination) throw new Error('Informe backup local e destino privado fora do Git.');
const wrapped = await readFile(join(backup, 'key.current-user.dpapi'), 'utf8');
const script = "Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
const key = Buffer.from(await new Promise((resolve, reject) => {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true });
  let out = ''; child.stdout.on('data', chunk => out += chunk); child.on('error', reject);
  child.on('close', code => code === 0 ? resolve(out.trim()) : reject(new Error('Chave DPAPI indisponivel.'))); child.stdin.end(wrapped);
}), 'base64');
const decrypt = bytes => { const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0,12)); decipher.setAuthTag(bytes.subarray(12,28)); return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]); };
const snapshot = JSON.parse(decrypt(await readFile(join(backup,'snapshot.aes256gcm'))));
const manifest = JSON.parse(decrypt(await readFile(join(backup,'media-manifest.aes256gcm'))));
await mkdir(join(destination,'import','media'),{recursive:true});
const urls = new Map(), files = [];
for (const media of manifest) {
  const bytes = decrypt(await readFile(join(backup,'media',media.file)));
  if (bytes.length !== media.bytes || createHash('sha256').update(bytes).digest('hex') !== media.sha256) throw new Error('Midia divergente do backup.');
  const parsed = new URL(media.source);
  let extension = extname(parsed.pathname).toLowerCase();
  if (!['.jpg','.jpeg','.png','.webp','.pdf','.mp4','.webm','.mov','.gif'].includes(extension)) extension = media.contentType?.includes('pdf') ? '.pdf' : '.jpg';
  const name = `${media.sha256}${extension}`, disk = `import/media/${name}`;
  await writeFile(join(destination,disk),bytes,{mode:0o600});
  urls.set(media.source,`/api/files/public/${name}`);
  files.push({bucket:'public',path:name,disk,mime:media.contentType.split(';')[0],size:bytes.length});
}
const properties = snapshot.public_tables.properties.map(p => ({...p,created_by:null,created_at:new Date(p.created_at).toISOString(),updated_at:new Date(p.updated_at).toISOString(),images:p.images.map(url=>{if(!urls.has(url))throw new Error('Foto sem copia local.');return urls.get(url);}),pdfs:(p.pdfs??[]).map(url=>{if(!urls.has(url))throw new Error('PDF sem copia local.');return urls.get(url);}),plans:p.plans??[]}));
const leads = snapshot.public_tables.leads.map(l=>({...l,created_at:new Date(l.created_at).toISOString()}));
const seed = {properties,leads,files};
const json = JSON.stringify(seed);
if (/https?:\/\/|supabase|lovable|token=/i.test(json)) throw new Error('Referencia externa residual no pacote.');
await writeFile(join(destination,'import','catalog.json'),json,{mode:0o600});
console.log(JSON.stringify({properties:properties.length,leads:leads.length,media:files.length,bytes:files.reduce((sum,f)=>sum+f.size,0),externalReferences:0}));
