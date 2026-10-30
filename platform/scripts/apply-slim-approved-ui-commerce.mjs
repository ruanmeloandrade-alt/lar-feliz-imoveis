import fs from 'node:fs';
const root=new URL('../',import.meta.url),MARK='// SLIM_APPROVED_UI_COMMERCE_V1';const plans=[];
function edit(file,run){let code=fs.readFileSync(new URL(file,root),'utf8');if(code.startsWith(MARK))return;
 const once=(a,b)=>{const n=code.split(a).length-1;if(n!==1)throw new Error(`${file}: expected one anchor (${n}): ${a.slice(0,90)}`);code=code.replace(a,()=>b);};
 const all=(a,b,n)=>{const hits=code.split(a).length-1;if(hits!==n)throw new Error(`${file}: expected ${n} anchors, got ${hits}: ${a.slice(0,80)}`);code=code.split(a).join(b);};
 const block=(start,end,replacement)=>{const a=code.indexOf(start),b=code.indexOf(end,a+start.length);if(a<0||b<0)throw new Error(`${file}: missing block ${start}`);code=code.slice(0,a)+replacement+code.slice(b);};
 run({once,all,block,get:()=>code});plans.push([file,MARK+'\n'+code]);}
for(const [file,name,surface] of [['dialog','DialogPrimitive','dialog'],['sheet','SheetPrimitive','sheet'],['drawer','DrawerPrimitive','drawer'],['alert-dialog','AlertDialogPrimitive','alert-dialog']]){
 edit(`src/components/ui/${file}.tsx`,({once,get})=>{
  once(`<${name}.Overlay\n`,`<${name}.Overlay data-slim-layer="overlay"\n`);
  const a=get().includes(`<${name}.Content\n`)?`<${name}.Content\n`:`<${name}.Content `;
  once(a,`<${name}.Content data-slim-layer="modal" data-slim-surface="${surface}"${a.endsWith('\n')?'\n':' '}`);
  if(file==='sheet')once('<span className="sr-only">Close</span>','<span className="sr-only">Fechar</span>');
 });
}
edit('src/components/ui/select.tsx',({once})=>once('<SelectPrimitive.Content\n','<SelectPrimitive.Content data-slim-layer="floating"\n'));
edit('src/routes/crm.agente-ia.tsx',({once})=>once('min-w-0 w-full flex-1 space-y-6 p-6 md:ml-[272px]','min-w-0 flex-1 space-y-6 p-4 md:p-6'));
edit('src/legacy/crm.produtos.legacy.tsx',({once,all})=>{
 once('import { formatBRL } from "@/lib/crm-mock";','import { formatSlimBRL as formatBRL, validateProductMoney } from "@/lib/slim-money.core";');
 once('  const [form, setForm] = useState<Product>(product);',`  const [form, setForm] = useState<Product>(product);
  const [priceDraft,setPriceDraft]=useState(String(product.price).replace(".",","));
  const [promoDraft,setPromoDraft]=useState(product.promoPrice==null?"":String(product.promoPrice).replace(".",","));
  const money=useMemo(()=>validateProductMoney(priceDraft,promoDraft),[priceDraft,promoDraft]);
  const [saving,setSaving]=useState(false);
  async function saveValidated(){if(saving||money.error)return;setSaving(true);try{await onSave({...form,price:money.price,promoPrice:money.promoPrice});}finally{setSaving(false);}}`);
 once('onSave: (p: Product) => void;','onSave: (p: Product) => void | Promise<void>;');
 once('                type="number"\n                min={0}\n                value={form.price || ""}\n                onChange={(e) => update("price", Number(e.target.value))}',
'                type="text"\n                inputMode="decimal"\n                value={priceDraft}\n                aria-invalid={!!money.error}\n                onChange={(e) => setPriceDraft(e.target.value)}');
 once('                type="number"\n                min={0}\n                value={form.promoPrice ?? ""}\n                onChange={(e) =>\n                  update("promoPrice", e.target.value ? Number(e.target.value) : undefined)\n                }',
'                type="text"\n                inputMode="decimal"\n                value={promoDraft}\n                aria-invalid={!!money.error}\n                onChange={(e) => setPromoDraft(e.target.value)}');
 once('          {form.promoPrice && form.promoPrice >= form.price && (','          {money.error && (');
 once('              O valor promocional deve ser menor que o valor padrão.','              {money.error}');
 once('disabled={!form.name.trim() || !form.price}','disabled={saving || !form.name.trim() || !!money.error}');
 once('onClick={() => onSave(form)}','onClick={saveValidated}');
 once('<Box className="h-3.5 w-3.5" /> Salvar produto','<Box className="h-3.5 w-3.5" /> {saving ? "Salvando..." : "Salvar produto"}');
 once('p.promoPrice && p.promoPrice < p.price','p.promoPrice != null && p.promoPrice < p.price');
 // Custom product panels predate Radix. Lift their full wrapper, not only its content.
 all('className="fixed inset-0 z-50 flex','data-slim-layer="modal" className="fixed inset-0 z-50 flex',3);
});
edit('src/lib/saude-slim-products-client.ts',({once})=>{
 once('const sb = supabase as any;','import {decimalMoney} from "@/lib/slim-money.core";\nconst sb = supabase as any;');
 once('price: Math.max(0, Number(data.price ?? 0)),','price: decimalMoney(data.price),');
 once('promo_price: data.promoPrice == null ? null : Math.max(0, Number(data.promoPrice)),','promo_price: data.promoPrice == null ? null : decimalMoney(data.promoPrice),');
 once('image: product.image ?? "", price: Number(product.price ?? 0),','image: product.image ?? "", price: decimalMoney(product.price),');
 once('promo_price: product.promoPrice ?? null,','promo_price: product.promoPrice == null ? null : decimalMoney(product.promoPrice),');
});
edit('src/lib/companies.functions.ts',({once,block})=>{
 once('import { createServerFn }','import {requireActiveWorkspace} from "@/lib/workspace-resolver.server";\nimport {resolveSlimCompanySource} from "@/lib/slim-company-source.core";\nimport { createServerFn }');
 block('async function activeWorkspace(', 'async function signLogo(',`async function activeWorkspace(sb:AnySb,userId:string):Promise<string>{return requireActiveWorkspace(sb,userId,{createIfMissing:false});}\n\n`);
 once('const crmSourceId = await defaultMktonSourceId(sb, wsId);','const crmSourceId = await resolveSlimCompanySource(sb, wsId);');
 once('name: z.string().min(1).max(120),','name: z.string().trim().min(1).max(120),');
 once('name: z.string().min(1).max(120).optional(),','name: z.string().trim().min(1).max(120).optional(),');
 once('    const { error } = await sb.from("companies").update(patch).eq("id", data.companyId).eq("workspace_id", wsId);\n    if (error) throw new Error(error.message);',
'    const { data: saved, error } = await sb.from("companies").update(patch).eq("id", data.companyId).eq("workspace_id", wsId).select("id").maybeSingle();\n    if (error) throw new Error(error.message);\n    if (!saved) throw new Error("Fornecedor não encontrado nesta operação Saúde Slim.");');
});
edit('src/lib/suppliers.functions.ts',({once,block})=>{
 once('import { createServerFn }','import {requireActiveWorkspace} from "@/lib/workspace-resolver.server";\nimport {decimalMoney} from "@/lib/slim-money.core";\nimport { createServerFn }');
 block('async function activeWorkspace(', 'export type SupplierProductCost', 'async function activeWorkspace(sb:AnySb,userId:string):Promise<string>{return requireActiveWorkspace(sb,userId,{createIfMissing:false});}\n\n');
 once('if (String(error.message ?? "").includes("supplier_product_costs")) return { rows: [], setupRequired: true };','if (["42P01","PGRST205"].includes(error.code)) return { rows: [], setupRequired: true };');
 once('      cost: data.cost,','      cost: decimalMoney(data.cost,999999999999),');
 once('    const patch = {',`    const [supplier,product]=await Promise.all([
      sb.from("companies").select("id").eq("id",data.supplierId).eq("workspace_id",wsId).maybeSingle(),
      sb.from("products").select("id").eq("id",data.productId).eq("workspace_id",wsId).maybeSingle(),
    ]);
    if(supplier.error||product.error)throw new Error("Não foi possível validar fornecedor e produto.");
    if(!supplier.data||!product.data)throw new Error("Fornecedor e produto precisam pertencer à operação Saúde Slim.");
    const patch = {`);
 once('      const { error } = await sb\n        .from("supplier_product_costs")','      const { data: saved, error } = await sb\n        .from("supplier_product_costs")');
 once('        .eq("workspace_id", wsId);\n      if (error) throw new Error(error.message);\n      return { id: data.id };','        .eq("workspace_id", wsId).select("id").maybeSingle();\n      if (error) throw new Error(error.message);\n      if (!saved) throw new Error("Custo não encontrado nesta operação Saúde Slim.");\n      return { id: saved.id };');
});
// Validate all anchors before writing any file. Do not run SQL or external services here.
for(const [file,code] of plans)fs.writeFileSync(new URL(file,root),code);
console.log(`[Slim approved] ${plans.length} source files transformed; sidebar, routes and external connections preserved.`);
