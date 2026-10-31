import { randomUUID } from 'node:crypto';

const origin = 'https://fnuhmypmhcwecziswbat.supabase.co';
const workspace = '2a0e0d29-4e23-47e6-bd9f-30aa8e15e698';
const bucket = 'vanessa-client-gallery';
const validName = /^\d{13}-[a-f0-9-]{36}\.(jpg|png|webp)$/;
const limit = 8 * 1024 * 1024;
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(JSON.stringify(data));}
function headers(){
  if(process.env.SUPABASE_URL !== origin || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw Error('Gallery configuration unavailable');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return {apikey:key,...(key.startsWith('sb_secret_')?{}:{Authorization:'Bearer '+key})};
}
async function storage(path,options={}){
  const response=await fetch(origin+'/storage/v1/'+path,{...options,headers:{...headers(),...options.headers},signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw Error('Gallery storage unavailable');
  return response;
}
async function authorize(req){
  const token=req.headers.authorization;
  if(!/^Bearer [A-Za-z0-9._-]+$/.test(token||''))return false;
  const response=await fetch(origin+'/auth/v1/user',{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY,Authorization:token},signal:AbortSignal.timeout(10000)});
  if(!response.ok)return false;
  const user=await response.json();
  if(!/^[a-f0-9-]{36}$/i.test(user.id||''))return false;
  if(Array.isArray(user.factors)&&user.factors.some(factor=>factor.status==='verified')){
    try{if(JSON.parse(Buffer.from(token.slice(7).split('.')[1],'base64url').toString()).aal!=='aal2')return false;}catch{return false;}
  }
  const params=new URLSearchParams({workspace_id:'eq.'+workspace,user_id:'eq.'+user.id,select:'role,access_expires_at',limit:'1'});
  const member=await fetch(origin+'/rest/v1/workspace_members?'+params,{headers:headers(),signal:AbortSignal.timeout(10000)});
  if(!member.ok)return false;
  const rows=await member.json();
  return Array.isArray(rows)&&rows.some(row=>['owner','admin'].includes(row.role)&&(!row.access_expires_at||Date.parse(row.access_expires_at)>Date.now()));
}
async function body(req,max=limit){
  const parts=[];let bytes=0;
  for await(const chunk of req){bytes+=chunk.length;if(bytes>max){const error=new Error('Arquivo excede o limite.');error.status=413;throw error;}parts.push(chunk);}
  return Buffer.concat(parts);
}
export function imageExtension(bytes,mime){
  if(!['image/jpeg','image/png','image/webp'].includes(mime))return null;
  if(bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'jpg';
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'png';
  if(bytes.length>12&&bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'webp';
  return null;
}
export async function handleClientGallery(req,res,url){
  const path=url.pathname;
  const publicList=path==='/api/public/client-gallery';
  const manage=path==='/api/site-gallery';
  const archive=path==='/api/site-gallery/archive';
  const media=path.startsWith('/api/client-gallery-media/');
  if(!publicList&&!manage&&!archive&&!media)return false;
  try{
    if((manage||archive)&&!await authorize(req)){send(res,403,{error:'Acesso de administração necessário.'});return true;}
    if((publicList||manage)&&req.method==='GET'){
      const response=await storage('object/list/'+bucket,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({prefix:'photos',limit:1000,offset:0,sortBy:{column:'name',order:'asc'}})});
      const rows=await response.json();
      if(!Array.isArray(rows))throw Error('Invalid gallery');
      send(res,200,{photos:rows.filter(row=>row.id&&validName.test(row.name)).map(row=>({name:row.name,src:'/api/client-gallery-media/'+row.name,alt:'Registro com clientes da Vanessa Simoni'}))});
    }else if(media&&['GET','HEAD'].includes(req.method)){
      const name=path.slice('/api/client-gallery-media/'.length);
      if(!validName.test(name)){send(res,404,{error:'Foto não encontrada.'});return true;}
      const response=await fetch(origin+'/storage/v1/object/'+bucket+'/photos/'+name,{method:req.method,headers:headers(),signal:AbortSignal.timeout(30000)});
      if(!response.ok){send(res,response.status===404?404:503,{error:'Foto indisponível.'});return true;}
      const mime=response.headers.get('content-type');
      if(!['image/jpeg','image/png','image/webp'].includes(mime?.split(';')[0]))throw Error('Invalid media');
      res.writeHead(200,{'Content-Type':mime,'Cache-Control':'public, max-age=60','X-Content-Type-Options':'nosniff'});
      if(req.method==='GET'&&response.body)for await(const chunk of response.body){if(res.destroyed)break;res.write(chunk);}
      res.end();
    }else if(manage&&req.method==='POST'){
      if(Number(req.headers['content-length'])>limit){send(res,413,{error:'Use uma imagem de até 8 MB.'});return true;}
      const bytes=await body(req);const mime=String(req.headers['content-type']||'').split(';')[0];const extension=imageExtension(bytes,mime);
      if(!extension){send(res,415,{error:'Envie uma imagem JPG, PNG ou WebP válida.'});return true;}
      const name=String(Date.now())+'-'+randomUUID()+'.'+extension;
      await storage('object/'+bucket+'/photos/'+name,{method:'POST',headers:{'Content-Type':extension==='jpg'?'image/jpeg':'image/'+extension,'x-upsert':'false'},body:bytes});
      send(res,201,{name});
    }else if(archive&&req.method==='POST'){
      let data;try{data=JSON.parse((await body(req,1024)).toString());}catch{send(res,400,{error:'Solicitação inválida.'});return true;}
      if(!validName.test(data?.name)){send(res,400,{error:'Foto inválida.'});return true;}
      await storage('object/move',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({bucketId:bucket,sourceKey:'photos/'+data.name,destinationKey:'archive/'+data.name})});
      send(res,200,{archived:true});
    }else send(res,405,{error:'Método não permitido.'});
  }catch(error){if(!res.headersSent)send(res,error.status||503,{error:error.status===413?'Use uma imagem de até 8 MB.':'Não foi possível atualizar a galeria. Tente novamente.'});else res.destroy();}
  return true;
}
