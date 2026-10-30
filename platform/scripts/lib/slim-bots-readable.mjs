
const clone=x=>JSON.parse(JSON.stringify(x));
export function outgoing(b){
 return [...new Set([b.next_block_id,b.config.falseNextBlockId,...['roleta','condicoes','pausas','botoes'].flatMap(k=>(b.config[k]||[]).map(r=>r.nextBlockId))].filter(Boolean))];
}
function messageTerms(value){
 if(value.includes('[Nn][ãa]o (me')){
  const terms=[];
  for(const no of ['não','nao']){
   for(const verb of ['mande','envie','chame'])terms.push(no+' me '+verb);
   for(const tail of ['mais mensagens','mais contato','receber mensagens'])terms.push(no+' quero '+tail);
  }
  terms.push('pare de mandar','pare de enviar');
  for(const verb of ['remova','remover'])for(const owner of ['meu','o meu'])terms.push(verb+' '+owner+' contato');
  return [...terms.map(valor=>({tipo:'contem',valor})),{tipo:'palavra',valor:'sair'}];
 }
 if(value.includes('[Rr]ea[çc][ãa]o')){
  return ['reação','reacão','reaçao','reacao','efeito colateral','mal-estar','mal estar','falta de ar','dose','dosagem','prescrição','prescricão','prescriçao','prescricao'].map(valor=>({tipo:'contem',valor}));
 }
 if(value.includes('[Ff]alar (com|para)')){
  const terms=[];
  for(const prep of ['com','para'])for(const article of ['','um ','uma ','o ','a '])for(const who of ['humano','pessoa','atendente','vendedor'])terms.push('falar '+prep+' '+article+who);
  terms.push('atendimento humano');
  for(const article of ['','um ','uma '])for(const who of ['atendente','vendedor'])terms.push('quero '+article+who);
  return terms.map(valor=>({tipo:'contem',valor}));
 }
 if(value==='([Hh]umano|[Vv]endedor|[Aa]tendente)')return ['humano','vendedor','atendente'].map(valor=>({tipo:'contem',valor}));
 if(value.startsWith('([Pp]re[çc]o|')){
  const terms=['preço','preco','valor','comprar'];
  if(value.includes('[Oo]r[çc]amento'))terms.push('orçamento','orcamento');
  if(value.includes('[Cc]ondi[çc][õo]es'))terms.push('condições','condicões','condiçoes','condicoes');
  return terms.map(valor=>({tipo:'contem',valor}));
 }
 throw Error('Mensagem não catalogada: '+value);
}
function exactValues(value){
 if(value==='^[Nn][ãa]o contatar$')return ['Não contatar','Nao contatar','não contatar','nao contatar'];
 if(!value.startsWith('^')||!value.endsWith('$'))throw Error('Campo sem igualdade: '+value);
 let body=value.slice(1,-1);
 if(body.startsWith('(')&&body.endsWith(')'))body=body.slice(1,-1);
 const values=body.split('|');
 if(values.some(v=>/[\[\]()*+?^$\\]/.test(v)))throw Error('Campo não catalogado: '+value);
 return values;
}
export function simplify(bot){
 const out={...clone(bot),blocks:[]};let converted=0;
 for(const original of bot.blocks){
  const b=clone(original);delete b.salesbot_id;delete b.workspace_id;
  if(!(b.config.roleta||[]).some(r=>r.tipo==='regex')){out.blocks.push(b);continue;}
  if(b.type!=='validacao')throw Error('Tipo com regex inesperado');
  const rules=[];
  for(const r of b.config.roleta){
   if(r.alvo==='campo'&&r.tipo==='regex'){
    converted++;
    const values=exactValues(r.valor);
    rules.push({...r,tipo:values.length===1?'igual':'igual-lista',valor:values.join('\n')});
   }else if(r.alvo==='tag'){
    rules.push(r);
   }else if(r.alvo==='mensagem'&&r.tipo==='regex'){
    converted++;
    const terms=messageTerms(r.valor);
    rules.push({...r,tipo:'contem-lista',valor:terms.filter(t=>t.tipo==='contem').map(t=>t.valor).join('\n')});
    if(terms.some(t=>t.valor==='sair'))rules.push({...r,id:r.id+'-sair',label:'Resposta é sair',tipo:'resposta-igual',valor:'sair'});
   }else throw Error('Regra não catalogada: '+JSON.stringify(r));
  }
  b.config.roleta=rules;
  out.blocks.push(b);
 }
 out.convertedRegex=converted;return out;
}
export function estimateHeight(b){
 const c=b.config;
 if(b.type==='validacao')return 250+(c.roleta||[]).reduce((n,r)=>n+(['igual-lista','contem-lista'].includes(r.tipo)?300:190),0);
 if(b.type==='condicao')return 230+(c.condicoes?.length||0)*180;
 if(b.type==='enviar-mensagem')return 530+Math.ceil((c.texto||'').length/36)*16+(c.botoes?.length||0)*60+(c.mediaItems?.length||0)*160;
 if(b.type==='pausar')return 260+(c.pausas?.length||1)*200;
 if(b.type==='msg-interna')return 500+Math.ceil((c.texto||'').length/36)*16;
 if(b.type==='iniciar-ia')return 520;
 if(b.type==='encerrar-bot')return 250+(c.encerrarAcoes?.length||0)*150;
 if(b.type==='acao')return 420;
 return 360;
}
export function layout(bot,measured={}){
 const byId=new Map(bot.blocks.map(b=>[b.id,b]));
 const ind=new Map(bot.blocks.map(b=>[b.id,0]));
 const parents=new Map(bot.blocks.map(b=>[b.id,[]]));
 for(const b of bot.blocks)for(const d of outgoing(b)){
  if(!byId.has(d))throw Error('Destino ausente '+d);
  ind.set(d,ind.get(d)+1);parents.get(d).push(b.id);
 }
 const start=bot.blocks.find(b=>b.config.isStartBlock)||bot.blocks[0];
 let q=bot.blocks.filter(b=>!ind.get(b.id)).sort((a,b)=>(a===start?-1:b===start?1:0)).map(b=>b.id);
 const rank=new Map(q.map(id=>[id,0]));let visited=0;
 for(let i=0;i<q.length;i++){
  const id=q[i];visited++;
  for(const d of outgoing(byId.get(id))){
   rank.set(d,Math.max(rank.get(d)||0,rank.get(id)+1));
   ind.set(d,ind.get(d)-1);if(ind.get(d)===0)q.push(d);
  }
 }
 if(visited!==bot.blocks.length)throw Error('Ciclo no grafo '+bot.name);
 const layers=new Map();
 for(const b of bot.blocks){const r=rank.get(b.id);if(!layers.has(r))layers.set(r,[]);layers.get(r).push(b);}
 const centers=new Map();
 for(const [r,blocks] of [...layers].sort((a,b)=>a[0]-b[0])){
  const preferred=b=>{
   const ps=parents.get(b.id);
   if(!ps.length)return b===start?0:100000;
   return ps.reduce((n,p)=>n+(centers.get(p)||0),0)/ps.length;
  };
  blocks.sort((a,b)=>preferred(a)-preferred(b)||a.id.localeCompare(b.id));
  let y=180;
  for(const b of blocks){
   const h=Math.max(measured[b.id]||0,estimateHeight(b));
   b.position_x=560+r*580;b.position_y=Math.round(Math.max(y,preferred(b)-h/2));
   centers.set(b.id,b.position_y+h/2);y=b.position_y+h+180;
  }
 }
 bot.settings={...bot.settings,startPosition:{x:80,y:start.position_y}};
 return bot;
}
