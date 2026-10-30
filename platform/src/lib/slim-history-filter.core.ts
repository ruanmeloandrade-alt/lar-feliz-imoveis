export type HistorySearch={query:string;status:'all'|'confirmed'|'cancelled';from:string;to:string};
export function emptyHistorySearch():HistorySearch{return {query:'',status:'all',from:'',to:''};}
export function applyHistorySearch(input:HistorySearch):Readonly<HistorySearch>{
 if(!input||typeof input.query!=='string'||input.query.length>300||!['all','confirmed','cancelled'].includes(input.status))throw new Error('Filtro de pedidos inválido.');
 for(const date of [input.from,input.to]){if(typeof date!=='string')throw new Error('Data inválida.');if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))||new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date))throw new Error('Informe uma data válida.');}
 if(input.from&&input.to&&input.from>input.to)throw new Error('A data inicial não pode ser posterior à final.');
 return Object.freeze({query:input.query.trim(),status:input.status,from:input.from,to:input.to});
}
