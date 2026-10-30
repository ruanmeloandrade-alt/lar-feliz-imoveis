import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {leadCustomFieldInput,leadCustomFieldRecord} from '../src/lib/lead-custom-field-schema.ts';
import * as drafts from '../src/lib/custom-field-tab-draft.ts';

const id='00000000-0000-4000-8000-000000000001';
for(const schema of [leadCustomFieldInput,leadCustomFieldRecord]){
 assert.equal(schema.safeParse({id,name:'Interesse',fieldType:'select',options:[]}).success,false);
 const field=schema.parse({id,name:' Interesse ',fieldType:'multiselect',options:[' A ','A','B']});
 assert.deepEqual(field.options,['A','B']);assert.equal(field.name,'Interesse');
}
function storage(){const values=new Map();return{getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};}
const tabA=storage(),tabB=storage();globalThis.sessionStorage=tabA;
const key=drafts.customFieldDraftKey('actor','workspace','lead:one');
drafts.writeCustomFieldDraft(key,{name:'Pendente',options:['A']});
assert.equal(drafts.readCustomFieldDraft(key,null).name,'Pendente');
assert.equal(drafts.readCustomFieldDraft(drafts.customFieldDraftKey('other','workspace','lead:one'),null),null);
globalThis.sessionStorage=tabB;assert.equal(drafts.readCustomFieldDraft(key,null),null);
globalThis.sessionStorage=tabA;drafts.clearCustomFieldDraft(key);
tabA.setItem(key,'broken');assert.deepEqual(drafts.readCustomFieldDraft(key,{name:''}),{name:''});
tabA.setItem(key,JSON.stringify({version:1,at:Date.now(),value:{name:123}}));assert.deepEqual(drafts.readCustomFieldDraft(key,{name:''}),{name:''});drafts.clearCustomFieldDraft(key);

const h=(tag,props,...children)=>({tag,props:props??{},children:children.flat(Infinity).filter(v=>v!==false&&v!=null)});
function findAll(tree,test){if(!tree||typeof tree!=='object')return[];return[...(test(tree)?[tree]:[]),...(tree.children??[]).flatMap(child=>findAll(child,test))];}
function runner(source,component,props,environment={}){
 const states=[],effects=[];let cursor=0,tree;
 const useState=initial=>{const i=cursor++;if(!(i in states))states[i]=typeof initial==='function'?initial():initial;return[states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];};
 const useRef=initial=>{const i=cursor++;return states[i]??(states[i]={current:initial});};
 const useEffect=(fn,deps)=>{const i=cursor++,old=states[i];if(!old||deps.some((value,index)=>!Object.is(value,old[index]))){states[i]=deps;effects.push(fn);}};
 const env={React:{createElement:h},useState,useRef,useEffect,...drafts,toast:{success(){}},X:'X',Plus:'Plus',Trash2:'Trash2',Save:'Save',FIELD_TYPE_LABELS:[{value:'text',label:'Texto'},{value:'select',label:'Selecionar'}],Dialog:'Dialog',DialogContent:'DialogContent',DialogHeader:'DialogHeader',DialogTitle:'DialogTitle',DialogFooter:'DialogFooter',Input:'input',Button:'button',...environment};
 const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const fn=Function(...Object.keys(env),js+';return '+component+';')(...Object.values(env));
 const render=()=>{cursor=0;tree=fn(props);while(effects.length)effects.shift()();return tree;};
 return{render,get tree(){return tree;},find:test=>{const node=findAll(tree,test)[0];assert(node,'Missing node');return node;}};
}
const panel=readFileSync(new URL('../src/components/inbox/LeadProfilePanel.tsx',import.meta.url),'utf8');
const profileSource=panel.slice(panel.indexOf('function CustomFieldsDialog('),panel.indexOf('function StagePicker('));
let saved,closed=0;
const props={draftKey:key,mainFields:[],funnels:[],initialView:'__main__',onSaveMain:async(fields,baseline)=>{saved={fields,baseline};},onSaveFunnel:async()=>{},onClose:()=>closed++};
let profile=runner(profileSource,'CustomFieldsDialog',props);profile.render();
profile.find(n=>n.tag==='input'&&n.props.placeholder?.startsWith('Nome do campo')).props.onChange({target:{value:'Interesse'}});profile.render();
profile.find(n=>n.tag==='select'&&n.props.value==='text').props.onChange({target:{value:'select'}});profile.render();
profile.find(n=>n.tag==='input'&&n.props.placeholder==='Adicionar opção e Enter').props.onChange({target:{value:'Quero comprar'}});profile.render();
// Focus/visibility and a complete component remount do not submit or discard.
assert.equal(saved,undefined);profile=runner(profileSource,'CustomFieldsDialog',props);profile.render();
assert.equal(profile.find(n=>n.tag==='input'&&n.props.placeholder?.startsWith('Nome do campo')).props.value,'Interesse');
assert.equal(profile.find(n=>n.tag==='select'&&n.props.value==='select').props.value,'select');
assert.equal(profile.find(n=>n.tag==='input'&&n.props.placeholder==='Adicionar opção e Enter').props.value,'Quero comprar');
profile.find(n=>n.tag==='button'&&n.props.onClick?.toString().includes('handleSave')).props.onClick();await new Promise(r=>setImmediate(r));
assert.equal(closed,1);assert.equal(saved.fields[0].type,'select');assert.deepEqual(saved.fields[0].options,['Quero comprar']);assert.deepEqual(saved.baseline,[]);assert.equal(drafts.readCustomFieldDraft(key,null),null);

