type Obj=Record<string,unknown>;
function stable(v:unknown):string{if(Array.isArray(v))return '['+v.map(stable).join(',')+']';if(v&&typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+stable((v as Obj)[k])).join(',')+'}';return JSON.stringify(v)??'null';}
/** A lost create response must not authorize overwriting a later edit with an old form. */
export function recoverUnchangedGroupCreation(row:Obj,payload:Obj,actorId:string):{id:string;updatedAt:string;recovered:true}{
 if(row.created_by!==actorId||stable(row.creation_payload)!==stable(payload))throw new Error('Esta tentativa já criou um agente com outra versão ou operador. Reabra o cadastro na lista.');
 const current=Object.fromEntries(Object.keys(payload).map(k=>[k,row[k]]));
 if(stable(current)!==stable(payload))throw new Error('O agente foi criado e depois alterado. Reabra a versão atual antes de salvar novamente.');
 if(typeof row.id!=='string'||typeof row.updated_at!=='string')throw new Error('A referência da criação não pôde ser confirmada.');
 return {id:row.id,updatedAt:row.updated_at,recovered:true};
}
