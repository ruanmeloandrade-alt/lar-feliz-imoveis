/**
 * Gateway client-side para o módulo de Pedidos original da Vanessa Simoni.
 * GitHub Pages não executa createServerFn. Supabase aplica RLS por workspace.
 */
import { supabase } from "@/integrations/supabase/client";
import {createSlimUiContact} from "./slim-contact-route.functions";
import type { DbCatalog, DbProduct } from "@/lib/products.functions";
import { productDetailsFromRow } from "@/lib/product-import-details";

const sb = supabase as any;
type Row = Record<string, any>;
async function scope(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sua sessão expirou. Entre novamente na Vanessa Simoni.");
  const { data: profile, error: profileError } = await sb.from("profiles")
    .select("current_workspace_id").eq("id", data.user.id).maybeSingle();
  if (profileError) throw new Error(profileError.message);
  const ws = profile?.current_workspace_id as string | undefined;
  if (!ws) throw new Error("Workspace ativo não encontrado.");
  const { data: member, error: memberError } = await sb.from("workspace_members")
    .select("id").eq("workspace_id", ws).eq("user_id", data.user.id).maybeSingle();
  if (memberError || !member) throw new Error("Usuário sem permissão para este workspace.");
  return ws;
}
function result(res: { error: { message: string } | null; data: any }): Row[] {
  if (res.error) throw new Error(res.error.message);
  return Array.isArray(res.data) ? res.data : [];
}

export async function listSaudeSlimLeads(): Promise<{ leads: Array<{ id: string; name: string; email: string | null; phone: string | null }> }> {
  const ws = await scope();
  const rows = result(await sb.from("leads").select("id,name,email,phone")
    .eq("workspace_id", ws).eq("status","active").order("updated_at",{ascending:false}).limit(500));
  return { leads: rows.map((l)=>({id:l.id,name:l.name,email:l.email,phone:l.phone})) };
}

export async function listSaudeSlimCatalogs(): Promise<DbCatalog[]> {
  const ws = await scope();
  const [cr,pr] = await Promise.all([
    sb.from("product_catalogs").select("id,name,description,cover")
      .eq("workspace_id",ws).order("created_at"),
    sb.from("products").select("id,catalog_id,name,sku,description,image,price,promo_price,stock,category,active,cost_price,minimum_stock,unit,stock_known,import_snapshot,public_property")
      .eq("workspace_id",ws).order("created_at"),
  ]);
  const catalogs = result(cr);
  const products = result(pr);
  return catalogs.map((cat):DbCatalog=>({
    id:cat.id,name:cat.name,description:cat.description??"",cover:cat.cover??"",
    products:products.filter(p=>p.catalog_id===cat.id).map((p):DbProduct=>({
      ...productDetailsFromRow(p),
      id:p.id,catalogId:p.catalog_id,name:p.name,sku:p.sku??"",
      description:p.description??"",image:p.image??"",price:Number(p.price??0),
      promoPrice:p.promo_price==null?undefined:Number(p.promo_price),
      stock:Number(p.stock??0),category:p.category??"",active:!!p.active
    }))
  }));
}

export async function listSaudeSlimSources(): Promise<{ sources: Array<{id:string;display_name:string;is_default:boolean}> }> {
  const ws = await scope();
  const data = result(await sb.from("crm_sources").select("id,display_name,is_default")
    .eq("workspace_id",ws).order("is_default",{ascending:false}));
  return {sources:data.map(s=>({id:s.id,display_name:s.display_name,is_default:!!s.is_default}))};
}

export async function listSaudeSlimPipelineStages(): Promise<{pipelines: Array<{id:string;name:string;stages:Array<{id:string;name:string}>}>}> {
  const ws = await scope();
  const [pr,sr]=await Promise.all([
    sb.from("pipelines").select("id,name").eq("workspace_id",ws).order("position"),
    sb.from("pipeline_stages").select("id,name,pipeline_id,position").eq("workspace_id",ws).order("position")
  ]);
  const pipelines=result(pr),stages=result(sr);
  return {pipelines:pipelines.map(p=>({id:p.id,name:p.name,stages:stages
    .filter(s=>s.pipeline_id===p.id).map(s=>({id:s.id,name:s.name}))}))};
}

export async function createSaudeSlimSource({data}:{data:{name:string}}):Promise<{sourceId:string}> {
  const ws=await scope(),name=data.name.trim();
  if(!name)throw new Error("Informe o nome da origem.");
  const { data:created,error } =await sb.from("crm_sources").insert({
    workspace_id:ws,provider:"manual",display_name:name,is_default:false
  }).select("id").single();
  if(error)throw new Error(error.message);
  return {sourceId:created.id};
}

export async function createSaudeSlimProduct({data}:{
  data:{catalogId:string;sku:string;name:string;description:string;image:string;
  price:number;promoPrice:number|null;stock:number;category:string;active:boolean}
}):Promise<{id:string}> {
  const ws=await scope();
  const {data:catalog,error:catalogError}=await sb.from("product_catalogs")
    .select("id").eq("workspace_id",ws).eq("id",data.catalogId).maybeSingle();
  if(catalogError||!catalog)throw new Error("Catálogo não autorizado.");
  const {data:created,error}=await sb.from("products").insert({
    workspace_id:ws,catalog_id:data.catalogId,sku:data.sku,name:data.name,
    description:data.description,image:data.image,price:data.price,
    promo_price:data.promoPrice,stock:data.stock,category:data.category,active:data.active
  }).select("id").single();
  if(error)throw new Error(error.message);
  return {id:created.id};
}

export async function createSaudeSlimLead({data}:{
  data:{crmSourceId:string;pipelineId:string;stageId:string;name:string;
    email:string;phone:string;address:string;value:number;
    instagramHandle:string;facebookUrl:string}
}):Promise<{id:string}> {
  const ws=await scope();
  const created=await createSlimUiContact({data:{workspaceId:ws,payload:{
    crm_source_id:data.crmSourceId,pipeline_id:data.pipelineId,stage_id:data.stageId,
    name:data.name.trim(),email:data.email||null,phone:data.phone||null,value:data.value,
    source:'cadastro_manual_saude_slim',custom_data:data.address?{endereco:data.address}:{}
  }}});
  if(!created.created)throw new Error('Este telefone já possui um contato. Use o cadastro existente; nenhuma duplicata foi criada.');
  return {id:created.id};
}

export async function addSaudeSlimOrderProduct(input:{
 leadId:string;productId:string;unitPrice:number
}):Promise<void>{
  const ws=await scope();
  const {error}=await sb.from("lead_products").insert({
    workspace_id:ws,lead_id:input.leadId,product_id:input.productId,kind:"comprou",
    quantity:1,unit_price:input.unitPrice,sold_at:new Date().toISOString()
  });
  if(error)throw new Error(error.message);
}

// SLIM_CONTACT_IDENTITY_V1
