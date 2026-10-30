import fs from 'node:fs';
const root=new URL('../',import.meta.url),plans=[];
function patch(path,mark,replacements){let s=fs.readFileSync(new URL(path,root),'utf8');if(s.includes(mark))return;for(const[a,b]of replacements){if(s.split(a).length!==2)throw new Error('Receipt UI anchor changed: '+path+' '+a.slice(0,70));s=s.replace(a,()=>b);}plans.push([path,s+'\n'+mark+'\n']);}
patch('src/components/erp/SlimErpWorkspace.tsx','// SLIM_RECEIPT_DISPATCH_V1',[
 ["import {SlimOrderHistory} from './SlimOrderHistory';","import {SlimOrderHistory} from './SlimOrderHistory';\nimport {SlimReceiptDispatch} from './SlimReceiptDispatch';"],
 ['<p className="text-xs text-muted-foreground">O documento permanece disponível pelo histórico. Nenhuma mensagem de WhatsApp é enviada automaticamente.</p>','<p className="text-xs text-muted-foreground">O documento permanece disponível pelo histórico. Nenhuma mensagem de WhatsApp é enviada automaticamente.</p>{pdf.status===\'confirmed\'&&<SlimReceiptDispatch key={`${workspaceId}:${pdf.orderId}:${actorId}`} workspaceId={workspaceId} orderId={pdf.orderId} actorId={actorId}/>}'],
]);
patch('src/components/erp/SlimReceiptDispatch.tsx','// SLIM_RECEIPT_UI_IDENTITY_V1',[
 ['({workspaceId,orderId}:{workspaceId:string;orderId:string})','({workspaceId,orderId,actorId}:{workspaceId:string;orderId:string;actorId:string})'],
 ["['slim-receipt-offer',workspaceId,orderId]","['slim-receipt-offer',workspaceId,orderId,actorId]"],
 ["const lock=useRef(false)","const [localBlocked,setLocalBlocked]=useState(false);\n const lock=useRef(false)"],
 ['const offer=q.data;','const offer=q.data?.actorId===actorId?q.data:undefined;'],
 ["catch(e){setError(e instanceof Error?e.message:'Não foi possível conferir a tentativa anterior.');}","catch(e){setLocalBlocked(true);setError(e instanceof Error?e.message:'Não foi possível conferir a tentativa anterior.');}"],
 ["if(lock.current||!offer||!approved||!sessionId||result||offer.unresolved||q.error)return;","if(lock.current||localBlocked||!offer||!approved||!sessionId||result||offer.unresolved||q.error)return;"],
 ['disabled={busy||!approved||!sessionId||Boolean(offer.unresolved)}','disabled={busy||localBlocked||!approved||!sessionId||Boolean(offer.unresolved)}'],
]);
for(const[path,s]of plans)fs.writeFileSync(new URL(path,root),s);
console.log(`[Receipt dispatch] ${plans.length} source files integrated. Explicit approval and caller-scoped cache; no document or message created by build.`);
