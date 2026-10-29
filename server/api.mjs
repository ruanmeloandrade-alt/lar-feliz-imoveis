import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile, stat, rm } from 'node:fs/promises';
import { resolve, join, sep } from 'node:path';
import { collections, fail } from './store.mjs';

const response = (res,status,data) => { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}); res.end(JSON.stringify(data)); };
const cookieToken = req => String(req.headers.cookie??'').split(';').map(p=>p.trim()).find(p=>p.startsWith('vanessa_session='))?.slice(16)??'';
const digest = (store,bucket,path,expires) => createHmac('sha256',store.secret).update(JSON.stringify([bucket,path,expires])).digest('hex');
const equal = (a,b) => { const x=Buffer.from(String(a)),y=Buffer.from(String(b)); return x.length===y.length&&timingSafeEqual(x,y); };
async function body(req,limit=512*1024) { const chunks=[]; let size=0; for await(const chunk of req) { size+=chunk.length; if(size>limit) fail('Arquivo ou requisicao muito grande.',413); chunks.push(chunk); } return Buffer.concat(chunks); }
async function json(req) {
  if(!/^application\/json(?:;|$)/i.test(req.headers['content-type']??'')) fail('Formato invalido.',415);
  try {
    const value=JSON.parse((await body(req)).toString('utf8'));
    if(!value||typeof value!=='object'||Array.isArray(value)) fail('JSON invalido.');
    const pending=[[value,0]]; let count=0;
    // Bound collection sizes before schema validation allocates error objects.
    while(pending.length) {
      const [item,depth]=pending.pop();
      if(++count>5000||depth>8) fail('Estrutura muito grande.',413);
      if(item&&typeof item==='object') {
        if(Array.isArray(item)?item.length>500:Object.keys(item).length>60) fail('Colecao muito grande.',413);
        for(const child of Object.values(item)) pending.push([child,depth+1]);
      }
    }
    return value;
  } catch(error) { if(error.status) throw error; fail('JSON invalido.'); }
}
function cleanPath(path) { if(typeof path!=='string'||path.length>500||path.split('/').some(p=>!p||p==='.'||p==='..'||!/^[a-zA-Z0-9_.-]+$/.test(p))) fail('Caminho invalido.'); return path; }

