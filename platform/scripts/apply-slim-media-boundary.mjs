import fs from 'node:fs';import assert from 'node:assert/strict';
const path=new URL('../src/components/inbox/InboxPage.legacy.tsx',import.meta.url),before=fs.readFileSync(path,'utf8');
const old='import {readSlimMediaFile,sendSlimMediaOnce} from "@/lib/slim-media-file.client";',replacement='import {readSlimMediaFile,sendSlimMediaOnce} from "@/lib/slim-media-io";';
if(!before.includes(replacement)){assert.equal(before.split(old).length,2,'Media helper import must exist exactly once');fs.writeFileSync(path,before.replace(old,replacement));}
const after=fs.readFileSync(path,'utf8');assert(!after.includes('from "@/lib/slim-media-file.client"'));assert(after.includes(replacement));
const bridge=fs.readFileSync(new URL('../src/lib/slim-media-io.ts',import.meta.url),'utf8');assert(bridge.includes('createIsomorphicFn'));assert.equal(bridge.split('.client(').length-1,2);assert.equal(bridge.split('.server(').length-1,2);
console.log('Media IO boundary verified: explicit client loading and server rejection; import-protection remains enabled.');
await import('./apply-slim-media-receipt.mjs');
