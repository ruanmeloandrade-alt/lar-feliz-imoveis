import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=new URL('../',import.meta.url),marker='// SLIM_GROUP_CATALOG_UI_V1';
export function patchSlimGroupCatalogUi(input){
 if(input.includes(marker))return input;
 if(!input.includes('// SLIM_GROUP_SALESBOTS_ONLY_V1'))throw new Error('Apply group catalog UI after SalesBots-only transform.');
 let code=input;const once=(from,to)=>{if(code.split(from).length!==2)throw new Error('Group catalog anchor missing: '+from.slice(0,100));code=code.replace(from,()=>to)};
 const section=(from,to,value)=>{const a=code.indexOf(from),b=code.indexOf(to,a+from.length);if(a<0||b<0||code.split(from).length!==2)throw new Error('Group catalog section missing: '+from);code=code.slice(0,a)+value+code.slice(b)};
 once('import { useCallback, useEffect, useMemo, useRef, useState } from "react";','import { useCallback, useEffect, useMemo, useRef, useState } from "react";\nimport {useSlimGroupCatalog,useSlimGroupRulesDraft} from "./slim-group-catalog-ui";');
 section('export function CentralDeGrupos()', '/* ---------- helpers ---------- */', `export function CentralDeGrupos() {
  const catalog=useSlimGroupCatalog();
  const {scopeQ,scopeKey,workspaceId,selectedSessionId,setSelectedSessionId,channels,groupsQ,botsQ,sync,syncing,notice,syncError,refresh}=catalog;
  const [selectedGroupId,setSelectedGroupId]=useState<string|undefined>();
  const [tab,setTab]=useState<Tab>('grupos');
  useEffect(()=>{setSelectedGroupId(undefined);},[scopeKey]);
  const groups=groupsQ.data??[],bots=botsQ.data??[];
  const selected=groups.some(g=>g.id===selectedGroupId)?selectedGroupId:groups[0]?.id;
  const openRules=(id:string)=>{setSelectedGroupId(id);setTab('regras')};
  const selectedSession=channels.data?.whatsapp?.some(s=>s.id===selectedSessionId);
  const missingSessions=Array.from(new Set(groups.map(g=>g.session_id))).filter(id=>!channels.data?.whatsapp?.some(s=>s.id===id));
  return <div className="min-w-0 rounded-lg border border-border bg-card text-foreground overflow-hidden shadow-sm" data-slim-group-catalog>
    <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-4 flex-wrap">
      <div><h1 className="text-base font-semibold text-card-foreground inline-flex items-center gap-2"><Users className="w-4 h-4 text-primary"/> Central de Grupos</h1><p className="text-xs text-muted-foreground mt-1 max-w-2xl">Gerencie seus grupos de WhatsApp. Configure regras, gatilhos e SalesBots de grupo.</p></div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label className="grid gap-1 text-xs min-w-0">Sessão de WhatsApp<select aria-label="Sessão de WhatsApp" value={selectedSessionId??''} disabled={syncing||!workspaceId} onChange={e=>setSelectedSessionId(e.target.value||null)} className="max-w-full bg-background border border-border rounded px-2 py-2 text-xs text-foreground"><option value="">Todas as sessões</option>{(channels.data?.whatsapp??[]).map(s=><option key={s.id} value={s.id}>{s.label}</option>)}{missingSessions.map(id=><option key={id} value={id}>Sessão do histórico · {id.slice(0,8)}</option>)}</select></label>
        <button type="button" onClick={()=>void sync()} disabled={!selectedSessionId||syncing||!workspaceId} className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded bg-primary text-primary-foreground disabled:opacity-50">{syncing?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>} Sincronizar</button>
      </div>
    </div>
    <div className="px-5 pt-3 border-b border-border flex flex-wrap items-center gap-1" role="tablist" aria-label="Central de Grupos"><TabButton active={tab==='grupos'} onClick={()=>setTab('grupos')} icon={Users} label="Grupos"/><TabButton active={tab==='regras'} onClick={()=>setTab('regras')} icon={Shield} label="Regras"/><TabButton active={tab==='bots'} onClick={()=>setTab('bots')} icon={MessageSquare} label="Salesbots de grupo"/></div>
    {notice&&<p role="status" className="mx-5 mt-3 rounded border border-border bg-muted/30 p-3 text-sm">{notice}</p>}
    {syncError&&<p role="alert" className="mx-5 mt-3 rounded border border-destructive/40 p-3 text-sm text-destructive">{syncError}</p>}
    <div className="p-5 min-w-0">
      {!workspaceId?(scopeQ.isError?<div role="alert" className="text-sm">Não foi possível confirmar a empresa. <button className="underline" onClick={()=>void scopeQ.refetch()}>Tentar novamente</button></div>:<p role="status" className="text-sm text-muted-foreground">Conferindo empresa...</p>):<div key={scopeKey}>
        {channels.isError&&<p role="alert" className="mb-3 text-sm text-destructive">Não foi possível consultar as sessões de WhatsApp. <button className="underline" onClick={()=>void channels.refetch()}>Consultar sessões novamente</button></p>}
        {groupsQ.isError&&<div role="alert" className="rounded border border-destructive/30 p-4 text-sm">Não foi possível carregar os grupos. A consulta não confirmou uma lista vazia. <button className="ml-2 underline" onClick={()=>void groupsQ.refetch()}>Tentar novamente</button></div>}<>
          <div hidden={tab!=='grupos'||(groupsQ.isError&&!groupsQ.data)} role="tabpanel" aria-label="Grupos"><GruposTab workspaceId={workspaceId} sessionId={selectedSession?selectedSessionId:null} groups={groups} loading={groupsQ.isLoading} bots={bots} onChange={()=>void refresh()} onOpenRegras={openRules}/></div>
          <div hidden={tab!=='regras'||(groupsQ.isError&&!groupsQ.data)} role="tabpanel" aria-label="Regras">{groupsQ.isLoading&&<p role="status" className="text-sm text-muted-foreground">Carregando grupos...</p>}<RegrasTab groups={groups} bots={bots} workspaceId={workspaceId} initialGroupId={selectedGroupId} onChange={()=>void refresh()}/></div>
        </>
        <div hidden={tab!=='bots'} role="tabpanel" aria-label="Salesbots de grupo">
          <div className="mb-4 flex min-w-0 flex-wrap items-end gap-2 rounded border border-border bg-muted/20 p-3"><label className="grid min-w-0 flex-1 gap-1 text-xs">Grupo para configurar gatilhos<select aria-label="Grupo para configurar gatilhos" value={selected??''} disabled={groupsQ.isLoading||groupsQ.isError||!groups.length} onChange={e=>setSelectedGroupId(e.target.value)} className="min-w-0 max-w-full rounded border border-border bg-background p-2 text-sm"><option value="" disabled>{groupsQ.isError?'Lista de grupos indisponível':groupsQ.isLoading?'Carregando grupos...':'Selecione um grupo'}</option>{groups.map(g=><option key={g.id} value={g.id}>{g.name??g.group_jid}</option>)}</select></label><button className="rounded border border-border px-3 py-2 text-xs disabled:opacity-50" disabled={!selected||groupsQ.isError} onClick={()=>selected&&openRules(selected)}>Configurar gatilhos</button></div>
          {botsQ.isError?<div role="alert" className="text-sm">Não foi possível carregar os SalesBots. <button className="underline" onClick={()=>void botsQ.refetch()}>Tentar novamente</button></div>:<BotsGrupoTab bots={bots} loading={botsQ.isLoading} onChange={()=>void botsQ.refetch()}/>}
        </div>
      </div>}
    </div>
  </div>;
}

`);
 once('      onClick={onClick}\n      className={`px-3 py-2', '      onClick={onClick}\n      role="tab" aria-selected={active}\n      className={`px-3 py-2');
 once('Nenhum grupo sincronizado. Selecione uma sessão conectada e clique em <strong>Sincronizar</strong>.','Nenhum grupo encontrado nesta seleção. Selecione uma sessão conectada e clique em <strong>Sincronizar</strong>.');
 once('<div className="text-[10px] text-muted-foreground truncate">{g.group_jid}</div>','<div className="text-[10px] text-muted-foreground truncate">{g.group_jid}</div>\n                          <div className="text-[11px] text-muted-foreground mt-1">{g.last_synced_at ? "Atualizado pelo WhatsApp" : "Histórico disponível"}</div>');
 once('{g.participants_count}', '{g.last_synced_at ? g.participants_count : "Não confirmado"}');
 once('{g.is_admin ? (','{!g.last_synced_at ? <span className="text-[11px] text-muted-foreground">Não confirmado</span> : g.is_admin ? (');
 once('                          if (!sessionId) return;','                          if (!g.session_id) return;');
 once('await leaveFn({ data: { sessionId, groupJid: g.group_jid } });','await leaveFn({ data: { sessionId: g.session_id, groupJid: g.group_jid } });');
 section('  const [selectedGroupId, setSelectedGroupId] = useState<string>(initialGroupId ?? groups[0]?.id ?? "");','  const saveFn = useServerFn(saveGroupRules);',`  const {selectedGroupId,setSelectedGroupId,g,local,setLocal,dirty,markSaved}=useSlimGroupRulesDraft<Rules>(groups,initialGroupId);
  const savingRef=useRef(false),live=useRef(true);
  useEffect(()=>{live.current=true;return()=>{live.current=false}},[]);

`);
 once('    return <div className="text-xs text-muted-foreground py-8 text-center">Sincronize grupos antes de definir regras.</div>;','    return <div className="text-sm text-muted-foreground py-8 text-center">Nenhum grupo disponível nesta seleção. Confira as sessões ou sincronize o WhatsApp.</div>;');
 once('                  if (!workspaceId) return;\n                  setSaving(true);','                  if (!workspaceId || savingRef.current) return;\n                  savingRef.current=true; setSaving(true);\n                  const savedGroupId=g.id, snapshot=structuredClone(local);');
 once('                    await saveFn({ data: { workspaceId, groupId: g.id, rules: local as Record<string, unknown> } });\n                    onChange();\n                    toast.success("Regras salvas com sucesso.");','                    const result=await saveFn({ data: { workspaceId, groupId: savedGroupId, rules: snapshot as Record<string, unknown> } });\n                    if(!live.current)return;\n                    if(result?.ok!==true)throw new Error("O servidor não confirmou o salvamento das regras.");\n                    markSaved(savedGroupId,snapshot);onChange();toast.success("Regras salvas com sucesso.");\n                  } catch(error) {\n                    if(live.current)toast.error(error instanceof Error?error.message:"Não foi possível salvar as regras.");');
 once('                  } finally {\n                    setSaving(false);\n                  }','                  } finally {\n                    savingRef.current=false;if(live.current)setSaving(false);\n                  }');
 once('            <div className="flex justify-end pt-4 border-t border-border">','            <div className="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-border">\n              <span className="mr-auto text-xs text-muted-foreground">{dirty?"Alterações não salvas":"Sem alterações pendentes"}</span>');
 once('<li key={b.id} className="px-3 py-2.5 flex items-center gap-2">','<li key={b.id} data-slim-group-bot-id={b.id} className="px-3 py-2.5 flex flex-wrap items-center gap-2">');
 once('<div className="flex items-center justify-between mb-3">','<div className="flex flex-wrap items-start justify-between gap-3 mb-3">');
 code+='\n'+marker+'\n';const parsed=ts.createSourceFile('CentralDeGrupos.tsx',code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);if(parsed.parseDiagnostics.length)throw new Error('Group catalog UI produced invalid TSX.');return code;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const file=new URL('src/components/automations/CentralDeGrupos.tsx',root);const before=fs.readFileSync(file,'utf8'),after=patchSlimGroupCatalogUi(before);if(patchSlimGroupCatalogUi(after)!==after)throw new Error('Group catalog transform is not idempotent.');fs.writeFileSync(file,after);console.log('Group catalog UI integrated after SalesBots-only; no provider or business operation executed.');}
