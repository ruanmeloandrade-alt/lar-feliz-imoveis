/** Deterministic, dependency-free commercial PDF. Not a fiscal issuer or a DANFE. */
import {Buffer} from 'node:buffer';
import {formatCheckoutCents, verifyCheckoutReceipt, type CheckoutQuote, type ConfirmedCheckout} from './slim-checkout.core.ts';
import {normalizeCheckoutDelivery} from './slim-checkout-delivery.core.ts';
const CP1252:Record<number,number>={8364:128,8218:130,402:131,8222:132,8230:133,8224:134,8225:135,710:136,8240:137,352:138,8249:139,338:140,381:142,8216:145,8217:146,8220:147,8221:148,8226:149,8211:150,8212:151,732:152,8482:153,353:154,8250:155,339:156,382:158,376:159};
function clean(v:string){return v.normalize('NFC').replace(/[\r\n\t]+/g,' ').replace(/[\x00-\x1f\x7f]/g,'').trim();}
function text(v:string){
  let encoded='';
  for(const c of clean(v)){
    const n=c.codePointAt(0)!;const byte=n<256?n:CP1252[n];
    if(byte===undefined)throw new Error('O documento contém um caractere não suportado por esta fonte. A geração foi interrompida sem omitir dados.');
    encoded+=`\\${byte.toString(8).padStart(3,'0')}`;
  }
  return `(${encoded})`;
}
function wrap(v:string,width=84):string[]{
  const words=clean(v).split(/\s+/);const lines:string[]=[];let line='';
  for(let word of words){
    if(line&&line.length+1+word.length>width){lines.push(line);line='';}
    while(word.length>width){if(line){lines.push(line);line='';}lines.push(word.slice(0,width));word=word.slice(width);}
    if(word)line+=(line?' ':'')+word;
  }
  if(line)lines.push(line);return lines.length?lines:[''];
}
const METHODS:Record<string,string>={pix:'PIX',cash:'Dinheiro',debit_card:'Cartão de débito',credit_card:'Cartão de crédito',bank_transfer:'Transferência bancária',boleto:'Boleto',other:'Outra forma informada'};
export function buildSlimOrderReceiptPdf(input:{quote:CheckoutQuote;receipt:ConfirmedCheckout;issuer:{name:string;legalName?:string;document?:string};customer:{name:string;email?:string;phone?:string};createdAt:string}):Uint8Array{
  const {quote:q,receipt:r,issuer,customer}=input;
  verifyCheckoutReceipt(q,r.requestId,r);
  if(!issuer.name.trim()||!customer.name.trim()||!METHODS[q.payment.method])throw new Error('Documento sem identificação obrigatória.');
  const created=new Date(input.createdAt);if(!Number.isFinite(created.getTime()))throw new Error('Data do pedido inválida.');
  if(!q.items.length||q.items.length>100)throw new Error('Quantidade de itens inválida.');
  const totals=q.items.reduce((a,i)=>{
    for(const n of [i.quantity,i.unitPriceCents,i.subtotalCents,i.discountCents,i.totalCents])if(!Number.isSafeInteger(n)||n<0)throw new Error('Valor inválido no documento.');
    if(i.quantity<1||BigInt(i.quantity)*BigInt(i.unitPriceCents)!==BigInt(i.subtotalCents)||i.subtotalCents-i.discountCents!==i.totalCents)throw new Error('Item inconsistente.');
    return {subtotal:a.subtotal+BigInt(i.subtotalCents),discount:a.discount+BigInt(i.discountCents),total:a.total+BigInt(i.totalCents)};
  },{subtotal:0n,discount:0n,total:0n});
  const delivery=normalizeCheckoutDelivery(q.fulfillment,q.shippingCents);
  const shipping=BigInt(delivery.shippingCents??0);
  for(const value of [q.subtotalCents,q.discountCents,q.totalCents])formatCheckoutCents(value);
  if(totals.subtotal!==BigInt(q.subtotalCents)||totals.discount!==BigInt(q.discountCents)||totals.total+shipping!==BigInt(q.totalCents)||BigInt(q.subtotalCents)-BigInt(q.discountCents)+shipping!==BigInt(q.totalCents))throw new Error('Totais inconsistentes no documento.');
  const lines:string[]=[];const add=(s:string)=>lines.push(...wrap(s));
  add(`Emitente: ${issuer.legalName||issuer.name}`);if(issuer.document)add(`Documento do emitente: ${issuer.document}`);
  add(`Pedido: ${r.number} | Data: ${created.toISOString().slice(0,19).replace('T',' ')} UTC`);
  add(`Identificador: ${r.orderId}`);lines.push('');
  add(`Cliente: ${customer.name}`);if(customer.phone)add(`Telefone: ${customer.phone}`);if(customer.email)add(`E-mail: ${customer.email}`);
  if(delivery.fulfillment){
    const f=delivery.fulfillment;lines.push('');
    add(`Modalidade: ${f.mode==='pickup'?'Retirada':'Entrega'}`);
    if(f.mode==='delivery'){
      add(`Destinatário: ${f.recipient}`);add(`Telefone de entrega: ${f.phone}`);
      add(`Endereço: ${f.street}, ${f.number}${f.complement?` | Complemento: ${f.complement}`:''}`);
      add(`Bairro: ${f.neighborhood} | Cidade: ${f.city} | UF: ${f.state}`);
      add(`CEP: ${f.postalCode.slice(0,5)}-${f.postalCode.slice(5)}`);
      if(f.notes)add(`Observações de entrega: ${f.notes}`);
    }
  }
  lines.push('','ITENS DO PEDIDO','-'.repeat(84));
  q.items.forEach((i,index)=>{
    add(`${index+1}. ${i.name}${i.sku?` | SKU: ${i.sku}`:''}`);
    if(i.description)add(`Descrição: ${i.description}`);
    add(`Quantidade: ${i.quantity} | Unitário: ${formatCheckoutCents(i.unitPriceCents)} | Subtotal: ${formatCheckoutCents(i.subtotalCents)}`);
    add(`Desconto: ${formatCheckoutCents(i.discountCents)} | Total do item: ${formatCheckoutCents(i.totalCents)}`);lines.push('');
  });
  add(`Subtotal: ${formatCheckoutCents(q.subtotalCents)}`);add(`Desconto total: ${formatCheckoutCents(q.discountCents)}`);
  if(delivery.fulfillment)add(`Frete: ${formatCheckoutCents(delivery.shippingCents!)}`);
  add(`TOTAL DO PEDIDO: ${formatCheckoutCents(q.totalCents)}`);lines.push('');
  add(`Forma de pagamento: ${METHODS[q.payment.method]}${q.payment.installments>1?` (${q.payment.installments} parcelas)`:''}`);
  add(q.payment.status==='paid'?'Situação: pagamento informado como recebido pelo operador.':'Situação: pagamento pendente. Este documento não comprova recebimento.');
  if(q.notes){lines.push('');add(`Observações: ${q.notes}`);}
  lines.push('');add('Documento comercial não fiscal. Não substitui nota fiscal autorizada.');
  const pageLines=44;const chunks:string[][]=[];
  for(let i=0;i<lines.length;i+=pageLines)chunks.push(lines.slice(i,i+pageLines));
  const objs:string[]=[];const put=(s:string)=>{objs.push(s);return objs.length;};
  put('<< /Type /Catalog /Pages 2 0 R >>');put('');
  put('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  put('<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>');
  const kids:number[]=[];
  chunks.forEach((chunk,index)=>{
    const pageId=objs.length+1,streamId=pageId+1;kids.push(pageId);
    put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);
    const commands=[`0.06 0.24 0.18 rg BT /F1 20 Tf 44 791 Td ${text(issuer.name.slice(0,44))} Tj ET`,`0.1 0.1 0.1 rg BT /F1 13 Tf 44 766 Td ${text('COMPROVANTE DO PEDIDO')} Tj ET`,`0.4 0.4 0.4 RG 44 752 m 551 752 l S`];
    chunk.forEach((line,row)=>commands.push(`0.12 0.12 0.12 rg BT /F2 9.6 Tf 44 ${730-row*14.2} Td ${text(line)} Tj ET`));
    commands.push(`0.4 0.4 0.4 rg BT /F2 8 Tf 44 42 Td ${text('DOCUMENTO NÃO FISCAL')} Tj ET`,`BT /F2 8 Tf 462 42 Td ${text(`Página ${index+1}/${chunks.length}`)} Tj ET`);
    const content=commands.join('\n')+'\n';put(`<< /Length ${Buffer.byteLength(content,'ascii')} >>\nstream\n${content}endstream`);
  });
  objs[1]=`<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(id=>`${id} 0 R`).join(' ')}] >>`;
  let pdf='%PDF-1.4\n% Slim commercial receipt\n';const offsets=[0];
  objs.forEach((obj,index)=>{offsets.push(Buffer.byteLength(pdf,'ascii'));pdf+=`${index+1} 0 obj\n${obj}\nendobj\n`;});
  const xref=Buffer.byteLength(pdf,'ascii');pdf+=`xref\n0 ${objs.length+1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach(n=>{pdf+=`${String(n).padStart(10,'0')} 00000 n \n`;});
  pdf+=`trailer\n<< /Size ${objs.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(pdf,'ascii'));
}
