import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {slimSafeOperationalError,SLIM_ERROR_MAX_LENGTH} from '../src/lib/slim-operation-errors.core.ts';
const root=new URL('../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
let passed=0;function test(name,fn){fn();passed++;console.log('PASS slim error safety: '+name);}
test('error text never exceeds 512 characters',()=>{const v=slimSafeOperationalError('x'.repeat(1_050_000));assert(v.length<=SLIM_ERROR_MAX_LENGTH);assert(!v.includes('x'.repeat(200)));});
test('inline audio base64 omitted from error storage',()=>{const payload='data:audio/ogg; codecs=opus;base64,'+'QUJD'.repeat(25000);const s=slimSafeOperationalError(new Error('Evolution send failed: '+payload));assert(!s.includes('QUJDQUJD'));assert(s.includes('mídia base64 omitida'));assert(s.length<512);});
test('PDF base64 omitted from persisted error',()=>{const s=slimSafeOperationalError('Sending data:application/pdf;base64,'+'JVBERi0x'.repeat(10000));assert(!s.includes('JVBERi0xJVBERi0x'));assert(s.includes('mídia base64 omitida'));});
test('Bearer token is not stored in error',()=>{const s=slimSafeOperationalError('Access denied Bearer abcdefghijklmnopqrstuvwxyz0123456789');assert(!s.includes('abcdefghijklmnopqrstuvwxyz'));assert(s.includes('Bearer [omitido]'));});
test('API key metadata hidden from runtime logs',()=>{const s=slimSafeOperationalError('HTTP 401: apikey: nblGdZKUxxa77B77577Y');assert(!s.includes('nblGdZK'));assert(s.includes('apikey=[omitido]'));});
test('ordinary errors still explain the failure',()=>{assert.equal(slimSafeOperationalError(new Error('Workspace indisponível')),'Workspace indisponível');});
test('undefined error safe fallback',()=>{assert(slimSafeOperationalError(undefined).includes('Falha operacional'));});
test('long unprefixed base64 is truncated or masked',()=>{const s=slimSafeOperationalError('provider payload '+ 'a'.repeat(15000));assert(s.length<=512);assert(!s.includes('a'.repeat(512)));});
test('runtime error consumers now bound response before persisting',()=>{
 const r=read('src/lib/salesbot-runtime.server.ts');
 assert(r.includes('last_error: slimSafeOperationalError(e)'));
 assert(r.includes('log(supabaseAdmin, run, b, "error", slimSafeOperationalError(e))'));
 assert(!r.includes('last_error: (e as Error).message'));
 assert(!r.includes('last_error: e instanceof Error ? e.message : String(e)'));
});
test('Inbox job executor bounds errors',()=>{
 const r=read('src/lib/inbox-automation-worker.server.ts');
 assert(r.includes('last_error: slimSafeOperationalError(error)'));
 assert(!r.includes('last_error: error instanceof Error ? error.message'));
});
test('CRM automation jobs bound errors without discarding null',()=>{
 const r=read('src/lib/stage-automation-engine.server.ts');
 assert(r.includes('last_error: error == null ? null : slimSafeOperationalError(error)'));
});
test('new and existing modules parse in production build',()=>{
 for(const p of ['src/lib/slim-operation-errors.core.ts','src/lib/salesbot-runtime.server.ts','src/lib/inbox-automation-worker.server.ts','src/lib/stage-automation-engine.server.ts']){
  const ast=ts.createSourceFile(p,read(p),ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  assert.equal(ast.parseDiagnostics.length,0,p);
 }
});
test('patch is idempotent and does not touch source after build',()=>{
 const paths=['src/lib/salesbot-runtime.server.ts','src/lib/inbox-automation-worker.server.ts','src/lib/stage-automation-engine.server.ts'];
 const before=paths.map(read);
 execFileSync(process.execPath,[fileURLToPath(new URL('./apply-slim-error-log-bound.mjs',import.meta.url))],{stdio:'inherit'});
 assert.deepEqual(paths.map(read),before);
});
console.log(passed+'/'+passed+' bounded error tests passed. No provider, auth, real lead or production DB writes.');
