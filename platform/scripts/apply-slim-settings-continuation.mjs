import fs from 'node:fs';
const root=new URL('../',import.meta.url);const MARK='// SLIM_SETTINGS_CONTINUATION_V1';const plans=[];
function edit(file,fn){let code=fs.readFileSync(new URL(file,root),'utf8');if(code.includes(MARK))return;
 const once=(a,b)=>{if(code.split(a).length!==2)throw new Error(`[Settings] ${file}: ambiguous/missing ${a.slice(0,75)}`);code=code.replace(a,()=>b);};
 const section=(a,b,transform)=>{const start=code.indexOf(a),end=b?code.indexOf(b,start+a.length):code.length;if(start<0||end<0)throw new Error(`[Settings] section ${a} not found`);code=code.slice(0,start)+transform(code.slice(start,end))+code.slice(end);};
 const swap=(source,a,b)=>{if(source.split(a).length!==2)throw new Error('[Settings] section anchor missing: '+a.slice(0,65));return source.replace(a,()=>b);};
 fn({once,section,swap});plans.push([file,code+'\n'+MARK+'\n']);}
edit('src/lib/settings.functions.ts',({once,section,swap})=>{
 once('import { createServerFn }', 'import { assertSettingsRow, validateSlimBusinessHours, validateEmployeeSetup } from "@/lib/slim-settings-validation.core";\nimport { createServerFn }');
 const specs=[
  ['updateProfile','const NotifSchema','const { error } = await sb.from("profiles").update(payload).eq("id", context.userId);','salvar o perfil'],
  ['updateNotificationPrefs','/* ---------- Empresa','const { error } = await sb.from("profiles").update({ notification_prefs: data }).eq("id", context.userId);','salvar as preferências'],
  ['updateWorkspace','/* ---------- Expediente','const { error } = await sb.from("workspaces").update(payload).eq("id", wsId);','salvar a empresa'],
  ['updateBusinessHours','/* ---------- Equipe','const { error } = await sb.from("workspaces").update({ business_hours: data }).eq("id", wsId);','salvar o expediente'],
 ];
 for(const [name,end,old,action] of specs)section('export const '+name,end,s=>{
  const q=old.replace('const { error }','const { data: changed, error }').replace(/;$/,'.select("id").maybeSingle();');
  s=swap(s,old,q);s=swap(s,'if (error) throw new Error(error.message);',`assertSettingsRow({data:changed,error},"${action}");`);return s;
 });
 once('.inputValidator((d: unknown) => BusinessHoursSchema.parse(d))','.inputValidator((d: unknown) => validateSlimBusinessHours(BusinessHoursSchema.parse(d)))');
 section('export const createEmployee','const InvIdSchema',s=>swap(s,
  '    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");',
  '    validateEmployeeSetup(data);\n    if(data.sector_id) await requireSector(sb,wsId,data.sector_id);\n    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");'));
});
edit('src/legacy/configuracoes.legacy.tsx',({once,section,swap})=>{
 once('import { useCallback, useEffect, useMemo, useState }', 'import { assertSecuritySaveAllowed, parseSlimSecuritySnapshot } from "@/lib/slim-settings-validation.core";\nimport { useCallback, useEffect, useMemo, useState, useRef }');
 once('{bundleQ.data && (','{bundleQ.data && !bundleQ.isError && (');
 once('{bundleQ.isError && <div className="text-sm text-destructive">Falha ao carregar configurações.</div>}', '{bundleQ.isError && <div role="alert" className="text-sm text-destructive">Falha ao carregar configurações. Nenhuma alteração pode ser feita com dados desatualizados.<button type="button" onClick={()=>bundleQ.refetch()} className="block mt-3 underline">Tentar novamente</button></div>}');
 section('function SecurityRow(', 'function SegurancaTab(',s=>{
  s=swap(s,'on, onToggle, children, soon,','on, onToggle, children, soon, disabled=false,');
  s=swap(s,'children?: React.ReactNode; soon?: boolean;','children?: React.ReactNode; soon?: boolean; disabled?: boolean;');
  s=swap(s,'<div className={cn("rounded-xl border bg-card p-4", on ? "border-primary/40" : "border-border")}>','<fieldset disabled={disabled} className={cn("min-w-0 rounded-xl border bg-card p-4 disabled:opacity-60", on ? "border-primary/40" : "border-border")}>');
  const i=s.lastIndexOf('    </div>');if(i<0)throw new Error('SecurityRow closing not found');s=s.slice(0,i)+'    </fieldset>'+s.slice(i+10);return s;
 });
 once('turnstile: false, ipAllowlist: false, loginAlerts: true, deviceApproval: false,','turnstile: false, ipAllowlist: false, loginAlerts: false, deviceApproval: false,');
 once('forceTeam2fa: false, autoLogout: true, hibp: true, exportAlert: false,','forceTeam2fa: false, autoLogout: true, hibp: false, exportAlert: false,');
 once('  const [ipSaving, setIpSaving] = useState(false);',`  const [ipSaving, setIpSaving] = useState(false);
  const [securityState,setSecurityState]=useState<"loading"|"ready"|"error">("loading");
  const [securityError,setSecurityError]=useState<string|null>(null);
  const [securityAdmin,setSecurityAdmin]=useState(false);
  const [securityReload,setSecurityReload]=useState(0);
  const [securitySaving,setSecuritySaving]=useState(false);
  const securitySaveLock=useRef(false);`);
 section('  // Configurações de segurança do workspace', '  const secKeyMap',s=>{
  const a=s.indexOf('  useEffect(() => {');if(a<0)throw new Error('Security load effect missing');
  return s.slice(0,a)+`  useEffect(() => {
    let current=true;setSecurityState("loading");setSecurityError(null);setSecurityAdmin(false);
    void (async()=>{try{
      const r=parseSlimSecuritySnapshot(await fnGetSec({}));if(!current)return;const s=r.settings;
      setMyIp(r.currentIp);setIps(s.allowed_ips.join("\\n"));setIpDesktopOnly(s.ip_allowlist_desktop_only);
      setAdv(prev=>({...prev,deviceApproval:s.device_approval,forceTeam2fa:s.require_team_2fa,hibp:s.block_leaked_passwords,exportAlert:s.confirm_bulk_export,ipAllowlist:s.ip_allowlist_enabled,turnstile:s.turnstile_enabled,loginAlerts:s.login_alerts}));
      setSecurityAdmin(r.isAdmin);setSecurityState("ready");
    }catch(e){if(current){setSecurityState("error");setSecurityError(e instanceof Error?e.message:"Não foi possível verificar a segurança.");}}})();
    return ()=>{current=false;};
  },[fnGetSec,securityReload]);\n\n`;
 });
 section('  const saveSec = async', '  const ipList',()=>`  const saveSec=async(key:string,value:boolean)=>{
    try{assertSecuritySaveAllowed(securityState,securityAdmin,securitySaveLock.current);}catch(e){onToast(e instanceof Error?e.message:"Sem permissão para salvar.","err");return;}
    const local=secKeyMap[key];if(!local)return;
    securitySaveLock.current=true;setSecuritySaving(true);
    try{
      const result=await fnSetSec({data:{[key]:value} as any});
      const confirmed=parseSlimSecuritySnapshot({...result,isAdmin:securityAdmin});
      if(confirmed.settings[key]!==value)throw new Error("O servidor não confirmou o valor solicitado.");
      setAdv(s=>({...s,[local]:confirmed.settings[key]}));
      onToast("Preferência salva. A aplicação da proteção depende da configuração do servidor.");
    }catch(e){onToast(e instanceof Error?e.message:"Falha ao salvar.","err");}
    finally{securitySaveLock.current=false;setSecuritySaving(false);}
  };\n\n`);
 section('  const saveIpList = async', '  const strength =',()=>`  const saveIpList=async()=>{
    try{assertSecuritySaveAllowed(securityState,securityAdmin,securitySaveLock.current);}catch(e){onToast(e instanceof Error?e.message:"Configurações indisponíveis.","err");return;}
    if(ipInvalid.length){onToast("Endereço inválido: "+ipInvalid[0],"err");return;}
    securitySaveLock.current=true;setIpSaving(true);setSecuritySaving(true);
    try{
      const response=await fnSetSec({data:{allowed_ips:ipList,ip_allowlist_desktop_only:ipDesktopOnly} as any});
      const confirmed=parseSlimSecuritySnapshot({...response,isAdmin:securityAdmin});
      setIps(confirmed.settings.allowed_ips.join("\\n"));setIpDesktopOnly(confirmed.settings.ip_allowlist_desktop_only);
      onToast("Lista de IPs salva no servidor.");
    }catch(e){onToast(e instanceof Error?e.message:"Falha ao salvar a lista.","err");}
    finally{securitySaveLock.current=false;setIpSaving(false);setSecuritySaving(false);}
  };\n\n`);
 section('  const twoFAAtivos =', '  const submit =',()=> '');
 section('      {/* Score */}', '      {/* Senha */}',()=>`      <div className="rounded-xl border border-border bg-card p-4" role={securityState==="error"?"alert":"status"}>
        <h3 className="text-sm font-semibold">Estado das configurações de segurança</h3>
        <p className="mt-2 text-xs text-muted-foreground">{securityState==="loading"?"Consultando as configurações do servidor...":securityState==="error"?securityError:"Configurações carregadas. Preferência salva não comprova que o controle está aplicado a todos os acessos."}</p>
        {securityState==="error"&&<button type="button" onClick={()=>setSecurityReload(v=>v+1)} className="mt-3 text-xs underline">Tentar carregar novamente</button>}
        {mfaCache.isError&&<p className="mt-2 text-xs text-destructive">Não foi possível confirmar os métodos de autenticação em dois fatores.</p>}
      </div>\n\n`);
 section('  const submit = async (e: React.FormEvent) => {', '  const copiar =',s=>{
  s=swap(s,'    const { error } = await supabase.auth.updateUser({ password: pw1 });\n    setLoading(false);\n    if (error) return onToast(error.message, "err");',`    try {
      const {error}=await supabase.auth.updateUser({password:pw1});
      if(error){onToast(error.message,"err");return;}
    }catch{onToast("Não foi possível confirmar a alteração da senha. Verifique a conexão antes de tentar novamente.","err");return;}
    finally{setLoading(false);}`);return s;
 });
 once('desc="Desafio invisível no login e nos formulários públicos para barrar robôs e ataques automatizados. Ativo e salvo — falta apenas a chave da Cloudflare para o desafio aparecer."','desc="O desafio depende das chaves e da validação no servidor. Salvar esta preferência não confirma a proteção dos formulários ou do login."');
 section('function SegurancaTab(',null,s=>{
  const re=/on=\{adv\.([A-Za-z]+)\} onToggle=\{\(\) => saveSec\(/g;let hits=0;
  s=s.replace(re,(full)=>{hits++;return 'disabled={securityState!=="ready"||!securityAdmin||securitySaving} '+full;});
  if(hits<6)throw new Error('Expected backend security toggle guards');
  s=swap(s,'disabled={ipSaving}','disabled={ipSaving||securityState!=="ready"||!securityAdmin||securitySaving}');
  s=swap(s,'{statusQ.data\n                  ? statusQ.data.remaining > 0','{statusQ.isError ? "Serviço de códigos de recuperação indisponível. Nenhum código foi confirmado." : statusQ.data\n                  ? statusQ.data.remaining > 0');
  s=swap(s,'disabled={gerar.isPending}','disabled={gerar.isPending||statusQ.isLoading||statusQ.isError}');return s;
 });
});
for(const [file,code] of plans)fs.writeFileSync(new URL(file,root),code);
console.log(`[Slim settings] ${plans.length} source files updated after all anchors were validated.`);
