import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';

const derive = promisify(scrypt);
export const fail = (message, status = 400, code = 'INVALID') => { throw Object.assign(new Error(message), { status, code }); };
const uuid = z.string().uuid();
const text = (max = 200) => z.string().trim().max(max);
const optional = (max = 200) => text(max).nullable().optional().default(null);
const money = z.number().finite().nonnegative().max(1e12).nullable().optional().default(null);
const common = { id: uuid.optional(), created_at: z.string().datetime().optional() };
const scoped = { ...common, workspace_id: uuid };
const schemas = {
  properties: z.object({ ...common, title: text(150).min(1), city: text(120).min(1), address: optional(), description: optional(3000), price: money, subsidy_estimate: money, monthly_parcel: money, down_payment: money, bedrooms: z.number().int().nonnegative().nullable().optional().default(null), bathrooms: z.number().int().nonnegative().nullable().optional().default(null), area_m2: money, tag: optional(40), images: z.array(z.string().max(2000)).max(200).default([]), pdfs: z.array(z.string().max(2000)).max(100).default([]), plans: z.array(z.object({ name: text(100), area_m2: money })).default([]), construction_status: z.enum(['pronto','na_planta']).default('pronto'), launch_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().default(null), published: z.boolean().default(false), show_parcel: z.boolean().default(true), show_down_payment: z.boolean().default(false), created_by: uuid.nullable().optional(), updated_at: z.string().datetime().optional() }).strict(),
  leads: z.object({ ...common, nome: text(120).min(2), whatsapp: text(30).min(8), email: optional(200), renda: money, entrada: money, tipo_trabalho: optional(), fgts: optional(), cpf_limpo: optional(), possui_imovel: optional(), cidade: optional(120), faixa: optional(), subsidio_resultado: optional(), produto_interesse: optional(), observacoes: optional(2000) }).strict(),
  vanessa_contacts: z.object({ ...scoped, name: text().min(1), phone: optional(64), email: optional(254), city: optional(120), notes: optional(5000) }).strict(),
  vanessa_deals: z.object({ ...scoped, contact_id: uuid, pipeline_id: uuid, stage_id: uuid, property_id: uuid.nullable().default(null), source_lead_id: uuid.nullable().default(null), name: text().min(1), value: z.number().finite().nonnegative().max(1e12).default(0), notes: optional(5000), updated_at: z.string().datetime().optional() }).strict(),
  vanessa_tasks: z.object({ ...scoped, contact_id: uuid.nullable().default(null), deal_id: uuid.nullable().default(null), title: text().min(1), due_at: z.string().datetime(), done: z.boolean().default(false), event_id: uuid.nullable().default(null), automation_id: uuid.nullable().default(null) }).strict(),
  vanessa_automations: z.object({ ...scoped, name: text().min(1), event_kind: z.enum(['lead.created','lead.stage_changed']), stage_id: uuid.nullable().default(null), task_title: text().min(1), delay_hours: z.number().int().min(0).max(8760).default(0), enabled: z.boolean().default(true) }).strict(),
  vanessa_proposals: z.object({ ...scoped, contact_id: uuid, property_id: uuid.nullable().default(null), title: text().min(1), amount: z.number().finite().nonnegative().max(1e12), status: z.enum(['draft','sent','accepted','rejected','contracted']).default('draft'), valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null), terms: text(10000).default(''), document_path: optional(500) }).strict(),
};
export const collections = new Set([...Object.keys(schemas), 'vanessa_workspaces','vanessa_pipelines','vanessa_stages','vanessa_events','user_roles']);
const normalizedPhone = phone => String(phone ?? '').replace(/\D/g, '') || null;
const sha = token => createHash('sha256').update(token).digest('hex');