const builder=readFileSync(new URL('../src/components/automations/SalesbotBuilder.tsx',import.meta.url),'utf8');
const botSource=builder.slice(builder.indexOf('function CreateCustomFieldDialog('),builder.indexOf('/* ============ Picker: Definir campo'));
const botKey=drafts.customFieldDraftKey('actor','workspace','bot-block:one');let sent=[],created,fail=true;
const botProps={open:true,draftKey:botKey,onCreated:field=>{created=field;},onOpenChange:()=>{}};
const createFn=async({data})=>{sent.push(data);if(fail)throw Error('temporary');return{field:leadCustomFieldRecord.parse(data)};};
let bot=runner(botSource,'CreateCustomFieldDialog',botProps,{useServerFn:()=>createFn,createLeadCustomField:'create'});bot.render();
bot.find(n=>n.tag==='input').props.onChange({target:{value:'Interesse do bot'}});bot.render();
bot.find(n=>n.tag==='select').props.onChange({target:{value:'multiselect'}});bot.render();
bot.find(n=>n.tag==='textarea').props.onChange({target:{value:'A\nB\nA'}});bot.render();
bot=runner(botSource,'CreateCustomFieldDialog',botProps,{useServerFn:()=>createFn,createLeadCustomField:'create'});bot.render();
const button=()=>bot.find(n=>n.tag==='button'&&(n.children.includes('Criar campo')||n.children.includes('Criando...')));
button().props.onClick();button().props.onClick();await new Promise(r=>setImmediate(r));bot.render();
assert.equal(sent.length,1);assert.equal(bot.find(n=>n.props.role==='alert').children[0],'temporary');assert.equal(bot.find(n=>n.tag==='input').props.value,'Interesse do bot');
fail=false;button().props.onClick();await new Promise(r=>setImmediate(r));assert.equal(sent[0].id,sent[1].id);assert.deepEqual(created.options,['A','B']);assert.equal(created.fieldType,'multiselect');assert.equal(drafts.readCustomFieldDraft(botKey,null),null);

const persistSource=panel.slice(panel.indexOf('async function persistMainFields('),panel.indexOf('async function persistFunnelFields('));
const persistJs=ts.transpileModule(persistSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;let batch;
const persist=Function('customFields','saveFields','fieldsQ','queryClient','leadId',persistJs+';return persistMainFields;')([{key:'cf_old',label:'Old',type:'text'},{key:'cf_other_tab',label:'From other tab',type:'text'}],async input=>{batch=input.data;},{refetch:async()=>({isError:false})},{invalidateQueries(){}},'lead');
await persist([],['cf_old']);assert.deepEqual(batch.deletedIds,['old']);
// The real dispatcher keeps matching immutable field IDs used by existing bots.
// Its output is captured locally; no run or message reaches production.
const runtime=readFileSync(new URL('../src/lib/salesbot-runtime.server.ts',import.meta.url),'utf8');
const ast=ts.createSourceFile('runtime.ts',runtime,ts.ScriptTarget.Latest,true);
const dispatcher=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='dispatchCustomFieldChanged');
assert(dispatcher);const dispatchJs=ts.transpileModule(dispatcher.getText(ast).replace(/^export\s+/,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const starts=[];
const dispatch=Function('loadActiveBotsWithGatilhos','loadLead','scopeMatchesLead','startSalesbotRun','computeDelaySecondsFromGatilho',dispatchJs+';return dispatchCustomFieldChanged;')(
 async()=>[{id:'bot',gatilhos:[{kind:'campo-alterado',campoId:created.id,campoNome:'Old name',campoValor:'A'}]}],async()=>({id:'lead'}),()=>true,async(_db,input)=>starts.push(input),()=>0);
await dispatch({}, {workspaceId:'workspace',leadId:'lead',fieldId:created.id,fieldName:'Renamed',value:'A'});
assert.equal(starts.length,1);assert.equal(starts[0].initialVariables.field_id,created.id);
await dispatch({}, {workspaceId:'workspace',leadId:'lead',fieldId:crypto.randomUUID(),fieldName:'Old name',value:'A'});assert.equal(starts.length,1);
console.log('PASS field drafts: shared selection schema; options; tab/actor isolation; corrupted storage; actual Inbox restores/remounts and saves pending input; actual bot restores, preserves errors, blocks duplicate click, retries same ID; another tab field preserved.');
