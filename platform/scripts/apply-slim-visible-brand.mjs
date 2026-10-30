import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {transformVisibleBrand} from './slim-visible-brand.core.mjs';
const root=fileURLToPath(new URL('../src',import.meta.url));
const plans=[];
function walk(path){for(const e of readdirSync(path,{withFileTypes:true})){const full=join(path,e.name);if(e.isDirectory())walk(full);else if(/\.(ts|tsx)$/.test(e.name)&&!/(\.test\.|\.spec\.|\.d\.ts$|routeTree\.gen)/.test(e.name)){const before=readFileSync(full,'utf8');if(!/mkton/i.test(before))continue;const result=transformVisibleBrand(before,full);if(result.edits)plans.push({full,...result});}}}
walk(root);for(const p of plans)writeFileSync(p.full,p.source);
console.log(`[Slim marca] ${plans.reduce((n,p)=>n+p.edits,0)} textos visíveis em ${plans.length} arquivos revisados. URLs, chaves, identificadores e contratos não foram renomeados.`);
