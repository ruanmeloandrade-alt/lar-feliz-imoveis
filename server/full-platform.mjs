import { request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { publicPropertyExtras } from './property-metadata.mjs';
import { handleClientGallery } from './client-gallery.mjs';

const project='fnuhmypmhcwecziswbat';
const origin=`https://${project}.supabase.co`;
const port=Number(process.env.VANESSA_INTERNAL_PORT||8090);
function publicHeaders(){
  if(process.env.SUPABASE_URL!==origin)throw Error('Banco exclusivo da Vanessa obrigatório.');
  return {apikey:process.env.SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
}
async function rpc(name,body={}){
  const result=await fetch(`${origin}/rest/v1/rpc/${name}`,{method:'POST',headers:publicHeaders(),body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
  if(!result.ok)throw Error('Catálogo indisponível.');
  return result.json();
}

async function publicCatalog(){
  const rows=await rpc('vanessa_catalog');
  if(!Array.isArray(rows))throw Error('Catálogo indisponível.');
  if(!rows.length)return rows;
  const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!serviceKey)throw Error('Catálogo indisponível.');
  const headers={...publicHeaders(),apikey:serviceKey,...(serviceKey.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+serviceKey})};
  const details=new Map();
  for(let index=0;index<rows.length;index+=100){
    const ids=rows.slice(index,index+100).map(row=>row.id);
    if(ids.some(id=>typeof id!=='string'||! /^[a-f0-9-]{36}$/i.test(id)))throw Error('Catálogo inválido.');
    const params=new URLSearchParams({workspace_id:'eq.2a0e0d29-4e23-47e6-bd9f-30aa8e15e698',active:'eq.true',select:'id,public_property',id:'in.('+ids.join(',')+')'});
    const response=await fetch(origin+'/rest/v1/products?'+params,{headers,signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('Catálogo indisponível.');
    const metadata=await response.json();
    if(!Array.isArray(metadata))throw Error('Catálogo indisponível.');
    for(const row of metadata)details.set(row.id,row.public_property);
  }
  return rows.map(row=>({...row,...publicPropertyExtras(details.get(row.id))}));
}

function json(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(JSON.stringify(value));}

async function media(req,res,disk){
  if(!/^[a-f0-9]{64}\.[a-zA-Z0-9]+$/.test(disk)){res.writeHead(404).end();return;}
  const meta=await rpc('vanessa_public_file',{p_disk:disk});
  if(!meta){res.writeHead(404).end();return;}
  const total=Number(meta.size);let start=0,end=total-1,status=200;
  if(req.headers.range){
    const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if(!match||(!match[1]&&!match[2])){res.writeHead(416,{'Content-Range':`bytes */${total}`}).end();return;}
    if(!match[1])start=Math.max(0,total-Number(match[2]));
    else {start=Number(match[1]);if(match[2])end=Math.min(end,Number(match[2]));}
    if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=total){res.writeHead(416,{'Content-Range':`bytes */${total}`}).end();return;}
    status=206;
  }
  res.writeHead(status,{'Content-Type':meta.mime,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Cache-Control':'public, max-age=31536000, immutable',...(status===206?{'Content-Range':`bytes ${start}-${end}/${total}`}:{})});
  if(req.method==='HEAD'){res.end();return;}
  let offset=0;
  for(const part of meta.cloud.parts){
    const partEnd=offset+part.size-1;
    if(partEnd>=start&&offset<=end){
      if(res.destroyed)return;
      const left=Math.max(0,start-offset),right=Math.min(part.size-1,end-offset);
      const path=part.path.split('/').map(encodeURIComponent).join('/');
      const response=await fetch(`${origin}/storage/v1/object/public/${meta.cloud.bucket}/${path}`,{signal:AbortSignal.timeout(120000)});
      if(!response.ok)throw Error('Arquivo indisponível.');
      // Storage/CDN may ignore Range. Slice the verified part explicitly.
      let consumed=0;
      for await(const chunk of response.body){
        const from=Math.max(0,left-consumed),to=Math.min(chunk.length,right-consumed+1);
        if(to>from&&!res.destroyed&&!res.write(chunk.subarray(from,to)))await once(res,'drain');
        consumed+=chunk.length;
        if(consumed>right){await response.body?.cancel?.().catch(()=>{});break;}
      }
    }
    offset+=part.size;if(offset>end)break;
  }
  res.end();
}

function proxy(req,res,path){
  const headers={...req.headers,host:req.headers.host,'accept-encoding':'identity','x-forwarded-host':req.headers.host,'x-forwarded-proto':req.headers['x-forwarded-proto']||'https'};
  const upstream=httpRequest({hostname:'127.0.0.1',port,path,method:req.method,headers},incoming=>{
    const out={...incoming.headers};delete out['content-security-policy'];
    if(String(out['content-type']).includes('text/html')){
      const nonce=randomBytes(20).toString('base64');const chunks=[];let size=0;
      incoming.on('data',chunk=>{size+=chunk.length;if(size>8*1024*1024){incoming.destroy();res.destroy();}else chunks.push(chunk);});
      incoming.on('end',()=>{
        const body=Buffer.from(Buffer.concat(chunks).toString('utf8').replace(/<script\b/g,`<script nonce="${nonce}"`));
        delete out['content-length'];delete out.etag;
        out['Content-Security-Policy']=`default-src 'self'; script-src 'self' 'nonce-${nonce}'; connect-src 'self' ${origin} wss://${project}.supabase.co; img-src 'self' data: blob: ${origin}; media-src 'self' blob: ${origin}; frame-src 'self' ${origin} https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; worker-src 'self' blob:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`;
        out['Content-Length']=body.length;out['Cache-Control']='no-store';res.writeHead(incoming.statusCode,out).end(req.method==='HEAD'?undefined:body);
      });
    }else {res.writeHead(incoming.statusCode,out);incoming.pipe(res);}
  });
  upstream.on('error',()=>{if(!res.headersSent)json(res,503,{error:{message:'Sistema indisponível.'}});else res.destroy();});
  req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
}

export function createFullPlatform(){
  return async(req,res,url)=>{
    try{
      const path=url.pathname;
      if(await handleClientGallery(req,res,url))return true;
      if(String(req.headers.host??'').split(':')[0].toLowerCase()==='corretoravanessasimoni.com'){res.writeHead(308,{Location:'https://www.corretoravanessasimoni.com'+(req.url.startsWith('/')?req.url:'/'),'Cache-Control':'no-store'}).end();return true;}
      if(/^\/(quiz|blog|precos|parceiros|afiliados|checkout|checkout-retorno|completa)(\/|$)/.test(path)||(path==='/auth'&&url.searchParams.get('mode')==='signup')){res.writeHead(404).end();return true;}
      if(path.startsWith('/brand/')&&!['/brand/vanessa.css','/brand/vanessa.jpg'].includes(path)){res.writeHead(404).end();return true;}
      if(path.startsWith('/system-assets/')&&!path.startsWith('/system-assets/assets/')){res.writeHead(404).end();return true;}
      if(path==='/healthz'){
        const health=await fetch(`http://127.0.0.1:${port}/api/health`,{signal:AbortSignal.timeout(5000)});
        json(res,health.ok?200:503,{status:health.ok?'ok':'unavailable',service:'vanessa-complete-platform',backend:'supabase-exclusive'});return true;
      }
      if(path==='/api/records/properties'&&['GET','HEAD'].includes(req.method)){
        let rows=await publicCatalog();const id=url.searchParams.get('id');if(id)rows=rows.filter(r=>r.id===id);
        json(res,200,{data:rows,error:null});return true;
      }
      if(path.startsWith('/api/listing-media/')&&['GET','HEAD'].includes(req.method)){
        const key=path.slice('/api/listing-media/'.length);
        if(!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|pdf)$/.test(key)){res.writeHead(404).end();return true;}
        const response=await fetch(origin+'/storage/v1/object/public/vanessa-listings/'+key,{method:req.method,headers:req.headers.range?{Range:req.headers.range}:{},signal:AbortSignal.timeout(30000)});
        const headers={};for(const h of ['content-type','content-length','content-range','accept-ranges','cache-control'])if(response.headers.has(h))headers[h]=response.headers.get(h);
        res.writeHead(response.status,headers);if(req.method==='HEAD'){res.end();return true;}
        if(response.body)for await(const chunk of response.body){if(res.destroyed)break;if(!res.write(chunk))await once(res,'drain');}
        res.end();return true;
      }
      if(path.startsWith('/api/files/public/')&&['GET','HEAD'].includes(req.method)){await media(req,res,path.slice('/api/files/public/'.length));return true;}
      if(path==='/api/records/leads'&&req.method==='POST'){proxy(req,res,'/api/public/vanessa-lead');return true;}
      if(path==='/plataforma'||path.startsWith('/plataforma/')){res.writeHead(302,{Location:'/admin','Cache-Control':'no-store'}).end();return true;}
      if(path==='/login'||path.startsWith('/login/')){res.writeHead(404).end();return true;}
      // The root sales page and its static assets remain the public application.
      if((/\.[a-zA-Z0-9]+$/.test(path)&&!path.startsWith('/system-assets/')&&!path.startsWith('/brand/')&&!path.startsWith('/api/')&&!path.startsWith('/_serverFn/'))||path==='/'||path==='/index.html'||path.startsWith('/assets/')||path.startsWith('/uploads/')||['/favicon.ico','/robots.txt','/sitemap.xml'].includes(path))return false;
      proxy(req,res,path.startsWith('/system-assets/')?req.url.replace('/system-assets/','/'):req.url);return true;
    }catch{if(!res.headersSent)json(res,503,{error:{message:'Serviço temporariamente indisponível.'}});else res.destroy();return true;}
  };
}

export function startFullPlatform(){
  publicHeaders();
  const child=spawn(process.execPath,[fileURLToPath(new URL('../platform/.output/server/index.mjs',import.meta.url))],{cwd:fileURLToPath(new URL('../platform/',import.meta.url)),env:{...process.env,PORT:String(port),NITRO_PORT:String(port),HOST:'127.0.0.1',NITRO_HOST:'127.0.0.1'},stdio:['ignore','inherit','inherit'],windowsHide:true});
  return child;
}
