import {createServerFn} from '@tanstack/react-start';
import {z} from 'zod';
import {requireSupabaseAuth} from '@/integrations/supabase/auth-middleware';
import {assertErpContext} from '@/lib/slim-erp-release.core';
import {buildStockCatalog,buildStockMovements,readStockRows} from '@/lib/slim-stock-view.core';
const input=z.object({workspaceId:z.string().uuid()}).strict();
async function authorize(context:any,expected:string){
 const sb=context.supabase;
 const p=await sb.from('profiles').select('current_workspace_id').eq('id',context.userId).maybeSingle();
 if(p.error||p.data?.current_workspace_id!==expected)throw new Error('A empresa ativa mudou ou não pôde ser confirmada. Reabra o estoque.');
 const [w,m]=await Promise.all([sb.from('workspaces').select('owner_id').eq('id',expected).maybeSingle(),sb.from('workspace_members').select('user_id,access_expires_at').eq('workspace_id',expected).eq('user_id',context.userId).maybeSingle()]);
 if(w.error||m.error)throw new Error('Não foi possível verificar o acesso ao estoque.');
 assertErpContext(expected,p.data.current_workspace_id,context.userId,w.data?.owner_id??null,m.data);return sb;
}
export const getSlimStockCatalog=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>input.parse(x)).handler(async({data,context})=>{
 const sb=await authorize(context,data.workspaceId);
 const [products,catalogs]=await Promise.all([
  readStockRows(sb,data.workspaceId,'products','id,workspace_id,catalog_id,name,sku,category,price,promo_price,stock,active,stock_known,minimum_stock'),
  readStockRows(sb,data.workspaceId,'product_catalogs','id,workspace_id,name'),
 ]);return buildStockCatalog(data.workspaceId,products,catalogs);
});
export const getSlimStockMovements=createServerFn({method:'POST'}).middleware([requireSupabaseAuth]).inputValidator((x:unknown)=>input.parse(x)).handler(async({data,context})=>{
 const sb=await authorize(context,data.workspaceId);
 const rows=await readStockRows(sb,data.workspaceId,'slim_stock_movements','id,workspace_id,order_id,product_id,kind,quantity,balance_after,created_at');
 // Empty movements are legitimate. Do not re-download every order in that case.
 const orders=rows.length?await readStockRows(sb,data.workspaceId,'slim_orders','id,workspace_id,snapshot'):[];
 return buildStockMovements(data.workspaceId,rows,orders);
});
