import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
// Source-only group-agent consumer audit. Excludes frozen billing/Cora and never reads credentials or business data.
const root=fileURLToPath(new URL('../',import.meta.url)),matches=[];
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){if(entry.name.startsWith('.')||/cora/i.test(entry.name)||entry.name==='billing')continue;const name=path.join(dir,entry.name);if(entry.isDirectory())walk(name);else if(/\.(tsx?|mjs)$/.test(entry.name)){const lines=fs.readFileSync(name,'utf8').split('\n');for(let i=0;i<lines.length;i++)if(/\b(group_ai_agents|group_agent_runs|group_agent_sessions)\b/.test(lines[i]))matches.push({path:path.relative(root,name).split(path.sep).join('/'),line:i+1,symbols:[...new Set(lines[i].match(/\b(group_ai_agents|group_agent_runs|group_agent_sessions)\b/g))]});}}}
walk(path.join(root,'src'));const edge=path.join(root,'supabase/functions/saude-slim-core');if(fs.existsSync(edge))walk(edge);
console.log('[GROUP-AGENT-READERS] '+JSON.stringify(matches));
if(!matches.some(m=>m.path==='src/lib/whatsapp-groups.functions.legacy.ts'))throw new Error('Group-agent source consumers missing.');
