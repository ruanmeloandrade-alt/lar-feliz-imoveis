import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const url=new URL('src/legacy/crm.automacoes.legacy.tsx',root);
let code=readFileSync(url,'utf8');const mark='// SLIM_BOT_METRICS_V1';
if(!code.includes(mark)){
 function replace(a,b){if(code.split(a).length!==2)throw new Error('Bot metrics anchor changed: '+a);code=code.replace(a,()=>b);}
 replace('import { createFileRoute, Link, useRouter }',`import {useSlimAutomationMetrics,slimBotMetric} from "@/hooks/use-slim-automation-metrics";\nimport { createFileRoute, Link, useRouter }`);
 replace('function AutomacoesPage() {','function AutomacoesPage() {\n const liveBotMetrics=useSlimAutomationMetrics(null,false);');
 replace('{b.conversao ?? 0}%','{slimBotMetric(liveBotMetrics.data,b.id,"conversionRate",liveBotMetrics.error)}');
 replace('{b.totalLancado ?? 0}','{slimBotMetric(liveBotMetrics.data,b.id,"launched",liveBotMetrics.error)}');
 replace('{b.sessoesAtivas ?? 0}','{slimBotMetric(liveBotMetrics.data,b.id,"activeNow",liveBotMetrics.error)}');
 replace('Gerencie seus bots sem código. Clique para editar fluxos, gatilhos e integrações.','Gerencie seus bots sem código. Clique para editar fluxos, gatilhos e integrações. Métricas de todo o histórico, atualizadas a cada 10 segundos.');
 const listStart=code.indexOf('Listagem de Salesbots');
 const tableStart=code.indexOf('        <div className="overflow-x-auto">',listStart);
 if(listStart<0||tableStart<listStart)throw new Error('Bot listing table anchor missing');
 code=code.slice(0,tableStart)+'        {liveBotMetrics.error && <p role="alert" className="px-5 py-3 text-xs text-destructive">Métricas indisponíveis. Os valores não foram substituídos por zeros.</p>}\n'+code.slice(tableStart);
 writeFileSync(url,mark+'\n'+code);
}
console.log('[Slim metrics] Listagem vinculada às execuções reais; grafo e salvamento dos bots preservados.');
