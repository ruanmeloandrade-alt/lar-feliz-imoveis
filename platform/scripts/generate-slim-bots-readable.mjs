
import {readFileSync,writeFileSync} from 'node:fs';
import {simplify,layout} from './lib/slim-bots-readable.mjs';
const before=JSON.parse(readFileSync(new URL('./fixtures/slim-all-bots-before-readable.json',import.meta.url),'utf8'));
const heights=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):{};
const after=before.map(b=>layout(simplify(b),heights[b.id]||{}));
const snapshot=after.map(({blocks,convertedRegex,...bot})=>({...bot,blocks}));
writeFileSync(new URL('./fixtures/slim-all-bots-before-readable.json',import.meta.url),JSON.stringify(before,null,2));
writeFileSync(new URL('./fixtures/slim-all-bots-readable.json',import.meta.url),JSON.stringify(snapshot,null,2));
const calls=after.map((b,i)=>{
const source=before.find(x=>x.id===b.id);
return 'select public.salesbot_save_graph_v2('+[
 "'"+b.local_id+"'",source.revision,
 "array["+source.blocks.map(bl=>"'"+bl.local_id+"'").join(',')+"]",
 "$settings$"+JSON.stringify(b.settings)+"$settings$::jsonb",
 "$graph$"+JSON.stringify(b.blocks)+"$graph$::jsonb",
 "'91bf2fd5-069d-4aac-8997-"+String(i+1).padStart(12,'0')+"'::uuid",
 "'codex:todos-bots-regras-simples-fluxograma'"
].join(',\n')+');';
});
const sql="begin;\nselect set_config('request.jwt.claim.sub','faaad2a3-52ef-41a6-846b-ee1f64f3ed38',true);\n"+calls.join('\n')+"\ncommit;\n";
writeFileSync(new URL('./operations/slim-all-bots-readable-20261019.sql',import.meta.url),sql);
console.log(JSON.stringify(after.map(b=>({name:b.name,blocks:b.blocks.length,removed:b.convertedRegex,width:Math.max(...b.blocks.map(bl=>bl.position_x))+320,height:Math.max(...b.blocks.map(bl=>bl.position_y))})),null,2));
