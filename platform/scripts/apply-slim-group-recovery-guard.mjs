import fs from 'node:fs';import ts from 'typescript';
const file=new URL('../src/lib/slim-group-prompt.core.ts',import.meta.url),mark='// SLIM_GROUP_RECOVERY_GUARD_V1';let code=fs.readFileSync(file,'utf8');
if(!code.includes(mark)){
 const once=(from,to)=>{if(code.split(from).length!==2)throw new Error('Group recovery guard anchor is not unique: '+from.slice(0,80));code=code.replace(from,()=>to);};
 once("import {z} from 'zod';","import {z} from 'zod';\nimport {recoverUnchangedGroupCreation} from './slim-group-recovery.core.ts';");
 once(".select('id,created_by,creation_payload,updated_at')",".select('*')");
 once("const recover=(row:any)=>{if(row.created_by!==actorId||stableGroupJson(row.creation_payload)!==stableGroupJson(payload))throw new Error('Esta tentativa já criou um agente com outra versão. Reabra o agente na lista antes de continuar.');return {id:String(row.id),updatedAt:String(row.updated_at),recovered:true};};","const recover=(row:any)=>recoverUnchangedGroupCreation(row,payload,actorId);");
 code+='\n'+mark+'\n';if(ts.createSourceFile('group.ts',code,ts.ScriptTarget.Latest,true).parseDiagnostics.length)throw new Error('Group recovery guard produced invalid syntax.');fs.writeFileSync(file,code);
}
// Keep the transpiled test beside its relative TS dependency. No assertion is changed or removed.
const testFile=new URL('./test-slim-group-prompt.mjs',import.meta.url);const before=fs.readFileSync(testFile,'utf8');
const old="new URL('./.slim-group-core-'+randomUUID()+'.mjs',import.meta.url)",next="new URL('../src/lib/.slim-group-core-'+randomUUID()+'.mjs',import.meta.url)";
if(before.includes(old)){if(before.split(old).length!==2)throw new Error('Test module location is ambiguous.');fs.writeFileSync(testFile,before.replace(old,next));}else if(!before.includes(next))throw new Error('Test module location is missing.');
