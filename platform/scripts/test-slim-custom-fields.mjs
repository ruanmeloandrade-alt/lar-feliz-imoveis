import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {PGlite} from '@electric-sql/pglite';
const db=new PGlite();
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema private;
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table profiles(id uuid primary key,current_workspace_id uuid);
create table workspace_members(workspace_id uuid,user_id uuid,role text);
create function private.slim_workspace_access(w uuid,level text) returns boolean language sql as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid() and role='operator') $$;
create table lead_custom_fields(id uuid primary key default gen_random_uuid(),workspace_id uuid,name text not null check(length(btrim(name)) between 1 and 160),field_type text not null,options jsonb not null);
create table lead_custom_field_values(id uuid primary key,field_id uuid references lead_custom_fields(id) on delete cascade,value text);
grant usage on schema public,auth,private to authenticated;
grant select on profiles,workspace_members,lead_custom_fields,lead_custom_field_values to authenticated;
grant insert,update,delete on lead_custom_fields to authenticated;
alter table lead_custom_fields enable row level security;
create policy own_fields on lead_custom_fields to authenticated using(private.slim_workspace_access(workspace_id,'operator')) with check(private.slim_workspace_access(workspace_id,'operator'));
`);
await db.exec(readFileSync(new URL('../supabase/migrations/20261021131449_slim_custom_fields_atomic_save.sql',import.meta.url),'utf8'));
const actor='00000000-0000-4000-8000-000000000001',ws='00000000-0000-4000-8000-000000000002';
const old='00000000-0000-4000-8000-000000000003',fresh='00000000-0000-4000-8000-000000000004';
await db.query('insert into profiles values($1,$2)',[actor,ws]);
await db.query("insert into workspace_members values($1,$2,'operator')",[ws,actor]);
await db.query("insert into lead_custom_fields values($1,$2,'Old','text','[]')",[old,ws]);
await db.query("insert into lead_custom_field_values values(gen_random_uuid(),$1,'Preserved on failure')",[old]);
await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
const save=(deleted,updated,created)=>db.query('select public.slim_save_custom_fields($1,$2,$3) result',[deleted,JSON.stringify(updated),JSON.stringify(created)]);
const field={id:fresh,name:'New',fieldType:'select',options:['A','B']};
await db.exec('set role authenticated');
await assert.rejects(save([old],[],[{...field,name:''}]),/check constraint/);
assert.equal((await db.query('select count(*)::int n from lead_custom_field_values')).rows[0].n,1);
assert.equal((await db.query('select name from lead_custom_fields')).rows[0].name,'Old');
assert.equal((await save([old],[],[field])).rows[0].result.ok,true);
assert.equal((await db.query('select count(*)::int n from lead_custom_field_values')).rows[0].n,0);
assert.equal((await save([old],[],[field])).rows[0].result.ok,true);
assert.equal((await db.query('select count(*)::int n from lead_custom_fields')).rows[0].n,1);
await save([],[{...field,name:'Updated'}],[]);
assert.equal((await db.query('select name from lead_custom_fields')).rows[0].name,'Updated');
await assert.rejects(save([fresh],[{...field,id:old}],[]),/não encontrado/);
assert.equal((await db.query('select count(*)::int n from lead_custom_fields')).rows[0].n,1);
await db.exec("reset role; update workspace_members set role='viewer'; set role authenticated");
await assert.rejects(save([],[],[field]),/workspace_forbidden/);
await db.exec('reset role; set role anon');
await assert.rejects(save([],[],[]),/permission denied/);
await db.close();

// Exercise the actual dialog's async handler without opening a browser.
const source=readFileSync(new URL('../src/components/inbox/LeadProfilePanel.tsx',import.meta.url),'utf8');
const component=source.slice(source.indexOf('function CustomFieldsDialog('),source.indexOf('function StagePicker('));
const js=ts.transpileModule(component,{compilerOptions:{jsx:ts.JsxEmit.React,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(onSaveMain){
 const state=[],refs=[];let cursor=0,refCursor=0,closed=0;
 const useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],v=>{state[i]=typeof v==='function'?v(state[i]):v;}];};
 const useRef=initial=>{const i=refCursor++;return refs[i]??(refs[i]={current:initial});};
 const React={createElement:(tag,props,...children)=>({tag,props:props??{},children})};
 const Dialog=Function('React','useState','useRef','useEffect','readCustomFieldDraft','writeCustomFieldDraft','clearCustomFieldDraft','toast','X','Plus','Trash2','Save','FIELD_TYPE_LABELS',js+';return CustomFieldsDialog;')(React,useState,useRef,()=>{},(_key,fallback)=>fallback,()=>{},()=>{},{success(){}},'X','Plus','Trash2','Save',[]);
 const render=()=>{cursor=refCursor=0;return Dialog({mainFields:[],funnels:[],initialView:'__main__',onSaveMain,onSaveFunnel:async()=>{},onClose:()=>closed++});};
 const find=(node,predicate)=>{if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of (node.children??[]).flat(Infinity)){const result=find(child,predicate);if(result)return result;}return null;};
 return {render,find,get closed(){return closed;}};
}
let resolve,calls=0;
const h=harness(()=>{calls++;return new Promise(r=>resolve=r);});
let tree=h.render();const saveButton=h.find(tree,n=>n.tag==='button'&&n.props.onClick?.toString().includes('handleSave'));
saveButton.props.onClick();saveButton.props.onClick();assert.equal(calls,1);assert.equal(h.closed,0);
tree=h.render();assert.equal(h.find(tree,n=>n.tag==='fieldset').props.disabled,true);
tree.props.onClick?.();assert.equal(h.closed,0);resolve();await new Promise(r=>setImmediate(r));assert.equal(h.closed,1);
const failed=harness(async()=>{throw new Error('database failure');});
tree=failed.render();failed.find(tree,n=>n.tag==='button'&&n.props.onClick?.toString().includes('handleSave')).props.onClick();
await new Promise(r=>setImmediate(r));tree=failed.render();assert.equal(failed.closed,0);assert.equal(failed.find(tree,n=>n.props.role==='alert').children[0],'database failure');
// Exercise the real diff builder, including a retry after a successful write
// whose subsequent list refresh failed. The new field must not be deleted.
const persistSource=source.slice(source.indexOf('async function persistMainFields('),source.indexOf('async function persistFunnelFields('));
const persistJs=ts.transpileModule(persistSource,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let submitted;
const persist=Function('customFields','saveFields','fieldsQ','queryClient','leadId',persistJs+';return persistMainFields;')(
 [{key:'cf_'+fresh,label:'New',type:'select',options:['A','B']},{key:'cf_'+old,label:'Old',type:'text'}],
 async input=>{submitted=input.data;return {ok:true};},{refetch:async()=>({isError:false})},{invalidateQueries(){}},'test-lead');
await persist([{key:'custom_'+fresh,label:'New',type:'select',options:['A','B']}]);
assert.deepEqual(submitted.deletedIds,[old]);assert.equal(submitted.created[0].id,fresh);
console.log('PASS: atomic create/delete/update, rollback preserves values, retry without duplicates, permissions, actual dialog awaits acknowledgement, duplicate clicks blocked, failure keeps dialog open.');
