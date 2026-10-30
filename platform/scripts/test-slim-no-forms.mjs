import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

// Product availability only. Never submit a form or call a provider/database.
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const compile=s=>ts.transpileModule(s,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function load(p,dependencies={}){const m={exports:{}};Function('require','exports','module',compile(read(p)))(name=>{assert(name in dependencies,'Unexpected import '+name);return dependencies[name]},m.exports,m);return m.exports;}
const types=load('src/lib/salesbot-types.ts');
for(const scope of ['individual','grupo','social-comentario']){
  assert(!types.filterAcoesByScope(scope).some(x=>x.value==='formulario'));
  assert(!types.filterPausaOpcoesByScope(scope).some(x=>x.value==='formulario-enviado'));
  assert(types.filterAcoesByScope(scope).some(x=>x.value==='definir-campo')||scope==='grupo');
}
assert(!types.GATILHO_CATALOG.some(x=>['formulario-enviado','tracking-abandono-formulario'].includes(x.kind)));
assert(!load('src/lib/crm-mock.ts').TRIGGER_CATALOG.some(x=>x.id==='gerar-form'));
const widgets=load('src/lib/dashboard-v4-widget-preferences.ts');
assert(!widgets.DASHBOARD_V4_WIDGETS.some(([id])=>id==='forms'));
assert(widgets.isWidgetHidden({...widgets.DEFAULT_DASHBOARD_V4_WIDGET_PREFERENCES,hiddenWidgetIds:[]},'forms'));
assert(!load('src/lib/documentation-catalog.ts').DOCUMENTATION_MODULES.some(x=>x.id==='formularios'));

const agentSource=read('src/components/automations/ConversationAgentsPanel.tsx');
const agentAst=ts.createSourceFile('agents.tsx',agentSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let actions;
function walk(node){if(ts.isVariableDeclaration(node)&&node.name.getText(agentAst)==='RULE_ACTIONS')actions=Function('return '+compile('const actions='+node.initializer.getText(agentAst)+';').replace('const actions =','').replace(/;\s*$/,''))();node.forEachChild(walk);}
walk(agentAst);
assert(actions&&!actions.some(x=>x.id==='enviar-formulario'));

const router={createFileRoute:()=>options=>({options}),notFound:()=>({isNotFound:true}),redirect:options=>({redirect:options})};
for(const path of ['src/routes/f.$slug.tsx','src/routes/crm.formularios.tsx']){
  const route=load(path,{'@tanstack/react-router':router}).Route;
  let thrown;try{route.options.beforeLoad()}catch(error){thrown=error}
  assert(thrown&&(thrown.isNotFound||thrown.redirect?.to==='/crm/funis-de-venda'));
  assert(!route.options.component);
}
assert(read('src/routes/l.$slug.tsx').includes('throw notFound();'));
assert(!read('src/components/crm/Lead360Section.tsx').includes('title="Formulários"'));
assert(!read('src/components/dashboard/AppSidebar.tsx').includes('/crm/formularios'));
console.log('PASS: forms unavailable in bot/agent/funnel catalogs, dashboard, lead profile, help and product routes; custom fields retained. No form sent or submitted.');
