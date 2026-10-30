import {createFileRoute} from '@tanstack/react-router';
import {z} from 'zod';
import type {IngestFormRow,FormValues} from '@/lib/forms-ingest.server';

const workspace='2a0e0d29-4e23-47e6-bd9f-30aa8e15e698';
const optional=(max=200)=>z.string().trim().max(max).nullable().optional();
const money=z.number().finite().nonnegative().max(1e12).nullable().optional();
const schema=z.object({nome:z.string().trim().min(2).max(120),whatsapp:z.string().trim().min(8).max(30),email:optional(),renda:money,entrada:money,tipo_trabalho:optional(),fgts:optional(),cpf_limpo:optional(),possui_imovel:optional(),cidade:optional(120),faixa:optional(),subsidio_resultado:optional(),produto_interesse:optional(),observacoes:optional(2000)}).strict();

export const Route=createFileRoute('/api/public/vanessa-lead')({server:{handlers:{POST:async({request})=>{
  try{
    const {supabaseAdmin}=await import('@/integrations/supabase/client.server');
    const {ingestFormSubmission}=await import('@/lib/forms-ingest.server');
    const origin=request.headers.get('origin');
    const allowedOrigins=new Set([process.env.PUBLIC_APP_URL,process.env.APP_PUBLIC_URL,'https://www.corretoravanessasimoni.com'].filter(Boolean).map(value=>new URL(value!).origin));
    if(origin&&!allowedOrigins.has(new URL(origin).origin))return Response.json({error:{message:'Origem nao autorizada.'}},{status:403});
    if(!/^application\/json(?:;|$)/i.test(request.headers.get('content-type')??''))return Response.json({error:{message:'Formato invalido.'}},{status:415});
    const raw=await request.text();if(raw.length>65536)return Response.json({error:{message:'Requisicao muito grande.'}},{status:413});
    const payload=schema.parse(JSON.parse(raw));
    const {data:form,error}=await supabaseAdmin.from('crm_forms').select('id,workspace_id,nome,campos,auto_criar_lead').eq('workspace_id',workspace).eq('slug','vanessa-pre-analise').single();
    if(error||!form)throw Error('Formulario indisponivel.');
    await ingestFormSubmission(supabaseAdmin,{form:form as unknown as IngestFormRow,values:Object.fromEntries(Object.entries(payload).filter(([,v])=>v!==undefined)) as FormValues,source:'externo'});
    return Response.json({data:[],error:null},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){const invalid=error instanceof z.ZodError||error instanceof SyntaxError;return Response.json({data:null,error:{message:invalid?'Confira os dados do formulario.':'Nao foi possivel enviar a ficha. Tente novamente.'}},{status:invalid?400:503,headers:{'Cache-Control':'no-store'}});}
}}}});
