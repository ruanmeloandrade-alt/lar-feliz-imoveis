import fs from 'node:fs';
import ts from 'typescript';
const root=new URL('../',import.meta.url),mark='// SLIM_ERROR_LOG_BOUND_V1',plans=[];
function patch(file,fn){
 const path=new URL(file,root);let text=fs.readFileSync(path,'utf8');
 if(text.includes(mark))return;
 const once=(from,to)=>{
  const n=text.split(from).length-1;if(n!==1)throw new Error('[Slim error bound] '+file+' anchor '+n+': '+from.slice(0,120));
  text=text.replace(from,()=>to);
 };
 const all=(from,to,expected)=>{
  const n=text.split(from).length-1;if(n!==expected)throw new Error('[Slim error bound] '+file+' count '+n+' expected '+expected);
  text=text.split(from).join(to);
 };
 fn({once,all,prepend:added=>{if(text.startsWith('// SLIM_')){const pos=text.indexOf('\n')+1;text=text.slice(0,pos)+added+'\n'+text.slice(pos);}else{text=added+'\n'+text;}}});
 const ast=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
 if(ast.parseDiagnostics.length)throw new Error('[Slim error bound] syntax '+file);
 plans.push([path,text+'\n'+mark+'\n']);
}
patch('src/lib/salesbot-runtime.server.ts',({once,all,prepend})=>{
 prepend('import { slimSafeOperationalError } from "./slim-operation-errors.core";');
 all('last_error: (e as Error).message','last_error: slimSafeOperationalError(e)',2);
 once('last_error: e instanceof Error ? e.message : String(e)','last_error: slimSafeOperationalError(e)');
 all('log(supabaseAdmin, run, b, "error", (e as Error).message)','log(supabaseAdmin, run, b, "error", slimSafeOperationalError(e))',4);
});
patch('src/lib/inbox-automation-worker.server.ts',({once,prepend})=>{
 prepend('import { slimSafeOperationalError } from "./slim-operation-errors.core";');
 once('last_error: error instanceof Error ? error.message : "Falha na execução do SalesBot."','last_error: slimSafeOperationalError(error)');
});
patch('src/lib/stage-automation-engine.server.ts',({once,prepend})=>{
 prepend('import { slimSafeOperationalError } from "./slim-operation-errors.core";');
 once('      last_error: error ?? null,','      last_error: error == null ? null : slimSafeOperationalError(error),');
});
for(const [path,source] of plans)fs.writeFileSync(path,source);
console.log('[Slim error bound] '+plans.length+' automation consumers updated. Existing failure records unchanged.');