export function createApi(store,{bootstrapToken='',secureCookies=process.env.NODE_ENV==='production'}={}) {
  const sendSession=(res,user)=>{ const token=store.newSession(user); res.setHeader('Set-Cookie',`vanessa_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800${secureCookies?'; Secure':''}`); return {user,session:{user},setupRequired:false}; };
  return async (req,res,url) => {
    if(!url.pathname.startsWith('/api/')) return false;
    try {
      const user=store.session(cookieToken(req));
      const write=!['GET','HEAD'].includes(req.method);
      if(write&&req.headers.origin) { let origin; try { origin=new URL(req.headers.origin); } catch { fail('Origem invalida.',403); } if(origin.host!==req.headers.host) fail('Origem nao autorizada.',403); }
      const path=decodeURIComponent(url.pathname);
      if(path==='/api/auth/session'&&req.method==='GET') { response(res,200,{user,session:user?{user}:null,setupRequired:store.setupRequired()}); return true; }
      if(path==='/api/auth/setup'&&req.method==='POST') {
        const data=await json(req);
        if(!bootstrapToken||bootstrapToken.length<32||!equal(data.token,bootstrapToken)) fail('Chave de configuracao invalida.',403);
        const created=await store.createAdmin(data.email,data.password);
        response(res,201,sendSession(res,created)); return true;
      }
      if(path==='/api/auth/login'&&req.method==='POST') {
        const data=await json(req);
        const logged=await store.login(data.email,data.password,req.socket.remoteAddress??'unknown');
        response(res,200,sendSession(res,logged)); return true;
      }
      if(path==='/api/auth/logout'&&req.method==='POST') { store.logout(cookieToken(req)); res.setHeader('Set-Cookie',`vanessa_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureCookies?'; Secure':''}`); response(res,200,{ok:true}); return true; }
      if(path.startsWith('/api/files/')&&['GET','HEAD'].includes(req.method)) {
        const parts=path.slice('/api/files/'.length).split('/'),bucket=parts.shift(),object=cleanPath(parts.join('/'));
        const file=store.db.prepare('SELECT * FROM files WHERE bucket=? AND path=?').get(bucket,object);
        if(!file) fail('Arquivo nao encontrado.',404);
        const expires=url.searchParams.get('expires')??'',signature=url.searchParams.get('signature')??'';
        const signed=/^\d+$/.test(expires)&&Number(expires)>Date.now()&&equal(signature,digest(store,bucket,object,expires));
        if(!user&&!file.public&&!signed) fail('Acesso negado.',401);
        const disk=resolve(store.dir,file.disk); if(!disk.startsWith(resolve(store.dir)+sep)) fail('Arquivo invalido.',404);
        const info=await stat(disk); let start=0,end=info.size-1,status=200;
        if(req.headers.range) { const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range); if(!range) fail('Intervalo invalido.',416); if(!range[1]) { start=Math.max(0,info.size-Number(range[2])); } else { start=Number(range[1]); if(range[2]) end=Math.min(end,Number(range[2])); } if(start>end||start>=info.size) fail('Intervalo invalido.',416); status=206; }
        const headers={'Content-Type':file.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':file.public?'public, max-age=3600':'private, no-store','X-Content-Type-Options':'nosniff'};
        if(status===206) headers['Content-Range']=`bytes ${start}-${end}/${info.size}`;
        if(file.mime==='application/pdf'&&!file.public) headers['Content-Disposition']='attachment; filename="documento.pdf"';
        res.writeHead(status,headers); if(req.method==='HEAD') res.end(); else createReadStream(disk,{start,end}).on('error',()=>res.destroy()).pipe(res); return true;
      }
      if(path.startsWith('/api/upload/')&&req.method==='POST') {
        if(!user) fail('Acesso negado.',401);
        const bucket=path.slice('/api/upload/'.length),object=cleanPath(url.searchParams.get('path'));
        if(!['property-images','property-pdfs','vanessa-documents'].includes(bucket)||!object.startsWith(`${user.id}/`)) fail('Destino invalido.',403);
        const mime=String(req.headers['content-type']??'').split(';')[0];
        const allowed=bucket==='property-images'?['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','video/quicktime']:['application/pdf'];
        if(!allowed.includes(mime)) fail('Tipo de arquivo nao permitido.',415);
        if(store.db.prepare('SELECT 1 FROM files WHERE bucket=? AND path=?').get(bucket,object)) fail('Arquivo ja existe.',409);
        const bytes=await body(req,bucket==='vanessa-documents'?20*1024*1024:150*1024*1024);
        if(!bytes.length||(mime==='application/pdf'&&!bytes.subarray(0,5).equals(Buffer.from('%PDF-')))) fail('Arquivo invalido.');
        await mkdir(join(store.dir,'media'),{recursive:true}); const disk=`media/${randomUUID()}`;
        await writeFile(join(store.dir,disk),bytes,{flag:'wx',mode:0o600});
        try { store.db.prepare('INSERT INTO files VALUES (?,?,?,?,?,0)').run(bucket,object,disk,mime,bytes.length); } catch(error) { await rm(join(store.dir,disk)); throw error; }
        response(res,201,{data:{path:object},error:null}); return true;
      }
      if(path==='/api/sign'&&req.method==='POST') {
        if(!user) fail('Acesso negado.',401); const data=await json(req),object=cleanPath(data.path);
        if(!store.db.prepare('SELECT 1 FROM files WHERE bucket=? AND path=?').get(data.bucket,object)) fail('Arquivo nao encontrado.',404);
        const max=data.bucket==='vanessa-documents'?300:5*365*86400,seconds=Math.min(max,Math.max(1,Number(data.expires)||300));
        const expires=String(Date.now()+seconds*1000),signature=digest(store,data.bucket,object,expires);
        response(res,200,{data:{signedUrl:`/api/files/${data.bucket}/${object.split('/').map(encodeURIComponent).join('/')}?expires=${expires}&signature=${signature}`},error:null}); return true;
      }
      if(path.startsWith('/api/rpc/')&&req.method==='POST') {
        if(!user) fail('Acesso negado.',401); const args=await json(req);
        response(res,200,{data:store.rpc(path.slice('/api/rpc/'.length),args,user.id),error:null}); return true;
      }
      if(path.startsWith('/api/records/')) {
        const collection=path.slice('/api/records/'.length); if(!collections.has(collection)) fail('Colecao nao encontrada.',404);
        let filters,orders; try { filters=JSON.parse(url.searchParams.get('filters')??'[]'); orders=JSON.parse(url.searchParams.get('orders')??'[]'); } catch { fail('Filtro invalido.'); }
        if(!Array.isArray(filters)||!Array.isArray(orders)||filters.length>20||orders.length>5) fail('Filtro invalido.');
        const match=row=>filters.every(f=>Array.isArray(f)&&f.length===2&&Object.hasOwn(row,f[0])&&row[f[0]]===f[1]);
        if(req.method==='GET') {
          if(!user&&collection!=='properties') fail('Acesso negado.',401);
          let rows=collection==='user_roles'?[{id:user.id,user_id:user.id,role:'admin'}]:store.all(collection);
          if(!user) rows=rows.filter(r=>r.published===true);
          rows=rows.filter(match);
          for(const order of [...orders].reverse()) { if(!order||typeof order.field!=='string') fail('Ordenacao invalida.'); rows.sort((a,b)=>{const x=a[order.field],y=b[order.field]; return (x===y?0:x==null?-1:y==null?1:x<y?-1:1)*(order.ascending===false?-1:1);}); }
          const start=Number(url.searchParams.get('start')??0),limit=Number(url.searchParams.get('limit')??500);
          if(!Number.isSafeInteger(start)||start<0||!Number.isSafeInteger(limit)||limit<1||limit>500) fail('Paginacao invalida.');
          const fields=url.searchParams.get('select')??'*'; const data=rows.slice(start,start+limit).map(r=>fields==='*'?r:Object.fromEntries(fields.split(',').map(f=>[f,r[f]])));
          response(res,200,{data,error:null,count:rows.length}); return true;
        }
        if(!user&&!(collection==='leads'&&req.method==='POST')) fail('Acesso negado.',401);
        if(!['POST','PATCH'].includes(req.method)) fail('Operacao nao permitida.',405);
        const input=await json(req);
        const data=store.transaction(()=>{
          if(req.method==='POST') return [store.save(collection,input)];
          if(!filters.some(f=>f[0]==='id'&&typeof f[1]==='string')) fail('Edicao exige um identificador.');
          return store.all(collection).filter(match).map(row=>store.save(collection,input,row));
        });
        response(res,req.method==='POST'?201:200,{data:user?data:[],error:null}); return true;
      }
      fail('Rota nao encontrada.',404);
    } catch(error) { const status=error.status??(error.name==='ZodError'?400:500); if(status===500) console.error('API failure:',error.message); response(res,status,{data:null,error:{code:error.code??'REQUEST_FAILED',message:status===500?'Nao foi possivel concluir a operacao.':error.message}}); }
    return true;
  };
}
