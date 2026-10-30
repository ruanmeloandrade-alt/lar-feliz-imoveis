import {useQuery} from '@tanstack/react-query';
import {useServerFn} from '@tanstack/react-start';
import {getSlimAutomationMetrics,getSlimMetricsWorkspace} from '@/lib/slim-automation-metrics.functions';
export function useSlimAutomationMetrics(days:number|null=null,details=false){
 const loadWorkspace=useServerFn(getSlimMetricsWorkspace);const load=useServerFn(getSlimAutomationMetrics);
 const ws=useQuery({queryKey:['slim-metrics-workspace'],queryFn:()=>loadWorkspace(),staleTime:0,refetchInterval:10000,refetchIntervalInBackground:false,retry:1});
 const q=useQuery({queryKey:['slim-automation-metrics',ws.data?.id,days,details],queryFn:()=>load({data:{workspaceId:ws.data!.id,days,details}}),enabled:Boolean(ws.data?.id)&&!ws.error,staleTime:0,refetchInterval:10000,refetchIntervalInBackground:false,retry:1});
 return {...q,error:ws.error||q.error,data:ws.error||q.error?undefined:q.data,isLoading:ws.isLoading||q.isLoading,refetch:async()=>{await ws.refetch();return q.refetch();}};
}
export function slimBotMetric(data:any,id:string,key:'launched'|'activeNow'|'conversionRate',error?:unknown):string{
 if(error)return 'Indisponível';if(!data)return '…';const row=data.bots.find((r:any)=>r.id===id||r.localId===id);
 if(!row||row[key]===null||row[key]===undefined)return '—';
 return key==='conversionRate'?`${Number(row[key]).toLocaleString('pt-BR',{maximumFractionDigits:2})}%`:Number(row[key]).toLocaleString('pt-BR');
}
