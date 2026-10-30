import {createClient} from '@supabase/supabase-js';
import {readFile,writeFile,open} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,sep} from 'node:path';

// Credentials arrive only through stdin; no source project is ever contacted.
let input='';for await(const chunk of process.stdin)input+=chunk;
const config=JSON.parse(input);
if(config.url!=='https://fnuhmypmhcwecziswbat.supabase.co')throw Error('Destino nao autorizado');
const client=createClient(config.url,config.functionKey,{auth:{persistSession:false,autoRefreshToken:false}});
const [sourceRoot,manifestPath,outputPath]=process.argv.slice(2);
if(!sourceRoot||!manifestPath||!outputPath)throw Error('Informe origem, manifesto e comprovante privados');
const root=resolve(sourceRoot),seed=JSON.parse(await readFile(manifestPath,'utf8'));
const files=[...new Map(seed.files.map(f=>[f.path,f])).values()],bucket='vanessa-imoveis';
const {data:existing,error:listError}=await client.storage.listBuckets();
if(listError)throw Error('Nao foi possivel consultar buckets');
if(!existing.some(b=>b.id===bucket)){
  const {error}=await client.storage.createBucket(bucket,{public:true,fileSizeLimit:50*1024*1024});
  if(error)throw Error('Bucket Vanessa nao criado: '+error.message);
}
const proof={project:'fnuhmypmhcwecziswbat',files:[],verifiedBytes:0,complete:false};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const file of files){
  const path=resolve(root,file.disk);if(!path.startsWith(root+sep))throw Error('Arquivo fora da origem');
  const fd=await open(path,'r');const parts=[];const fullHash=createHash('sha256');
  try{
    const info=await fd.stat();if(info.size!==file.size)throw Error('Tamanho local divergente');
    for(let offset=0,index=0;offset<info.size;index++){
      const length=Math.min(32*1024*1024,info.size-offset),bytes=Buffer.alloc(length);
      let got=0;while(got<length){const r=await fd.read(bytes,got,length-got,offset+got);if(!r.bytesRead)throw Error('Arquivo incompleto');got+=r.bytesRead;}
      fullHash.update(bytes);const object=`${file.path}/part-${String(index).padStart(3,'0')}`;
      const {error}=await client.storage.from(bucket).upload(object,bytes,{contentType:'application/octet-stream',upsert:false,cacheControl:'3600'});
      if(error&&!/already exists|Duplicate/i.test(error.message))throw Error('Transferencia recusada: '+error.message);
      const {data,error:downloadError}=await client.storage.from(bucket).download(object);
      if(downloadError||!data)throw Error('Arquivo remoto nao confirmado');
      const remote=Buffer.from(await data.arrayBuffer());
      if(remote.length!==length||hash(remote)!==hash(bytes))throw Error('SHA256 remoto divergente');
      parts.push({path:object,size:length});offset+=length;
    }
    if(fullHash.digest('hex')!==file.path.slice(0,64))throw Error('SHA256 original divergente');
  }finally{await fd.close();}
  proof.files.push({...file,cloud:{bucket,parts}});proof.verifiedBytes+=file.size;
  await writeFile(outputPath,JSON.stringify(proof,null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({verifiedFiles:proof.files.length,totalFiles:files.length,verifiedBytes:proof.verifiedBytes}));
}
proof.complete=true;await writeFile(outputPath,JSON.stringify(proof,null,2)+'\n',{mode:0o600});
console.log(JSON.stringify({complete:true,verifiedFiles:proof.files.length,verifiedBytes:proof.verifiedBytes}));
