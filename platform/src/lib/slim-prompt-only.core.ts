type ObjectValue=Record<string,unknown>;
function object(value:unknown):ObjectValue{return value&&typeof value==='object'&&!Array.isArray(value)?value as ObjectValue:{};}
/** Effective runtime view only. The stored tree and historical runs are never mutated. */
export function promptRuntimeMetadata(value:unknown):ObjectValue{
 const source=object(value),result={...source};
 delete result.objective_tree;
 result.settings={...object(source.settings),mode:'prompt'};
 return result;
}
export function projectPromptAgent<T extends {metadata?:unknown}>(agent:T|null):T|null{
 return agent?{...agent,metadata:promptRuntimeMetadata(agent.metadata)}:null;
}
/** Merge a partial prompt-editor save while retaining archived trees and other settings. */
export function mergePromptMetadata(previous:unknown,patch:unknown):ObjectValue{
 const before=object(previous),incoming={...object(patch)};
 delete incoming.objective_tree;
 return {...before,...incoming,settings:{...object(before.settings),...object(incoming.settings),mode:'prompt'}};
}
export function promptReadinessError(prompt:unknown):string|null{
 if(typeof prompt!=='string'||!prompt.trim())return 'Preencha e salve o prompt de atendimento do agente. O fluxo de objetivos está desativado.';
 if(prompt.length>20000)return 'O prompt de atendimento excede o limite de 20.000 caracteres.';
 return null;
}
export function isLegacyObjectiveAgent(metadata:unknown):boolean{
 return object(object(metadata).settings).mode==='objetivos';
}