export class Store {
  constructor(dir) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.dir = dir;
    this.db = new DatabaseSync(join(dir, 'vanessa.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS records(collection TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL CHECK(json_valid(data)),PRIMARY KEY(collection,id));
      CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password TEXT NOT NULL,salt TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts(request_id TEXT PRIMARY KEY,actor TEXT NOT NULL,fingerprint TEXT NOT NULL,result TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS attempts(ip TEXT NOT NULL,at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS attempts_ip_at ON attempts(ip,at);
      CREATE TABLE IF NOT EXISTS files(bucket TEXT NOT NULL,path TEXT NOT NULL,disk TEXT NOT NULL,mime TEXT NOT NULL,size INTEGER NOT NULL,public INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(bucket,path));`);
    this.secret = this.db.prepare("SELECT value FROM settings WHERE key='secret'").get()?.value;
    if (!this.secret) { this.secret = randomBytes(32).toString('hex'); this.db.prepare('INSERT INTO settings VALUES (?,?)').run('secret',this.secret); }
    if (!this.all('vanessa_workspaces').length) this.transaction(() => {
      const w = this.put('vanessa_workspaces', { id: randomUUID(), slug: 'vanessa', name: 'Vanessa Simoni', created_at: new Date().toISOString() });
      const p = this.put('vanessa_pipelines', { id: randomUUID(), workspace_id: w.id, name: 'Negociacoes imobiliarias' });
      ['Novo contato','Qualificacao','Visita','Proposta','Contrato fechado','Perdido'].forEach((name, position) => this.put('vanessa_stages',{ id: randomUUID(), pipeline_id:p.id, name, position, outcome: position===4?'won':position===5?'lost':'open' }));
    });
    this.workspace = this.all('vanessa_workspaces')[0];
    this.importLocal();
  }
  transaction(action) { this.db.exec('BEGIN IMMEDIATE'); try { const result=action(); this.db.exec('COMMIT'); return result; } catch(error) { this.db.exec('ROLLBACK'); throw error; } }
  all(collection) { return this.db.prepare('SELECT data FROM records WHERE collection=? ORDER BY id').all(collection).map(r=>JSON.parse(r.data)); }
  get(collection,id) { const r=this.db.prepare('SELECT data FROM records WHERE collection=? AND id=?').get(collection,id); return r ? JSON.parse(r.data) : null; }
  put(collection,row) { this.db.prepare('INSERT INTO records VALUES (?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').run(collection,row.id,JSON.stringify(row)); return row; }
  remove(collection,id) { this.db.prepare('DELETE FROM records WHERE collection=? AND id=?').run(collection,id); }
  importLocal() {
    const file=join(this.dir,'import','catalog.json');
    if (!existsSync(file) || this.db.prepare("SELECT 1 FROM settings WHERE key='imported'").get()) return;
    const seed=JSON.parse(readFileSync(file,'utf8'));
    this.transaction(()=>{
      for(const p of seed.properties ?? []) this.save('properties',{...p,created_by:null});
      for(const l of seed.leads ?? []) this.save('leads',l);
      for(const f of seed.files ?? []) this.db.prepare('INSERT OR IGNORE INTO files VALUES (?,?,?,?,?,?)').run(f.bucket,f.path,f.disk,f.mime,f.size,1);
      this.db.prepare('INSERT INTO settings VALUES (?,?)').run('imported',new Date().toISOString());
    });
  }
  relation(table,id) { const value=this.get(table,id); if(!value) fail('Cadastro relacionado nao encontrado.',400,'RELATION'); return value; }
  save(collection,input,existing=null) {
    const schema=schemas[collection]; if(!schema) fail('Colecao somente de leitura.',403);
    let parsed;
    try { parsed=schema.parse({ ...(existing??{}),...input }); } catch { fail('Dados invalidos. Confira os campos.',400,'VALIDATION'); }
    const row={...parsed,id:existing?.id??parsed.id??randomUUID(),created_at:existing?.created_at??parsed.created_at??new Date().toISOString()};
    if(!existing && this.get(collection,row.id)) fail('Cadastro ja existe. Atualize a lista antes de repetir.',409,'23505');
    if(row.workspace_id && row.workspace_id!==this.workspace.id) fail('Ambiente invalido.',403);
    if(collection==='vanessa_contacts') {
      row.phone=normalizedPhone(row.phone);
      if(row.phone && this.all(collection).some(c=>c.phone===row.phone&&c.id!==row.id)) fail('Este telefone ja possui um contato. Use o cadastro existente; a etapa e os dados dele foram preservados.',409,'23505');
    }
    if(collection==='vanessa_deals') {
      const contact=this.relation('vanessa_contacts',row.contact_id),stage=this.relation('vanessa_stages',row.stage_id),pipeline=this.relation('vanessa_pipelines',row.pipeline_id);
      if(contact.workspace_id!==row.workspace_id || pipeline.workspace_id!==row.workspace_id || stage.pipeline_id!==row.pipeline_id) fail('Vinculo de negociacao invalido.');
      if(row.property_id) this.relation('properties',row.property_id);
      if(row.source_lead_id) { this.relation('leads',row.source_lead_id); if(this.all(collection).some(d=>d.source_lead_id===row.source_lead_id&&d.id!==row.id)) fail('Ficha ja vinculada.',409,'23505'); }
      row.updated_at=new Date().toISOString();
    }
    if(collection==='vanessa_tasks') {
      if(row.contact_id) this.relation('vanessa_contacts',row.contact_id);
      if(row.deal_id) this.relation('vanessa_deals',row.deal_id);
    }
    if(collection==='vanessa_automations' && row.stage_id) this.relation('vanessa_stages',row.stage_id);
    if(collection==='vanessa_proposals') {
      this.relation('vanessa_contacts',row.contact_id);
      if(row.property_id) this.relation('properties',row.property_id);
      if(row.document_path && !this.db.prepare('SELECT 1 FROM files WHERE bucket=? AND path=?').get('vanessa-documents',row.document_path)) fail('Documento nao encontrado.');
    }
    if(collection==='properties') for(const url of [...row.images,...row.pdfs]) if(!url.startsWith('/api/files/')) fail('Midia deve estar no armazenamento proprio.');
    this.put(collection,row);
    if(collection==='leads'&&!existing) this.capture(row);
    if(collection==='vanessa_deals'&&(!existing||existing.stage_id!==row.stage_id)) this.emit(row,existing?'lead.stage_changed':'lead.created');
    return row;
  }
  capture(lead) {
    const phone=normalizedPhone(lead.whatsapp);
    let contact=phone?this.all('vanessa_contacts').find(c=>c.phone===phone):null;
    if(!contact) contact=this.save('vanessa_contacts',{workspace_id:this.workspace.id,name:lead.nome,phone,email:lead.email,city:lead.cidade,notes:lead.observacoes});
    const pipeline=this.all('vanessa_pipelines')[0],stage=this.all('vanessa_stages').sort((a,b)=>a.position-b.position)[0];
    this.save('vanessa_deals',{workspace_id:this.workspace.id,contact_id:contact.id,pipeline_id:pipeline.id,stage_id:stage.id,source_lead_id:lead.id,name:lead.produto_interesse||'Interesse imobiliario',notes:lead.observacoes});
  }
  emit(deal,kind) {
    const event=this.put('vanessa_events',{id:randomUUID(),workspace_id:deal.workspace_id,deal_id:deal.id,kind,payload:{stageId:deal.stage_id,origin:deal.source_lead_id?'site':'crm'},created_at:new Date().toISOString()});
    for(const rule of this.all('vanessa_automations').filter(a=>a.enabled&&a.event_kind===kind&&(!a.stage_id||a.stage_id===deal.stage_id))) this.save('vanessa_tasks',{workspace_id:deal.workspace_id,contact_id:deal.contact_id,deal_id:deal.id,title:rule.task_title,due_at:new Date(Date.now()+rule.delay_hours*3600000).toISOString(),event_id:event.id,automation_id:rule.id});
    return event;
  }
  rpc(name,args,actor) {
    const request=uuid.parse(args._request_id),workspace=uuid.parse(args._workspace_id);
    if(workspace!==this.workspace.id) fail('Ambiente invalido.',403);
    const fingerprint=JSON.stringify({name,args});
    return this.transaction(()=>{
      const old=this.db.prepare('SELECT * FROM receipts WHERE request_id=?').get(request);
      if(old) { if(old.actor!==actor||old.fingerprint!==fingerprint) fail('Tentativa divergente.',409); return JSON.parse(old.result); }
      let result;
      if(name==='vanessa_create_lead_and_emit') {
        const c=this.save('vanessa_contacts',{workspace_id:workspace,name:args._name,email:args._email,phone:args._phone});
        const d=this.save('vanessa_deals',{workspace_id:workspace,contact_id:c.id,pipeline_id:args._pipeline_id,stage_id:args._stage_id,name:args._name,value:args._value??0});
        const e=this.all('vanessa_events').find(e=>e.deal_id===d.id);
        result={ok:true,id:d.id,leadId:d.id,eventId:e.id};
      } else if(name==='vanessa_bulk_move_leads_and_emit') {
        const ids=z.array(uuid).min(1).max(100).parse(args._lead_ids),stage=this.relation('vanessa_stages',uuid.parse(args._stage_id));
        if(new Set(ids).size!==ids.length) fail('Selecao duplicada.');
        const deals=ids.map(id=>this.relation('vanessa_deals',id));
        if(deals.some(d=>d.workspace_id!==workspace||d.pipeline_id!==stage.pipeline_id)) fail('Selecao fora do funil.');
        const events=[];
        for(const d of deals) if(d.stage_id!==stage.id) { const before=new Set(this.all('vanessa_events').map(e=>e.id)); this.save('vanessa_deals',{stage_id:stage.id},d); events.push(this.all('vanessa_events').find(e=>e.deal_id===d.id&&!before.has(e.id)).id); }
        // Select new IDs by comparing the event set, independent of UUID ordering.
        result={ok:true,count:ids.length,movedCount:events.length,unchangedCount:ids.length-events.length,eventIds:events};
      } else fail('Operacao nao encontrada.',404);
      this.db.prepare('INSERT INTO receipts VALUES (?,?,?,?)').run(request,actor,fingerprint,JSON.stringify(result));
      return result;
    });
  }
  setupRequired() { return !this.db.prepare('SELECT 1 FROM users LIMIT 1').get(); }
  async createAdmin(email,password) {
    email=z.string().email().max(254).parse(email).toLowerCase(); password=z.string().min(12).max(200).parse(password);
    const salt=randomBytes(16).toString('hex'),hash=Buffer.from(await derive(password,salt,64,{N:32768,r:8,p:1,maxmem:67108864})).toString('hex');
    return this.transaction(()=>{ if(!this.setupRequired()) fail('Configuracao inicial encerrada.',403); const user={id:randomUUID(),email}; this.db.prepare('INSERT INTO users VALUES (?,?,?,?)').run(user.id,email,hash,salt); return user; });
  }
  async login(email,password,ip) {
    if(typeof email!=='string'||typeof password!=='string'||email.length>254||password.length>200) fail('E-mail ou senha invalidos.',401);
    const now=Date.now(); this.db.prepare('DELETE FROM attempts WHERE at<?').run(now-900000);
    if(this.db.prepare('SELECT count(*) AS n FROM attempts WHERE ip=?').get(ip).n>=8) fail('Aguarde 15 minutos antes de tentar novamente.',429);
    this.db.prepare('INSERT INTO attempts VALUES (?,?)').run(ip,now);
    const user=this.db.prepare('SELECT * FROM users WHERE email=?').get(String(email).toLowerCase().trim());
    const hash=Buffer.from(await derive(String(password??'').slice(0,200),user?.salt??'unregistered-user-salt',64,{N:32768,r:8,p:1,maxmem:67108864}));
    if(!user||!timingSafeEqual(hash,Buffer.from(user.password,'hex'))) fail('E-mail ou senha invalidos.',401);
    this.db.prepare('DELETE FROM attempts WHERE ip=?').run(ip);
    return {id:user.id,email:user.email};
  }
  session(token) { if(!/^[a-f0-9]{64}$/.test(token??'')) return null; return this.db.prepare('SELECT users.id,users.email FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.hash=? AND sessions.expires>?').get(sha(token),Date.now())??null; }
  newSession(user) { this.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()); const token=randomBytes(32).toString('hex'); this.db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(sha(token),user.id,Date.now()+7*86400000); return token; }
  logout(token) { this.db.prepare('DELETE FROM sessions WHERE hash=?').run(sha(token??'')); }
  close() { this.db.close(); }
}
