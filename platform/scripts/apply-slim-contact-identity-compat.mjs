import fs from 'node:fs';import ts from 'typescript';
const root=new URL('../',import.meta.url),mark='// SLIM_CONTACT_IDENTITY_COMPAT_V1';
const plans=[];
function edit(path,run){let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(mark))return;const once=(a,b)=>{if(code.split(a).length!==2)throw new Error('Missing identity compatibility anchor: '+path+' '+a);code=code.replace(a,()=>b);};run(once);const source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);if(source.parseDiagnostics.length)throw new Error('Invalid identity compatibility syntax: '+path);plans.push([path,code+'\n'+mark+'\n']);}
edit('src/lib/slim-contact-route.functions.ts',once=>{
 once("return {workspaceId,actorId:context.userId,leadId:await resolveSlimContactId(db,workspaceId,data.leadId)};",`const existing=await db.from('leads').select('id').eq('workspace_id',workspaceId).eq('id',data.leadId).maybeSingle();
 if(existing.error)throw new Error('Não foi possível consultar o contato.');
 if(!existing.data){const group=await db.from('whatsapp_groups').select('id').eq('workspace_id',workspaceId).eq('id',data.leadId).maybeSingle();if(!group.error&&group.data)return {workspaceId,actorId:context.userId,leadId:data.leadId};throw new Error('Conversa não encontrada nesta empresa.');}
 return {workspaceId,actorId:context.userId,leadId:await resolveSlimContactId(db,workspaceId,data.leadId)};`);
});
edit('src/lib/saude-slim-leads-client.ts',once=>{
 once('import {loadContactIdentityIndex,resolveSlimContactId} from "./slim-contact-identity.core";','import {loadContactIdentityIndex,resolveSlimContactId} from "./slim-contact-identity.core";\nimport {readSlimContactHistory} from "./slim-contact-history.core";');
 once('  const phoneDigits = (r.phone ?? "").replace(/\\D/g, "");',`  const identity=await loadContactIdentityIndex(sb,ws);
  const unifiedHistory=await readSlimContactHistory(sb,ws,r.id,identity.family(r.id),{limit:100});
  const phoneDigits = (r.phone ?? "").replace(/\\D/g, "");`);
 once('activities:(acts??[]).map((a:any)=>({\n      id:a.id,type:a.type,text:typeof a.payload?.text==="string"?a.payload.text:null,\n      occurredAt:a.occurred_at,\n    })),','activities:unifiedHistory.activities,');
});
for(const [path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log('[Contact identity] Existing group routes preserved; Client detail uses the same complete family history.');
