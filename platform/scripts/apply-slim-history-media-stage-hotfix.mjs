import fs from 'node:fs';import ts from 'typescript';
const root=new URL('../',import.meta.url),MARK='// SLIM_HISTORY_MEDIA_STAGE_HOTFIX_V1',plans=[];
const stageReady=JSON.parse(fs.readFileSync(new URL('./slim-stage-move-release.json',import.meta.url),'utf8')).enabled===true;
const stageBindings=new Set(['src/lib/saude-slim-funnel-client.ts','src/lib/slim-audience-runtime.server.ts']);
function edit(path,run){if(!stageReady&&stageBindings.has(path))return;let code=fs.readFileSync(new URL(path,root),'utf8');if(code.includes(MARK))return;
 const once=(a,b)=>{if(code.split(a).length!==2)throw new Error(`[Slim hotfix] ${path}: ambiguous anchor ${a.slice(0,100)}`);code=code.replace(a,()=>b);};
 const block=(a,b,value)=>{const i=code.indexOf(a),j=code.indexOf(b,i+a.length);if(i<0||j<0||code.split(a).length!==2)throw new Error(`[Slim hotfix] ${path}: missing section ${a}`);code=code.slice(0,i)+value+code.slice(j);};
 const section=(a,b,fn)=>{const i=code.indexOf(a),j=code.indexOf(b,i+a.length);if(i<0||j<0)throw new Error(`[Slim hotfix] missing section ${a}`);code=code.slice(0,i)+fn(code.slice(i,j))+code.slice(j);};
 const all=(a,b,n)=>{if(code.split(a).length-1!==n)throw new Error(`[Slim hotfix] ${path}: expected ${n} matches: ${a}`);code=code.split(a).join(b);};
 run({once,block,section,all});plans.push([path,code+'\n'+MARK+'\n']);
}
edit('scripts/test-slim-erp-release-source.mjs',({once})=>once("test('legacy history remains visibly separate',()=>assert(sources[1].includes('Histórico anterior do CRM (separado dos pedidos ERP)')));","test('one operational history without mounting legacy readers',()=>{assert.equal(sources[1].split('mode=\"history\"').length-1,1);for(const old of ['getSaudeSlimSalesHistory','getSaudeSlimSalesProducts','<details','sales-history-products'])assert(!sources[1].includes(old));});"));
edit('src/lib/leads.functions.ts',({once,block})=>{
 once('import { z } from "zod";','import { z } from "zod";\nimport {boundedMediaRequest,decodeSlimMedia,mediaPreparation} from "./slim-media-transport.server";');
 block('async function readResponseBody(', 'const CreateMediaSchema', `async function sendEvolutionMediaRequest(args:{url:string;apiKey:string;payload:Record<string,unknown>}):Promise<EvolutionRequestResult>{return boundedMediaRequest(args);}\n\n`);
 once('    await prepareEvolutionForMediaSend(base, credentialRow.instance_name, credentialRow.api_key);','    // Sending a file must never restart the shared WhatsApp session.');
 once('    const bytes = Uint8Array.from(atob(data.base64), (char) => char.charCodeAt(0));','    const bytes = decodeSlimMedia(data.base64);');
 once('const upload = await sb.storage.from("inbox-outgoing").upload(storagePath, bytes, {\n      contentType: data.mimeType,\n      upsert: false,\n    });','const upload = await mediaPreparation(sb.storage.from("inbox-outgoing").upload(storagePath, bytes, {\n      contentType: data.mimeType,\n      upsert: false,\n    }),"Armazenamento do arquivo");');
 once('    const signed = await sb.storage\n      .from("inbox-outgoing")\n      .createSignedUrl(storagePath, 60 * 60 * 24 * 7);','    const signed = await mediaPreparation(sb.storage\n      .from("inbox-outgoing")\n      .createSignedUrl(storagePath, 60 * 60 * 24 * 7),"Preparação do arquivo");');
 once('    let sendResult = await sendEvolutionMediaRequest({','    const {getRequest}=await import("@tanstack/react-start/server");\n    if(getRequest()?.signal.aborted)throw new Error("A tentativa foi encerrada antes do envio ao WhatsApp.");\n    const sendResult = await sendEvolutionMediaRequest({');
 block('    if (!sendResult.response.ok) {\n      const firstMessage', '    if (!sendResult.response.ok) {\n      const providerMessage','    // No restart and no resend after contacting the provider.\n\n');
});
edit('src/components/inbox/InboxPage.legacy.tsx',({once,block,section,all})=>{
 once('import { cn } from "@/lib/utils";','import { cn } from "@/lib/utils";\nimport {readSlimMediaFile,sendSlimMediaOnce} from "@/lib/slim-media-file.client";');
 block('  // A F2 mantém o primeiro paint paginado.', '  const [olderActivities, setOlderActivities]', '  // Older messages remain available through explicit paginated loading below.\n');
 block('  // Realtime é o caminho principal, mas uma aba pode ficar aberta por horas', '  // Backfill é manutenção defensiva.', '  // Realtime + one query poll are the live refresh paths; no parallel head timer.\n');
 all('    refetchInterval: 8_000,','    refetchInterval: 20_000,\n    retry: 1,',2);
 once('    (selfRecoveryActive ||\n      inboxHealthQuery.isFetching ||','    ((selfRecoveryActive && !relevantCacheAvailable) ||\n      (inboxHealthQuery.isFetching && !relevantCacheAvailable) ||');
 section('  const mediaMut = useMutation({','  const reactionFn',part=>{
  const a=part.indexOf('      const buf = await file.arrayBuffer();'),b=part.indexOf('      if (isGroupThread) {',a);
  if(a<0||b<0)throw new Error('[Slim hotfix] File preparation anchor missing');
  part=part.slice(0,a)+'      const base64=await readSlimMediaFile(file);\n      return sendSlimMediaOnce(async signal=>{\n'+part.slice(b);
  part=part.replace('return sendGroupMediaFn({\n          data:', 'return sendGroupMediaFn({\n          signal,\n          data:');
  part=part.replace('return sendMediaFn({\n        data:', 'return sendMediaFn({\n        signal,\n        data:');
  const end=part.indexOf('    },\n    onSuccess:');if(end<0)throw new Error('[Slim hotfix] Media mutation end missing');
  part=part.slice(0,end)+'      });\n'+part.slice(end);
  return part.replace('  const mediaMut = useMutation({','  const mediaMut = useMutation({\n    retry:false,');
 });
});
edit('src/lib/saude-slim-funnel-client.ts',({once,block})=>{
 once('const sb=supabase as any;','import {moveSlimLeadWithAutomations} from "./slim-stage-move.functions";\nconst stageMoveRequests=new Map<string,string>();\nconst sb=supabase as any;');
 block('export async function moveSlimLead(', 'export async function updateSlimStage(', `export async function moveSlimLead({data}:{data:{leadId:string;toStageId:string}}){
  const key=data.leadId+':'+data.toStageId;
  let requestId=stageMoveRequests.get(key);
  if(!requestId){requestId=crypto.randomUUID();stageMoveRequests.set(key,requestId);}
  const result=await moveSlimLeadWithAutomations({data:{...data,requestId}});
  stageMoveRequests.delete(key);
  return result;
}

`);
});
edit('src/lib/stage-automation-engine.server.ts',({once})=>{
 once('  eventId?: string | null;','  eventId?: string | null;\n  deferExecution?: boolean;');
 once('  const { data } = await query.maybeSingle();','  const { data, error: leadContextError } = await query.maybeSingle();\n  if(leadContextError)throw new Error("Não foi possível carregar o cliente para conferir os gatilhos.");');
 once('  const { data: rows } = await admin\n    .from("crm_stage_automations")','  const { data: rows, error: stageActionsError } = await admin\n    .from("crm_stage_automations")');
 once('  const seen = new Set<string>();','  if(stageActionsError)throw new Error("Não foi possível consultar os gatilhos da etapa.");\n  const seen = new Set<string>();');
 once('    if (delay === 0) immediate.push({ id: jobId, action });','    if (delay === 0 && !input.deferExecution) immediate.push({ id: jobId, action });');
 once('    if (!passesExecutionRules(lead, action.execution)) {',`    if(String(job.context?.event_id??'').startsWith('slim-stage-move:') && (lead.stageId!==job.stage_id || lead.pipelineId!==job.pipeline_id)){
      await finishJob(admin,job.id,'skipped','O cliente saiu da etapa antes da execução.',job.attempts??0);
      return {actionId:action.id,title,ok:true,skipped:true};
    }
    if (!passesExecutionRules(lead, action.execution)) {`);
});
edit('src/lib/slim-audience-runtime.server.ts',({once})=>{
 once('import { supabaseAdmin }','import {tickSlimStageMoveEvents} from "./slim-stage-move-worker.server";\nimport { supabaseAdmin }');
 once(" const {tickStageAutomationJobs}=await import('./stage-automation-engine.server');await tickStageAutomationJobs(db,10);recordDbRecovery();", " await tickSlimStageMoveEvents();\n const {tickStageAutomationJobs}=await import('./stage-automation-engine.server');await tickStageAutomationJobs(db,10);recordDbRecovery();");
});
for(const[path,code]of plans){if(!/\.tsx?$/.test(path))continue;const source=ts.createSourceFile(path,code,ts.ScriptTarget.Latest,true,path.endsWith('.tsx')?ts.ScriptKind.TSX:ts.ScriptKind.TS);if(source.parseDiagnostics.length)throw new Error('[Slim hotfix] Invalid syntax '+path+': '+source.parseDiagnostics.map(d=>ts.flattenDiagnosticMessageText(d.messageText,' ')).join('; '));}
for(const[path,code]of plans)fs.writeFileSync(new URL(path,root),code);
console.log(`[Slim hotfix] ${plans.length} checked consumers updated. Stage RPC bindings enabled: ${stageReady}. No business operations executed.`);
