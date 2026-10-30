import assert from 'node:assert/strict';import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
import './apply-slim-contact-identity.mjs';
import './apply-slim-contact-identity-compat.mjs';
// No production migration or data repair runs from this build.
execFileSync(process.execPath,['--experimental-strip-types',fileURLToPath(new URL('./test-slim-contact-identity.mjs',import.meta.url))],{stdio:'inherit'});
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
assert(read('src/lib/saude-slim-leads-client.ts').includes('activities:unifiedHistory.activities'));
assert(read('src/lib/slim-contact-route.functions.ts').includes("db.from('whatsapp_groups').select('id').eq('workspace_id',workspaceId)"));
console.log('2/2 contact identity compatibility checks passed. No group or contact created.');
